import { type Address, address, getAddressEncoder, isAddress } from '@solana/kit';
import { Plus, ScanLine } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { coletorRef, origemRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { lerNomeFixo } from '@clientes/nome';
import { BotaoBalanca, DialogoBalanca, useBalancaDoParticipante } from '../../componentes/BalancaTeste';
import { CamposMaterial, ESCOLHA_VAZIA, type EscolhaMaterial, lerEscolha } from '../../componentes/CamposMaterial';
import { Dialogo } from '../../componentes/dialogo';
import { LeitorQr } from '../../componentes/LeitorQr';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useAtor } from '../../solana/ator';
import type { ContaDecodificada } from '../../solana/contas';
import {
    gramasParaKg,
    kgParaGramas,
    nomeVariacao,
    useColetasDestino,
    useEntregas,
    useMateriais,
    useParticipantes,
    useVariacoes,
} from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

/** Origens na ordem do formulário (coletor primeiro, o caso mais comum). */
const ORIGENS = [
    lote.OrigemEntrega.Coletor,
    lote.OrigemEntrega.TriagemPropria,
    lote.OrigemEntrega.Doacao,
    lote.OrigemEntrega.Compra,
    lote.OrigemEntrega.Avulso,
    lote.OrigemEntrega.Importador,
] as const;
export const nomeOrigem = (o: lote.OrigemEntrega) => `origem.${lote.OrigemEntrega[o]}`;
/** Doação e compra precisam de documento (nota, recibo, CNPJ); triagem e avulso, não. */
const referenciaObrigatoria = (o: lote.OrigemEntrega) => o === lote.OrigemEntrega.Doacao || o === lote.OrigemEntrega.Compra;

/** O que o formulário envia: a origem e, conforme ela, o coletor, a coleta do importador ou o texto da referência. */
export type NovaOrigem = {
    origem: lote.OrigemEntrega;
    coletor: string;
    referencia: string;
    /** Coleta do importador enviada a esta cooperativa (origem Importador). */
    coleta?: Address;
    material: number;
    variacao: number;
    garrafas: number;
    pesoG: bigint;
};
type Coleta = ContaDecodificada<lote.Coleta>;

/** Endereço "vazio" (Pubkey::default): entrega ainda sem lote. */
const SEM_LOTE = '11111111111111111111111111111111';
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

type Linha = ContaDecodificada<lote.Entrega>;

export function Coletas() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.coletas')} />
            <SoPapel papel={['cooperativa', 'cleantech']} aviso={t('cooperativa.soCooperativa')}>
                <ConteudoColetas />
            </SoPapel>
        </>
    );
}

