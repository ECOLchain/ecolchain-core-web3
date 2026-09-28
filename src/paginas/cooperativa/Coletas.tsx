import { type Address, address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Copy, Plus, Scale } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { coletorRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useBalancaTeste } from '../../solana/balancaTeste';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { useCadastro } from '../../solana/useCadastro';
import { gramasParaKg, kgParaGramas, useEntregas, useMateriais, useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

/** Endereço "vazio" (Pubkey::default): entrega ainda sem lote. */
const SEM_LOTE = '11111111111111111111111111111111';
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

type Linha = ContaDecodificada<lote.Entrega>;

export function Coletas() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.coletas')} />
            <SoPapel papel="cooperativa" aviso={t('cooperativa.soCooperativa')}>
                <ConteudoColetas />
            </SoPapel>
        </>
    );
}

/** Situação da balança de teste on-chain: não cadastrada, de outro dono, inativa ou pronta. */
function useSituacaoBalanca(dispositivo: Address | undefined, cooperativa: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(async () => {
        const conta = await lote.fetchMaybeBalanca(client.rpc, await pLote.balanca(dispositivo!));
        if (!conta.exists) return 'naoCadastrada' as const;
        if (conta.data.dono !== cooperativa) return 'outroDono' as const;
        return conta.data.ativa ? ('pronta' as const) : ('inativa' as const);
    }, [client, dispositivo, cooperativa]);
    return useRequest(dispositivo && cooperativa ? fonte : null);
}

function ConteudoColetas() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { carteira } = useCadastro();
    const cooperativa = carteira ? address(carteira) : undefined;
    const { balanca, gerar } = useBalancaTeste(cooperativa);
    const situacaoBalanca = useSituacaoBalanca(balanca?.address, cooperativa);
    const materiais = useMateriais();
    const participantes = useParticipantes();
    const entregas = useEntregas(cooperativa);
    const envio = useEnviar();
    const [popup, setPopup] = useState<'entrega' | 'balanca' | null>(null);
    const [filtroLote, setFiltroLote] = useState<'todas' | 'disponiveis' | 'noLote'>('todas');
    const [filtroMaterial, setFiltroMaterial] = useState('');

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
    const pronta = situacaoBalanca.data === 'pronta' && !!balanca;

    const colunas = useMemo<Coluna<Linha>[]>(() => {
        const quem = (l: Linha) => refs.get(hex(l.dados.coletorRef));
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
                id: 'coletor',
                titulo: t('papel.coletor'),
                valor: (l) => {
                    const q = quem(l);
                    return q ? rotuloParticipante(q) : '—';
                },
                busca: (l) => quem(l)?.carteira ?? '',
            },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => nomeMaterial.get(l.dados.material) ?? String(l.dados.material) },
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
    }, [t, idioma, refs, nomeMaterial]);
    const filtro = useMemo(
        () => (l: Linha) =>
            (filtroLote === 'todas' || (filtroLote === 'noLote') === (l.dados.lote !== SEM_LOTE)) &&
            (filtroMaterial === '' || String(l.dados.material) === filtroMaterial),
        [filtroLote, filtroMaterial],
    );
    const grade = useGrade(entregas.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });

    const registrar = async (coletor: string, material: number, pesoG: bigint) => {
        if (!balanca || !cooperativa) return;
        const proximo = (entregas.data ?? []).reduce((m, x) => (x.dados.entregaId > m ? x.dados.entregaId : m), 0n) + 1n;
        const entrega = await pLote.entrega(cooperativa, proximo);
        const ts = BigInt(Math.floor(Date.now() / 1000));
        try {
            await envio.dispatchAsync([
                // A balança assina a pesagem; a instrução Ed25519 vai imediatamente antes.
                await instrucaoPesagem(balanca, TipoPesagem.Entrega, entrega, pesoG, ts),
                await lote.getCooperativaRegisterEntregaInstructionAsync({
                    payer: client.payer,
                    cooperativa: client.payer,
                    balanca: await pLote.balanca(balanca.address),
                    materialCadastro: await pLote.material(material),
                    entrega,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    entregaId: proximo,
                    coletorRef: await coletorRef(address(coletor)),
                    material,
                    pesoG,
                    tsPesagem: ts,
                }),
            ]);
            setPopup(null);
            entregas.refresh();
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
                            <Botao compacto variante="secundario" onClick={() => abrir('balanca')}>
                                <span
                                    className={`size-2 rounded-full ${pronta ? 'bg-acento' : 'bg-kraft'}`}
                                    aria-hidden="true"
                                />
                                {t('cooperativa.balanca.titulo')}
                            </Botao>
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
                    carregando={!participantes.data}
                    materiais={(materiais.data ?? []).filter((m) => m.dados.ativo)}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={registrar}
                />
            )}
            {popup === 'balanca' && (
                <Dialogo titulo={t('cooperativa.balanca.titulo')} aoFechar={() => setPopup(null)}>
                    {!balanca ? (
                        <div className="flex flex-col items-start gap-4">
                            <p className="text-sm text-texto-suave">{t('cooperativa.balanca.semBalanca')}</p>
                            <Botao onClick={gerar}>
                                <Scale className="size-4" /> {t('cooperativa.balanca.gerar')}
                            </Botao>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 text-sm">
                            <p className="text-texto-suave">{t('cooperativa.balanca.chave')}</p>
                            <p className="flex items-start gap-2">
                                <code className="rounded bg-superficie-2 px-2 py-1 break-all text-texto">{balanca.address}</code>
                                <button
                                    type="button"
                                    onClick={() => void navigator.clipboard?.writeText(balanca.address).catch(() => {})}
                                    aria-label={t('carteira.copiar')}
                                    title={t('carteira.copiar')}
                                    className="rounded p-1.5 text-texto-suave hover:text-texto"
                                >
                                    <Copy className="size-4" />
                                </button>
                            </p>
                            <p className={pronta ? 'font-medium text-acento' : 'font-medium text-kraft'}>
                                {situacaoBalanca.data ? t(`cooperativa.balanca.${situacaoBalanca.data}`) : t('admin.carregando')}
                            </p>
                            {situacaoBalanca.data && situacaoBalanca.data !== 'pronta' && (
                                <Botao variante="secundario" className="self-start" onClick={() => situacaoBalanca.refresh()}>
                                    {t('cooperativa.balanca.verificar')}
                                </Botao>
                            )}
                        </div>
                    )}
                    <p className="mt-4 text-xs text-texto-suave">{t('cooperativa.balanca.aviso')}</p>
                </Dialogo>
            )}
        </div>
    );
}

