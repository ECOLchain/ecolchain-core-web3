import { type Address, address, type Instruction } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Ban, Megaphone, Package, Scale, Undo2 } from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { comContasGravaveis, instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useBalancaTeste } from '../../solana/balancaTeste';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { useCadastro } from '../../solana/useCadastro';
import { gramasParaKg, kgParaGramas, useEntregas, useLotes, useMateriais } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { SoPapel } from '../admin/comum';

const SEM_LOTE = '11111111111111111111111111111111';
/** Limite do programa por transação ao vincular ou devolver lotes de origem. */
const ENTREGAS_POR_TX = 10;
/** Faixa padrão da pesagem do consolidado (ADR 0010), usada enquanto o config estiver zerado. */
const PERDA_PADRAO_BPS = 1_000;
const EXCESSO_PADRAO_BPS = 200;

type Linha = ContaDecodificada<lote.Lote>;
type Entrega = ContaDecodificada<lote.Entrega>;
type Popup =
    | { tipo: 'montar' }
    | { tipo: 'fechar'; linha: Linha }
    | { tipo: 'anunciar'; linha: Linha }
    | { tipo: 'desfazer'; linha: Linha };
/** Faixa aceita do consolidado sobre a soma das origens, em bps. */
type Faixa = { perdaBps: number; excessoBps: number };

export function Lotes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.lotes')} />
            <SoPapel papel="cooperativa" aviso={t('cooperativa.soCooperativa')}>
                <ConteudoLotes />
            </SoPapel>
        </>
    );
}

const brl = (centavos: bigint, idioma: string) =>
    (Number(centavos) / 100).toLocaleString(idioma, { style: 'currency', currency: 'BRL' });

/** Mesma conta do programa: soma × (1 − perda) ≤ peso ≤ soma × (1 + excesso). */
const limites = (somaG: bigint, f: Faixa) => ({
    min: (somaG * BigInt(10_000 - f.perdaBps) + 9_999n) / 10_000n,
    max: (somaG * BigInt(10_000 + f.excessoBps)) / 10_000n,
});

/** Faixa vigente no config do `ecol_lote` (zerada = padrão). */
function useFaixa(): Faixa {
    const client = useClient<AppClient>();
    const fonte = useCallback(async () => lote.fetchGlobalConfig(client.rpc, await pLote.config()), [client]);
    const cfg = useRequest(fonte).data?.data;
    return {
        perdaBps: cfg?.perdaMontagemBps || PERDA_PADRAO_BPS,
        excessoBps: cfg?.excessoMontagemBps || EXCESSO_PADRAO_BPS,
    };
}