function ConteudoColetas() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { titular: cooperativa, assinante, vinculo } = useAtor();
    const estadoBalanca = useBalancaDoParticipante(cooperativa);
    const { balanca, pronta } = estadoBalanca;
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const participantes = useParticipantes();
    const entregas = useEntregas(cooperativa);
    const coletasRecebidas = useColetasDestino(cooperativa);
    const envio = useEnviar();
    const [popup, setPopup] = useState<'entrega' | 'balanca' | null>(null);
    const [filtroLote, setFiltroLote] = useState<'todas' | 'disponiveis' | 'noLote'>('todas');
    const [filtroMaterial, setFiltroMaterial] = useState('');
    const [filtroOrigem, setFiltroOrigem] = useState('');

    const coletores = useMemo(
        () => (participantes.data ?? []).filter((p) => p.dados.papel === lote.Papel.Coletor),
        [participantes.data],
    );
    const nomeMaterial = useMemo(
        () => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])),
        [materiais.data],
    );
    // coletor_ref → cadastro do coletor, para mostrar quem entregou.
    const [refs, setRefs] = useState<Map<string, lote.Participante>>(new Map());
    useEffect(() => {
        let vivo = true;
        void Promise.all(coletores.map(async (c) => [hex(await coletorRef(c.dados.carteira)), c.dados] as const)).then(
            (pares) => vivo && setRefs(new Map(pares)),
        );
        return () => {
            vivo = false;
        };
    }, [coletores]);

    // Origem Importador: a referência é a conta da coleta; o nome vem do cadastro do importador.
    const importadorDaColeta = useMemo(() => {
        const nomes = new Map((participantes.data ?? []).map((p) => [p.dados.carteira, p.dados]));
        return new Map(
            (coletasRecebidas.data ?? []).map((c) => [hex(getAddressEncoder().encode(c.endereco)), nomes.get(c.dados.importador)]),
        );
    }, [participantes.data, coletasRecebidas.data]);

    const colunas = useMemo<Coluna<Linha>[]>(() => {
        const quem = (l: Linha) =>
            l.dados.origem === lote.OrigemEntrega.Importador
                ? importadorDaColeta.get(hex(l.dados.origemRef))
                : refs.get(hex(l.dados.origemRef));
        const comColetor = (l: Linha) =>
            l.dados.origem === lote.OrigemEntrega.Coletor || l.dados.origem === lote.OrigemEntrega.Importador;
        const rotuloQuem = (l: Linha) => {
            if (!comColetor(l)) return t('cooperativa.coletas.refRegistrada');
            const q = quem(l);
            return q ? rotuloParticipante(q) : '—';
        };
        return [
            { id: 'id', titulo: '#', valor: (l) => l.dados.entregaId, numerica: true, largura: 'w-20' },
            {
                id: 'data',
                titulo: t('cooperativa.data'),
                largura: 'w-44',
                valor: (l) => l.dados.tsPesagem,
                celula: (l) => (
                    <span className="text-texto-suave">
                        {new Date(Number(l.dados.tsPesagem) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                ),
            },
            {
                id: 'origem',
                titulo: t('cooperativa.coletas.origem'),
                valor: (l) => t(nomeOrigem(l.dados.origem)),
                largura: 'w-40',
            },
            {
                id: 'coletor',
                titulo: t('cooperativa.coletas.quem'),
                valor: rotuloQuem,
                celula: (l) =>
                    comColetor(l) ? (
                        rotuloQuem(l)
                    ) : (
                        <span className="text-texto-suave" title={hex(l.dados.origemRef)}>
                            {rotuloQuem(l)}
                        </span>
                    ),
                busca: (l) => quem(l)?.carteira ?? '',
            },
            {
                id: 'material',
                titulo: t('cooperativa.material'),
                valor: (l) =>
                    [nomeMaterial.get(l.dados.material) ?? String(l.dados.material), nomeVariacao(variacoes.data, l.dados.material, l.dados.variacao)]
                        .filter(Boolean)
                        .join(' · '),
            },
            {
                id: 'garrafas',
                titulo: t('material.garrafasCurto'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => l.dados.qtdGarrafas,
                celula: (l) => (l.dados.qtdGarrafas ? l.dados.qtdGarrafas.toLocaleString(idioma) : <span className="text-texto-suave">—</span>),
            },
            {
                id: 'peso',
                titulo: t('cooperativa.pesoKg'),
                largura: 'w-32',
                valor: (l) => l.dados.pesoG,
                celula: (l) => gramasParaKg(l.dados.pesoG, idioma),
                numerica: true,
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-36',
                valor: (l) => t(l.dados.lote !== SEM_LOTE ? 'cooperativa.coletas.noLote' : 'cooperativa.coletas.disponivel'),
                celula: (l) => {
                    const noLote = l.dados.lote !== SEM_LOTE;
                    return (
                        <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                noLote ? 'bg-superficie-2 text-texto-suave' : 'bg-acento-suave text-acento'
                            }`}
                        >
                            {t(noLote ? 'cooperativa.coletas.noLote' : 'cooperativa.coletas.disponivel')}
                        </span>
                    );
                },
            },
        ];
    }, [t, idioma, refs, nomeMaterial, variacoes.data, importadorDaColeta]);
    const filtro = useMemo(
        () => (l: Linha) =>
            (filtroLote === 'todas' || (filtroLote === 'noLote') === (l.dados.lote !== SEM_LOTE)) &&
            (filtroMaterial === '' || String(l.dados.material) === filtroMaterial) &&
            (filtroOrigem === '' || String(l.dados.origem) === filtroOrigem),
        [filtroLote, filtroMaterial, filtroOrigem],
    );
    const grade = useGrade(entregas.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });

    const registrar = async ({ origem, coletor, referencia, coleta, material, variacao, garrafas, pesoG }: NovaOrigem) => {
        if (!balanca || !cooperativa) return;
        const proximo = (entregas.data ?? []).reduce((m, x) => (x.dados.entregaId > m ? x.dados.entregaId : m), 0n) + 1n;
        const entrega = await pLote.entrega(cooperativa, proximo);
        // Sem texto (triagem, avulso), a referência é o próprio lote de origem: única e não vazia.
        const ref =
            origem === lote.OrigemEntrega.Coletor
                ? await coletorRef(address(coletor))
                : origem === lote.OrigemEntrega.Importador && coleta
                  ? (getAddressEncoder().encode(coleta) as Uint8Array)
                  : await origemRef(referencia.trim() || `${lote.OrigemEntrega[origem]}:${cooperativa}:${proximo}`);
        const ts = BigInt(Math.floor(Date.now() / 1000));
        try {
            await envio.dispatchAsync([
                // A balança assina a pesagem; a instrução Ed25519 vai imediatamente antes.
                await instrucaoPesagem(balanca, TipoPesagem.Entrega, entrega, pesoG, ts),
                await lote.getCooperativaRegisterEntregaInstructionAsync({
                    payer: assinante,
                    cooperativa,
                    cooperativaAssinante: assinante,
                    cooperativaCarteira: vinculo,
                    balanca: await pLote.balanca(balanca.address),
                    materialCadastro: await pLote.material(material),
                    variacaoCadastro: variacao ? await pLote.variacao(material, variacao) : undefined,
                    coleta,
                    entrega,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    entregaId: proximo,
                    origem,
                    origemRef: ref,
                    material,
                    pesoG,
                    tsPesagem: ts,
                    variacao,
                    qtdGarrafas: garrafas,
                }),
            ]);
            setPopup(null);
            entregas.refresh();
            coletasRecebidas.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    const abrir = (p: 'entrega' | 'balanca') => {
        envio.reset();
        setPopup(p);
    };

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('cooperativa.coletas.registrada')} />}

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
                            rotulo={t('cooperativa.coletas.origem')}
                            valor={filtroOrigem}
                            onChange={(v) => {
                                setFiltroOrigem(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('cooperativa.coletas.todasOrigens') },
                                ...ORIGENS.map((o) => ({ valor: String(o), texto: t(nomeOrigem(o)) })),
                            ]}
                        />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={filtroLote}
                            onChange={(v) => {
                                setFiltroLote(v as typeof filtroLote);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'todas', texto: t('grade.todasSituacoes') },
                                { valor: 'disponiveis', texto: t('cooperativa.coletas.disponivel') },
                                { valor: 'noLote', texto: t('cooperativa.coletas.noLote') },
                            ]}
                        />
                        <AcoesGrade>
                            <BotaoBalanca pronta={pronta} onClick={() => abrir('balanca')} />
                            <Botao compacto onClick={() => abrir(pronta ? 'entrega' : 'balanca')}>
                                <Plus className="size-4" /> {t('cooperativa.coletas.nova')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade grade={grade} vazio={t('cooperativa.coletas.vazio')} carregando={entregas.status === 'fetching' && !entregas.data} />
            </CartaoGrade>

            {popup === 'entrega' && (
                <DialogoEntrega
                    coletores={coletores.filter((c) => c.dados.ativo)}
                    participantes={participantes.data ?? []}
                    carregando={!participantes.data}
                    materiais={(materiais.data ?? []).filter((m) => m.dados.ativo)}
                    variacoes={variacoes.data}
                    coletasPendentes={(coletasRecebidas.data ?? []).filter((c) => c.dados.estado === lote.EstadoColeta.EmEntrega)}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={registrar}
                />
            )}
            {popup === 'balanca' && <DialogoBalanca estado={estadoBalanca} dono="cooperativa" aoFechar={() => setPopup(null)} />}
        </div>
    );
}

function DialogoEntrega({
    coletores,
    participantes,
    carregando,
    materiais,
    variacoes,
    coletasPendentes,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    coletores: ContaDecodificada<lote.Participante>[];
    /** Todos os cadastros, para explicar por que um QR lido não serve (outro papel, inativo). */
    participantes: ContaDecodificada<lote.Participante>[];
    carregando: boolean;
    materiais: ContaDecodificada<lote.Material>[];
    variacoes: Map<number, ContaDecodificada<lote.MaterialVariacao>[]> | undefined;
    /** Coletas de importadores a caminho desta cooperativa. */
    coletasPendentes: Coleta[];
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (nova: NovaOrigem) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const [origem, setOrigem] = useState<lote.OrigemEntrega>(lote.OrigemEntrega.Coletor);
    const [coletor, setColetor] = useState('');
    const [lendoQr, setLendoQr] = useState(false);
    const [avisoQr, setAvisoQr] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    const [referencia, setReferencia] = useState('');
    const [escolha, setEscolha] = useState<EscolhaMaterial>(ESCOLHA_VAZIA);
    const [coletaSel, setColetaSel] = useState('');
    const [peso, setPeso] = useState('');
    const pesoG = kgParaGramas(peso);
    const lido = lerEscolha(escolha, materiais);
    const comColetor = origem === lote.OrigemEntrega.Coletor;
    const doImportador = origem === lote.OrigemEntrega.Importador;
    const quemOk = comColetor ? !!coletor : doImportador ? !!coletaSel : !referenciaObrigatoria(origem) || referencia.trim() !== '';
    const pronto = quemOk && !!lido && !!pesoG;
    const nomeImportador = (c: Coleta) => {
        const p = participantes.find((x) => x.dados.carteira === c.dados.importador);
        return p ? rotuloParticipante(p.dados) : c.dados.importador;
    };
    /** Escolher a coleta preenche material, cor e garrafas declaradas pelo importador (as garrafas podem ser recontadas). */
    const escolherColeta = (endereco: string) => {
        setColetaSel(endereco);
        const c = coletasPendentes.find((x) => x.endereco === endereco);
        if (c)
            setEscolha({
                material: String(c.dados.material),
                variacao: c.dados.variacao ? String(c.dados.variacao) : '',
                garrafas: String(c.dados.qtdGarrafas),
            });
    };
    const ordenados = useMemo(
        () => [...coletores].sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [coletores],
    );

    /** QR da tela "Minha carteira" do coletor: só o endereço. Seleciona o coletor se ele puder entregar. */
    const lerQr = (texto: string) => {
        setLendoQr(false);
        const erroQr = (chave: string) => setAvisoQr({ tipo: 'erro', texto: t(chave) });
        if (!isAddress(texto)) return erroQr('cooperativa.coletas.qrInvalido');
        const achado = coletores.find((c) => c.dados.carteira === texto);
        if (achado) {
            setColetor(achado.dados.carteira);
            return setAvisoQr({ tipo: 'ok', texto: t('cooperativa.coletas.qrLido', { nome: rotuloParticipante(achado.dados) }) });
        }
        const cadastro = participantes.find((p) => p.dados.carteira === texto);
        if (!cadastro) return erroQr('cooperativa.coletas.qrSemCadastro');
        if (cadastro.dados.papel !== lote.Papel.Coletor) return erroQr('cooperativa.coletas.qrNaoColetor');
        return erroQr('cooperativa.coletas.qrInativo');
    };

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pronto && pesoG && lido)
            aoSalvar({
                origem,
                coletor,
                referencia,
                coleta: doImportador ? address(coletaSel) : undefined,
                material: lido.material,
                variacao: lido.variacao,
                garrafas: lido.garrafas,
                pesoG,
            });
    };

    return (
        <Dialogo
            titulo={t('cooperativa.coletas.nova')}
            formId="form-entrega"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('cooperativa.coletas.pesar')}
            aoFechar={aoFechar}
        >
            <form id="form-entrega" onSubmit={enviar} className="flex flex-col gap-4">
                <Resultado erro={erro} sucesso="" />
                <Selecao
                    rotulo={t('cooperativa.coletas.origem')}
                    autoFocus
                    value={origem}
                    onChange={(e) => {
                        setOrigem(Number(e.target.value) as lote.OrigemEntrega);
                        setColetaSel('');
                    }}
                >
                    {ORIGENS.map((o) => (
                        <option key={o} value={o}>
                            {t(nomeOrigem(o))}
                        </option>
                    ))}
                </Selecao>
                {comColetor ? (
                    !carregando && coletores.length === 0 ? (
                        <p className="text-sm text-kraft">{t('cooperativa.coletas.semColetores')}</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                                <Selecao
                                    rotulo={t('papel.coletor')}
                                    required
                                    value={coletor}
                                    onChange={(e) => {
                                        setColetor(e.target.value);
                                        setAvisoQr(null);
                                    }}
                                >
                                    <option value="" disabled>
                                        {t('cooperativa.coletas.escolherColetor')}
                                    </option>
                                    {ordenados.map((c) => (
                                        <option key={c.endereco} value={c.dados.carteira}>
                                            {rotuloParticipante(c.dados)}
                                        </option>
                                    ))}
                                </Selecao>
                                <Botao
                                    type="button"
                                    variante="secundario"
                                    className="h-10"
                                    aria-pressed={lendoQr}
                                    onClick={() => {
                                        setAvisoQr(null);
                                        setLendoQr((v) => !v);
                                    }}
                                >
                                    <ScanLine className="size-4" /> {t('cooperativa.coletas.lerQr')}
                                </Botao>
                            </div>
                            {lendoQr && <LeitorQr aoLer={lerQr} aoCancelar={() => setLendoQr(false)} instrucao={t('leitorQr.aponte')} />}
                            {avisoQr && (
                                <p role="status" className={`text-sm ${avisoQr.tipo === 'ok' ? 'text-acento' : 'text-perigo'}`}>
                                    {avisoQr.texto}
                                </p>
                            )}
                        </div>
                    )
                ) : doImportador ? (
                    coletasPendentes.length === 0 ? (
                        <p className="text-sm text-kraft">{t('cooperativa.coletas.semColetasImportador')}</p>
                    ) : (
                        <Selecao
                            rotulo={t('cooperativa.coletas.coletaImportador')}
                            required
                            value={coletaSel}
                            onChange={(e) => escolherColeta(e.target.value)}
                        >
                            <option value="" disabled>
                                {t('cooperativa.coletas.escolherColeta')}
                            </option>
                            {coletasPendentes.map((c) => (
                                <option key={c.endereco} value={c.endereco}>
                                    {t('cooperativa.coletas.opcaoColeta', {
                                        id: String(c.dados.coletaId),
                                        importador: nomeImportador(c),
                                        garrafas: c.dados.qtdGarrafas.toLocaleString(idioma),
                                        cor: lerNomeFixo(variacoes?.get(c.dados.material)?.find((v) => v.dados.indice === c.dados.variacao)?.dados.nome ?? []),
                                    })}
                                </option>
                            ))}
                        </Selecao>
                    )
                ) : (
                    <Campo
                        rotulo={t('cooperativa.coletas.referencia')}
                        required={referenciaObrigatoria(origem)}
                        value={referencia}
                        autoComplete="off"
                        onChange={(e) => setReferencia(e.target.value)}
                        ajuda={t(
                            referenciaObrigatoria(origem)
                                ? 'cooperativa.coletas.referenciaObrigatoria'
                                : 'cooperativa.coletas.referenciaOpcional',
                        )}
                    />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <CamposMaterial
                        valor={escolha}
                        onChange={setEscolha}
                        materiais={materiais}
                        variacoes={variacoes}
                        bloqueado={doImportador && !!coletaSel}
                    />
                    <Campo
                        rotulo={t('cooperativa.pesoKg')}
                        inputMode="decimal"
                        required
                        value={peso}
                        placeholder="0,000"
                        onChange={(e) => setPeso(e.target.value)}
                    />
                </div>
            </form>
        </Dialogo>
    );
}