function DialogoEntrega({
    coletores,
    carregando,
    materiais,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    coletores: ContaDecodificada<lote.Participante>[];
    carregando: boolean;
    materiais: ContaDecodificada<lote.Material>[];
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (coletor: string, material: number, pesoG: bigint) => void;
}) {
    const { t } = useTranslation();
    const [coletor, setColetor] = useState('');
    const [material, setMaterial] = useState('');
    const [peso, setPeso] = useState('');
    const pesoG = kgParaGramas(peso);
    const pronto = !!coletor && !!material && !!pesoG;
    const ordenados = useMemo(
        () => [...coletores].sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [coletores],
    );

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pronto) aoSalvar(coletor, Number(material), pesoG);
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
            {!carregando && coletores.length === 0 ? (
                <p className="text-sm text-texto-suave">{t('cooperativa.coletas.semColetores')}</p>
            ) : (
                <form id="form-entrega" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <Selecao rotulo={t('papel.coletor')} required autoFocus value={coletor} onChange={(e) => setColetor(e.target.value)}>
                        <option value="" disabled>
                            {t('cooperativa.coletas.escolherColetor')}
                        </option>
                        {ordenados.map((c) => (
                            <option key={c.endereco} value={c.dados.carteira}>
                                {rotuloParticipante(c.dados)}
                            </option>
                        ))}
                    </Selecao>
                    <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                        <Selecao rotulo={t('cooperativa.material')} required value={material} onChange={(e) => setMaterial(e.target.value)}>
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
                            rotulo={t('cooperativa.pesoKg')}
                            inputMode="decimal"
                            required
                            value={peso}
                            placeholder="0,000"
                            onChange={(e) => setPeso(e.target.value)}
                        />
                    </div>
                </form>
            )}
        </Dialogo>
    );
}