function ConteudoLotes() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { carteira } = useCadastro();
    const cooperativa = carteira ? address(carteira) : undefined;
    const { balanca } = useBalancaTeste(cooperativa);
    const materiais = useMateriais();
    const entregas = useEntregas(cooperativa);
    const lotes = useLotes(cooperativa);
    const faixa = useFaixa();
    const envio = useEnviar();
    const [popup, setPopup] = useState<Popup | null>(null);
    const [progresso, setProgresso] = useState<string | null>(null);
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroMaterial, setFiltroMaterial] = useState('');

    const nomeMaterial = useMemo(
        () => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])),
        [materiais.data],
    );
    const estados = useMemo(() => [...new Set((lotes.data ?? []).map((l) => l.dados.estado.__kind))].sort(), [lotes.data]);

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-20' },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => nomeMaterial.get(l.dados.material) ?? String(l.dados.material) },
            {
                id: 'peso',
                titulo: t('cooperativa.pesoKg'),
                largura: 'w-32',
                valor: (l) => l.dados.pesoG,
                // Em montagem ainda não há pesagem do consolidado.
                celula: (l) => (l.dados.pesoG > 0n ? gramasParaKg(l.dados.pesoG, idioma) : '—'),
                numerica: true,
            },
            {
                id: 'entregas',
                titulo: t('cooperativa.lotes.entregas'),
                largura: 'w-60',
                valor: (l) => l.dados.qtdEntregas,
                celula: (l) => {
                    const { qtdEntregas, pesoEntregasG, pesoSemColetorG } = l.dados;
                    const pct = pesoEntregasG > 0n ? Number((pesoSemColetorG * 100n) / pesoEntregasG) : 0;
                    return (
                        <span className="text-texto-suave">
                            {qtdEntregas} ({gramasParaKg(pesoEntregasG, idioma)} kg)
                            {pct > 0 && <span className="ml-1.5 text-kraft">{t('cooperativa.lotes.semColetor', { pct })}</span>}
                        </span>
                    );
                },
                numerica: true,
            },
            {
                id: 'estado',
                titulo: t('cooperativa.lotes.estado'),
                valor: (l) => t(`estadoLote.${l.dados.estado.__kind}`),
                celula: (l) => (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="inline-flex rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs font-semibold text-texto">
                            {t(`estadoLote.${l.dados.estado.__kind}`)}
                        </span>
                        {l.dados.estado.__kind === 'Anunciado' && (
                            <span className="text-xs text-texto-suave">
                                {t('cooperativa.lotes.ate', {
                                    data: new Date(Number(l.dados.estado.prazoLeilao) * 1000).toLocaleDateString(idioma),
                                    preco: brl(l.dados.precoMinimoCentavos, idioma),
                                })}
                            </span>
                        )}
                    </span>
                ),
            },
        ],
        [t, idioma, nomeMaterial],
    );
    const filtro = useMemo(
        () => (l: Linha) =>
            (filtroEstado === '' || l.dados.estado.__kind === filtroEstado) &&
            (filtroMaterial === '' || String(l.dados.material) === filtroMaterial),
        [filtroEstado, filtroMaterial],
    );
    const grade = useGrade(lotes.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });
    const sel = grade.selecionada;
    const estadoSel = sel?.dados.estado.__kind;
    const podeAnunciar = (estadoSel === 'Criado' || estadoSel === 'SemLance') && !!sel && sel.dados.qtdEntregas > 0;
    const podeDesfazer = ['EmMontagem', 'Criado', 'SemLance', 'EmDesmontagem'].includes(estadoSel ?? '');

    const abrir = (p: Popup) => {
        envio.reset();
        setPopup(p);
    };
    const recarregar = () => {
        entregas.refresh();
        lotes.refresh();
    };

    /** Pesagem do consolidado, assinada pela balança, + fechamento. */
    const ixsFechar = async (lotePda: Address, pesoG: bigint, loteId: bigint) => {
        if (!balanca || !cooperativa) throw new Error('sem balança');
        const ts = BigInt(Math.floor(Date.now() / 1000));
        return [
            await instrucaoPesagem(balanca, TipoPesagem.Origem, lotePda, pesoG, ts),
            await lote.getCooperativaFecharLoteInstructionAsync({
                payer: client.payer,
                cooperativa: client.payer,
                balanca: await pLote.balanca(balanca.address),
                lote: lotePda,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                pesoG,
                tsPesagem: ts,
                // Metadados do recibo (Core asset); na devnet, um endereço de referência.
                uri: `https://ecolchain.dev/lotes/${cooperativa}/${loteId}.json`,
            }),
        ];
    };

    /** Abre o lote de venda, vincula as origens (até 10 por transação) e fecha com a pesagem. */
    const montar = async (material: number, escolhidas: Entrega[], pesoG: bigint, evidencias: string) => {
        if (!balanca || !cooperativa) return;
        const loteId = (lotes.data ?? []).reduce((m, x) => (x.dados.loteId > m ? x.dados.loteId : m), 0n) + 1n;
        const lotePda = await pLote.lote(cooperativa, loteId);
        const ev = await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
        const hash = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidencias || `lote:${cooperativa}:${loteId}`)),
        );
        const grupos: Address[][] = [];
        for (let i = 0; i < escolhidas.length; i += ENTREGAS_POR_TX) {
            grupos.push(escolhidas.slice(i, i + ENTREGAS_POR_TX).map((e) => e.endereco));
        }
        const total = grupos.length + 2;
        try {
            setProgresso(t('cooperativa.lotes.passo', { n: 1, total }));
            await envio.dispatchAsync([
                await lote.getCooperativaCreateLoteInstructionAsync({
                    payer: client.payer,
                    cooperativa: client.payer,
                    materialCadastro: await pLote.material(material),
                    lote: lotePda,
                    eventAuthority: ev,
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    loteId,
                    material,
                    evidenciasHash: hash,
                }),
            ]);
            for (const [i, grupo] of grupos.entries()) {
                setProgresso(t('cooperativa.lotes.passo', { n: i + 2, total }));
                const ix: Instruction = comContasGravaveis(
                    await lote.getCooperativaAddEntregasInstructionAsync({
                        cooperativa: client.payer,
                        lote: lotePda,
                        eventAuthority: ev,
                        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    }),
                    grupo,
                );
                await envio.dispatchAsync([ix]);
            }
            setProgresso(t('cooperativa.lotes.passo', { n: total, total }));
            await envio.dispatchAsync(await ixsFechar(lotePda, pesoG, loteId));
            setPopup(null);
        } catch {
            // o erro fica em envio.error; um lote que parou em montagem pode ser fechado ou desfeito depois
        } finally {
            setProgresso(null);
            recarregar();
        }
    };

    const fechar = async (l: Linha, pesoG: bigint) => {
        try {
            await envio.dispatchAsync(await ixsFechar(l.endereco, pesoG, l.dados.loteId));
            setPopup(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    /** Devolve as origens do lote em grupos de 10; a última transação conclui (Desfeito). */
    const desfazer = async (l: Linha) => {
        const minhas = (entregas.data ?? []).filter((e) => e.dados.lote === l.endereco).map((e) => e.endereco);
        const grupos: Address[][] = [];
        for (let i = 0; i < minhas.length; i += ENTREGAS_POR_TX) grupos.push(minhas.slice(i, i + ENTREGAS_POR_TX));
        if (grupos.length === 0) grupos.push([]);
        try {
            for (const [i, grupo] of grupos.entries()) {
                setProgresso(t('cooperativa.lotes.passo', { n: i + 1, total: grupos.length }));
                const ix: Instruction = comContasGravaveis(
                    await lote.getCooperativaDesmontarLoteInstructionAsync({
                        payer: client.payer,
                        cooperativa: client.payer,
                        lote: l.endereco,
                        eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    }),
                    grupo,
                );
                await envio.dispatchAsync([ix]);
            }
            setPopup(null);
        } catch {
            // o erro fica em envio.error; desfazer de novo continua de onde parou
        } finally {
            setProgresso(null);
            recarregar();
        }
    };

    const acaoLote = async (montarIx: () => Promise<Instruction>) => {
        try {
            await envio.dispatchAsync([await montarIx()]);
            setPopup(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />}

            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('cooperativa.material')}
                            valor={filtroMaterial}
                            onChange={(v) => {
                                setFiltroMaterial(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('grade.todosMateriais') },
                                ...(materiais.data ?? []).map((m) => ({ valor: String(m.dados.codigo), texto: m.dados.nome })),
                            ]}
                        />
                        <FiltroGrade
                            rotulo={t('cooperativa.lotes.estado')}
                            valor={filtroEstado}
                            onChange={(v) => {
                                setFiltroEstado(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('grade.todosEstados') },
                                ...estados.map((e) => ({ valor: e, texto: t(`estadoLote.${e}`) })),
                            ]}
                        />
                        <AcoesGrade>
                            {estadoSel === 'EmMontagem' && (
                                <Botao compacto variante="secundario" disabled={!balanca} onClick={() => sel && abrir({ tipo: 'fechar', linha: sel })}>
                                    <Scale className="size-4" /> {t('cooperativa.lotes.fechar')}
                                </Botao>
                            )}
                            {estadoSel === 'Anunciado' ? (
                                <Botao
                                    compacto
                                    variante="secundario"
                                    carregando={envio.isRunning && !popup}
                                    onClick={() =>
                                        sel &&
                                        acaoLote(async () =>
                                            lote.getCooperativaCancelAnuncioInstructionAsync({
                                                cooperativa: client.payer,
                                                lote: sel.endereco,
                                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                            }),
                                        )
                                    }
                                >
                                    <Ban className="size-4" /> {t('cooperativa.lotes.cancelarAnuncio')}
                                </Botao>
                            ) : (
                                <Botao
                                    compacto
                                    variante="secundario"
                                    disabled={!podeAnunciar}
                                    onClick={() => sel && abrir({ tipo: 'anunciar', linha: sel })}
                                >
                                    <Megaphone className="size-4" /> {t('cooperativa.lotes.anunciar')}
                                </Botao>
                            )}
                            <Botao
                                compacto
                                variante="secundario"
                                disabled={!podeDesfazer}
                                onClick={() => sel && abrir({ tipo: 'desfazer', linha: sel })}
                            >
                                <Undo2 className="size-4" /> {t('cooperativa.lotes.desfazer')}
                            </Botao>
                            <Botao compacto onClick={() => abrir({ tipo: 'montar' })}>
                                <Package className="size-4" /> {t('cooperativa.lotes.montar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    vazio={t('cooperativa.lotes.vazio')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => {
                        const e = l.dados.estado.__kind;
                        if (e === 'EmMontagem') abrir({ tipo: 'fechar', linha: l });
                        else if ((e === 'Criado' || e === 'SemLance') && l.dados.qtdEntregas > 0) abrir({ tipo: 'anunciar', linha: l });
                    }}
                />
            </CartaoGrade>

            {popup?.tipo === 'montar' && (
                <DialogoMontar
                    semBalanca={!balanca}
                    faixa={faixa}
                    materiais={(materiais.data ?? []).filter((m) => m.dados.ativo)}
                    entregas={(entregas.data ?? []).filter((e) => e.dados.lote === SEM_LOTE)}
                    salvando={envio.isRunning}
                    progresso={progresso}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={montar}
                />
            )}
            {popup?.tipo === 'fechar' && (
                <DialogoFechar
                    linha={popup.linha}
                    nomeMaterial={nomeMaterial.get(popup.linha.dados.material) ?? ''}
                    faixa={faixa}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={(pesoG) => fechar(popup.linha, pesoG)}
                />
            )}
            {popup?.tipo === 'desfazer' && (
                <Dialogo
                    titulo={t('cooperativa.lotes.desfazerTitulo', { id: popup.linha.dados.loteId.toString() })}
                    subtitulo={progresso ?? undefined}
                    formId="form-desfazer"
                    salvando={envio.isRunning}
                    rotuloSalvar={t('cooperativa.lotes.desfazerConfirmar')}
                    iconeSalvar={Undo2}
                    aoFechar={() => setPopup(null)}
                >
                    <form
                        id="form-desfazer"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void desfazer(popup.linha);
                        }}
                        className="flex flex-col gap-4"
                    >
                        <Resultado erro={envio.error} sucesso="" />
                        <p className="text-sm text-texto">
                            {t('cooperativa.lotes.desfazerTexto', { n: popup.linha.dados.qtdEntregas })}
                        </p>
                    </form>
                </Dialogo>
            )}
            {popup?.tipo === 'anunciar' && (
                <DialogoAnunciar
                    linha={popup.linha}
                    nomeMaterial={nomeMaterial.get(popup.linha.dados.material) ?? ''}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={(centavos, dias) =>
                        acaoLote(async () =>
                            lote.getCooperativaListLoteInstructionAsync({
                                cooperativa: client.payer,
                                lote: popup.linha.endereco,
                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                prazoLeilao: BigInt(Math.floor(Date.now() / 1000) + dias * 86_400),
                                precoMinimoCentavos: BigInt(centavos),
                            }),
                        )
                    }
                />
            )}
        </div>
    );
}

/** Campo do peso do consolidado: vazio = soma das origens; fora da faixa, avisa e bloqueia. */
function usePesoConsolidado(somaG: bigint, faixa: Faixa) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const [texto, setTexto] = useState('');
    const { min, max } = limites(somaG, faixa);
    const pesoG = texto ? kgParaGramas(texto) : somaG > 0n ? somaG : null;
    const naFaixa = pesoG !== null && pesoG >= min && pesoG <= max;
    const kg = { min: gramasParaKg(min, idioma), max: gramasParaKg(max, idioma) };
    const campo = (
        <Campo
            rotulo={t('cooperativa.lotes.pesoFardo')}
            inputMode="decimal"
            value={texto}
            placeholder={gramasParaKg(somaG, idioma)}
            aria-invalid={!!texto && !naFaixa}
            ajuda={t(texto && !naFaixa ? 'cooperativa.lotes.foraDaFaixa' : 'cooperativa.lotes.pesoFardoAjuda', kg)}
            onChange={(e) => setTexto(e.target.value)}
        />
    );
    return { pesoG: naFaixa ? pesoG : null, campo };
}

function DialogoMontar({
    semBalanca,
    faixa,
    materiais,
    entregas,
    salvando,
    progresso,
    erro,
    aoFechar,
    aoSalvar,
}: {
    semBalanca: boolean;
    faixa: Faixa;
    materiais: ContaDecodificada<lote.Material>[];
    entregas: Entrega[];
    salvando: boolean;
    progresso: string | null;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (material: number, escolhidas: Entrega[], pesoG: bigint, evidencias: string) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const [material, setMaterial] = useState('');
    const [marcadas, setMarcadas] = useState<Set<Address>>(new Set());
    const [evidencias, setEvidencias] = useState('');
    const disponiveis = useMemo(
        () =>
            entregas
                .filter((e) => String(e.dados.material) === material)
                .sort((a, b) => (a.dados.entregaId < b.dados.entregaId ? -1 : 1)),
        [entregas, material],
    );
    const escolhidas = disponiveis.filter((e) => marcadas.has(e.endereco));
    const soma = escolhidas.reduce((a, e) => a + e.dados.pesoG, 0n);
    const { pesoG, campo } = usePesoConsolidado(soma, faixa);
    const todas = disponiveis.length > 0 && escolhidas.length === disponiveis.length;

    const alternar = (e: Address) =>
        setMarcadas((m) => {
            const n = new Set(m);
            if (n.has(e)) n.delete(e);
            else n.add(e);
            return n;
        });

    const enviar = (ev: FormEvent) => {
        ev.preventDefault();
        if (pesoG && escolhidas.length > 0) aoSalvar(Number(material), escolhidas, pesoG, evidencias.trim());
    };

    return (
        <Dialogo
            titulo={t('cooperativa.lotes.montar')}
            subtitulo={progresso ?? undefined}
            formId={semBalanca ? undefined : 'form-lote'}
            salvando={salvando}
            podeSalvar={!!pesoG && escolhidas.length > 0}
            rotuloSalvar={t('cooperativa.lotes.criar')}
            aoFechar={aoFechar}
            largura="lg"
        >
            {semBalanca ? (
                <p className="text-sm text-kraft">{t('cooperativa.lotes.semBalanca')}</p>
            ) : (
                <form id="form-lote" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
                        <Selecao
                            rotulo={t('cooperativa.material')}
                            required
                            autoFocus
                            value={material}
                            onChange={(e) => {
                                setMaterial(e.target.value);
                                setMarcadas(new Set());
                            }}
                        >
                            <option value="" disabled>
                                {t('cooperativa.escolherMaterial')}
                            </option>
                            {materiais.map((m) => (
                                <option key={m.endereco} value={m.dados.codigo}>
                                    {m.dados.nome}
                                </option>
                            ))}
                        </Selecao>
                        <Campo
                            rotulo={t('cooperativa.lotes.evidencias')}
                            value={evidencias}
                            ajuda={t('cooperativa.lotes.evidenciasAjuda')}
                            onChange={(e) => setEvidencias(e.target.value)}
                        />
                    </div>

                    {material && (
                        <fieldset className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                <legend className="text-sm font-medium text-texto">{t('cooperativa.lotes.escolherEntregas')}</legend>
                                {disponiveis.length > 0 && (
                                    <button
                                        type="button"
                                        className="text-sm font-medium text-acento underline-offset-4 hover:underline"
                                        onClick={() => setMarcadas(todas ? new Set() : new Set(disponiveis.map((e) => e.endereco)))}
                                    >
                                        {t(todas ? 'cooperativa.lotes.desmarcarTodas' : 'cooperativa.lotes.marcarTodas')}
                                    </button>
                                )}
                            </div>
                            {disponiveis.length === 0 ? (
                                <p className="text-sm text-texto-suave">{t('cooperativa.lotes.semEntregas')}</p>
                            ) : (
                                <ul className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border border-linha p-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {disponiveis.map((e) => (
                                        <li key={e.endereco}>
                                            <label
                                                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                                    marcadas.has(e.endereco)
                                                        ? 'border-acento bg-acento-suave text-texto'
                                                        : 'border-linha text-texto-suave hover:border-texto-suave'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={marcadas.has(e.endereco)}
                                                    onChange={() => alternar(e.endereco)}
                                                    className="accent-[var(--cor-acento)]"
                                                />
                                                <span className="font-semibold tabular-nums">#{e.dados.entregaId.toString()}</span>
                                                <span className="tabular-nums">{gramasParaKg(e.dados.pesoG, idioma)} kg</span>
                                                <span className="ml-auto truncate text-xs text-texto-suave">
                                                    {t(`origem.${lote.OrigemEntrega[e.dados.origem]}`)}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </fieldset>
                    )}

                    {escolhidas.length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-[1fr_16rem] sm:items-end">
                            <p className="text-sm text-texto">
                                {t('cooperativa.lotes.resumo', { n: escolhidas.length, kg: gramasParaKg(soma, idioma) })}
                            </p>
                            {campo}
                        </div>
                    )}
                </form>
            )}
        </Dialogo>
    );
}

function DialogoFechar({
    linha,
    nomeMaterial,
    faixa,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    nomeMaterial: string;
    faixa: Faixa;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (pesoG: bigint) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { pesoG, campo } = usePesoConsolidado(linha.dados.pesoEntregasG, faixa);
    return (
        <Dialogo
            titulo={t('cooperativa.lotes.fecharTitulo', { id: linha.dados.loteId.toString() })}
            subtitulo={`${nomeMaterial} | ${t('cooperativa.lotes.resumo', {
                n: linha.dados.qtdEntregas,
                kg: gramasParaKg(linha.dados.pesoEntregasG, idioma),
            })}`}
            formId="form-fechar"
            salvando={salvando}
            podeSalvar={!!pesoG}
            rotuloSalvar={t('cooperativa.lotes.fechar')}
            aoFechar={aoFechar}
        >
            <form
                id="form-fechar"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pesoG) aoSalvar(pesoG);
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                {campo}
            </form>
        </Dialogo>
    );
}

function DialogoAnunciar({
    linha,
    nomeMaterial,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    nomeMaterial: string;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (centavos: number, dias: number) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const [preco, setPreco] = useState('');
    const [dias, setDias] = useState('7');
    const valor = Number(preco.replace(',', '.'));
    const pronto = valor > 0 && Number(dias) >= 1 && Number(dias) <= 90;

    return (
        <Dialogo
            titulo={t('cooperativa.lotes.anunciarTitulo', { id: linha.dados.loteId.toString() })}
            subtitulo={`${nomeMaterial} | ${gramasParaKg(linha.dados.pesoG, idioma)} kg`}
            formId="form-anuncio"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('cooperativa.lotes.anunciar')}
            aoFechar={aoFechar}
        >
            <form
                id="form-anuncio"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pronto) aoSalvar(Math.round(valor * 100), Number(dias));
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Campo
                        rotulo={t('cooperativa.lotes.precoMinimo')}
                        inputMode="decimal"
                        required
                        autoFocus
                        value={preco}
                        placeholder="0,00"
                        onChange={(e) => setPreco(e.target.value)}
                    />
                    <Campo
                        rotulo={t('cooperativa.lotes.dias')}
                        type="number"
                        min={1}
                        max={90}
                        required
                        value={dias}
                        onChange={(e) => setDias(e.target.value)}
                    />
                </div>
            </form>
        </Dialogo>
    );
}
