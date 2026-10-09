import { useClient } from '@solana/react';
import { none, some } from '@solana/kit';
import { AlarmClock, LoaderCircle, PenLine, Scale, ShieldAlert } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority } from '@clientes/pdas';
import { LerCodigo, MostrarCodigo } from '../../componentes/CodigoAssinatura';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useAtor } from '../../solana/ator';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { assinarEEnviarDecisao, type DecisaoEscrow, DecisaoInvalida, type DecisaoLida, instrucaoDecisao, lerDecisao, prepararDecisao } from '../../solana/decisao';
import { useCadastro } from '../../solana/useCadastro';
import { brl, gramasParaKg, kgParaGramas, reaisParaCentavos, useMateriais, useParticipantes, useTodosLotes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

type Linha = ContaDecodificada<lote.Lote>;
type Estado = lote.Lote['estado']['__kind'];

const SEM_CONTA = '11111111111111111111111111111111';
/** Etapas em que uma parte pode contestar (ADR das disputas: antes da liberação do escrow). */
const CONTESTAVEIS: Estado[] = ['Vendido', 'EmTransporte', 'Recebido'];
const ETAPA: Partial<Record<Estado, lote.EtapaDisputavel>> = {
    Vendido: lote.EtapaDisputavel.Vendido,
    EmTransporte: lote.EtapaDisputavel.EmTransporte,
    Recebido: lote.EtapaDisputavel.Recebido,
};
/** O que a parte pode alegar. Prazo expirado só pelo botão próprio (o programa confere o relógio). */
const MOTIVOS = [
    lote.MotivoDisputa.DivergenciaPeso,
    lote.MotivoDisputa.ClassificacaoContestada,
    lote.MotivoDisputa.FalhaEntrega,
    lote.MotivoDisputa.Outro,
] as const;
const NOME_MOTIVO: Record<lote.MotivoDisputa, string> = {
    [lote.MotivoDisputa.DivergenciaPeso]: 'divergenciaPeso',
    [lote.MotivoDisputa.ClassificacaoContestada]: 'classificacao',
    [lote.MotivoDisputa.FalhaEntrega]: 'falhaEntrega',
    [lote.MotivoDisputa.PrazoExpirado]: 'prazoExpirado',
    [lote.MotivoDisputa.Outro]: 'outro',
};
const NOME_ETAPA: Record<lote.EtapaDisputavel, Estado> = {
    [lote.EtapaDisputavel.Vendido]: 'Vendido',
    [lote.EtapaDisputavel.EmTransporte]: 'EmTransporte',
    [lote.EtapaDisputavel.Recebido]: 'Recebido',
};

const agoraS = () => BigInt(Math.floor(Date.now() / 1000));
const julgada = (l: lote.Lote) => (l.etapaJulgada.__option === 'Some' ? l.etapaJulgada.value : null);
/** A parte ainda pode contestar: etapa contestável e não julgada pelo árbitro (o programa recusa reabrir). */
const podeContestar = (l: lote.Lote) => {
    const etapa = ETAPA[l.estado.__kind];
    return etapa !== undefined && etapa !== julgada(l);
};
/** Lote vendido ou em transporte além do prazo de entrega: qualquer um aciona o crank. */
const prazoVencido = (l: lote.Lote) => (l.estado.__kind === 'Vendido' || l.estado.__kind === 'EmTransporte') && agoraS() > l.prazoEntrega;

/** Nomes, materiais, valores e a situação da contestação, usados pelas duas telas. */
function useRotulos() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const participantes = useParticipantes();
    const materiais = useMateriais();
    return useMemo(() => {
        const cadastro = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados]));
        const nomes = new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome]));
        return {
            nome: (carteira: string) => {
                if (carteira === SEM_CONTA) return '—';
                const p = cadastro.get(carteira);
                return p ? rotuloParticipante(p) : carteira;
            },
            material: (codigo: number) => nomes.get(codigo) ?? String(codigo),
            kg: (g: bigint) => gramasParaKg(g, idioma),
            reais: (c: bigint) => brl(c, idioma),
            data: (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' }),
            motivo: (m: lote.MotivoDisputa) => t(`contestacoes.motivo.${NOME_MOTIVO[m]}`),
            etapa: (e: lote.EtapaDisputavel) => t(`estadoLote.${NOME_ETAPA[e]}`),
        };
    }, [participantes.data, materiais.data, idioma, t]);
}
type Rotulos = ReturnType<typeof useRotulos>;

/** Selo da situação: em contestação (com o motivo), reembolsado, ou a etapa do lote. */
function Situacao({ l, r }: { l: lote.Lote; r: Rotulos }) {
    const { t } = useTranslation();
    const e = l.estado;
    if (e.__kind === 'EmDisputa') {
        return (
            <span className="inline-flex flex-col gap-0.5">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-kraft-suave px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-kraft">
                    <ShieldAlert className="size-3.5" aria-hidden /> {r.motivo(e.motivo)}
                </span>
                <span className="text-xs text-texto-suave">{t('contestacoes.naEtapa', { etapa: r.etapa(e.origem) })}</span>
            </span>
        );
    }
    const etapaJulgada = julgada(l);
    return (
        <span className="inline-flex flex-col gap-0.5">
            <span className="text-texto">{t(`estadoLote.${e.__kind}`)}</span>
            {etapaJulgada !== null && <span className="text-xs text-texto-suave">{t('contestacoes.julgadaEm', { etapa: r.etapa(etapaJulgada) })}</span>}
        </span>
    );
}

const colunasBase = (t: (k: string) => string, r: Rotulos): Coluna<Linha>[] => [
    { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
    { id: 'material', titulo: t('cooperativa.material'), valor: (l) => r.material(l.dados.material) },
    { id: 'peso', titulo: t('cooperativa.pesoKg'), largura: 'w-28', numerica: true, valor: (l) => l.dados.pesoG, celula: (l) => r.kg(l.dados.pesoG) },
    { id: 'cooperativa', titulo: t('trilha.cooperativa'), valor: (l) => r.nome(l.dados.cooperativa), busca: (l) => l.dados.cooperativa },
    { id: 'industria', titulo: t('trilha.industria'), valor: (l) => r.nome(l.dados.industria), busca: (l) => l.dados.industria },
    {
        id: 'valor',
        titulo: t('vendas.valor'),
        largura: 'w-32',
        numerica: true,
        valor: (l) => l.dados.valorCentavos,
        celula: (l) => (l.dados.valorCentavos > 0n ? r.reais(l.dados.valorCentavos) : '—'),
    },
];

/* ─────────────── Partes: abrir e acompanhar ─────────────── */

/** Contestações (partes): cooperativa, Clean Tech, indústria e transportador de cada lote. */
export function Contestacoes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.disputas')} />
            <SoPapel papel={['cooperativa', 'cleantech', 'industria', 'transportador']} aviso={t('contestacoes.soParte')}>
                <ConteudoContestacoes />
            </SoPapel>
        </>
    );
}

function ConteudoContestacoes() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const { ator } = useCadastro();
    const lotes = useTodosLotes();
    const r = useRotulos();
    const envio = useEnviar();
    const [filtro, setFiltro] = useState<'emAndamento' | 'abertas' | 'todas'>('emAndamento');
    const [abrir, setAbrir] = useState<Linha | null>(null);
    const [sucesso, setSucesso] = useState('');
    /** Assinatura da contestação aberta no diálogo (que tem o seu próprio envio). */
    const [assinaturaAbertura, setAssinaturaAbertura] = useState<string>();

    const minhas = useMemo(
        () =>
            (lotes.data ?? []).filter(
                (l) =>
                    [l.dados.cooperativa, l.dados.industria, l.dados.transportador].includes(ator as never) &&
                    (CONTESTAVEIS.includes(l.dados.estado.__kind) || l.dados.estado.__kind === 'EmDisputa' || l.dados.estado.__kind === 'Reembolsado' || julgada(l.dados) !== null),
            ),
        [lotes.data, ator],
    );
    const meuPapel = (l: lote.Lote) =>
        t(l.cooperativa === ator ? 'contestacoes.papel.cooperativa' : l.industria === ator ? 'contestacoes.papel.industria' : 'contestacoes.papel.transportador');
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            ...colunasBase(t, r),
            { id: 'papel', titulo: t('contestacoes.seuPapel'), largura: 'w-32', valor: (l) => meuPapel(l.dados) },
            {
                id: 'prazo',
                titulo: t('contestacoes.prazoEntrega'),
                largura: 'w-40',
                valor: (l) => l.dados.prazoEntrega,
                celula: (l) =>
                    l.dados.estado.__kind === 'Vendido' || l.dados.estado.__kind === 'EmTransporte' ? (
                        <span className={prazoVencido(l.dados) ? 'font-semibold text-perigo' : 'text-texto-suave'}>{r.data(l.dados.prazoEntrega)}</span>
                    ) : (
                        <span className="text-texto-suave">—</span>
                    ),
            },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-56', valor: (l) => l.dados.estado.__kind, celula: (l) => <Situacao l={l.dados} r={r} /> },
        ],
        // `meuPapel` depende só de `ator` e `t`.
        [t, r, ator],
    );
    const filtrar = useMemo(
        () => (l: Linha) =>
            filtro === 'todas' ||
            (filtro === 'abertas' ? l.dados.estado.__kind === 'EmDisputa' : CONTESTAVEIS.includes(l.dados.estado.__kind) || l.dados.estado.__kind === 'EmDisputa'),
        [filtro],
    );
    const grade = useGrade(lotes.data ? minhas : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro: filtrar });
    const sel = grade.selecionada;

    const acionarPrazo = async (l: Linha) => {
        setSucesso('');
        setAssinaturaAbertura(undefined);
        try {
            await envio.dispatchAsync([
                await lote.getPublicCrankPrazoExpiradoInstructionAsync({
                    cranker: client.payer,
                    lote: l.endereco,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                }),
            ]);
            setSucesso(t('contestacoes.prazoAcionado', { lote: l.dados.loteId }));
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <p className="max-w-3xl text-sm text-texto-suave">{t('contestacoes.explicacao')}</p>
            {!abrir && <Resultado assinatura={assinaturaAbertura ?? envio.data} erro={envio.error} sucesso={sucesso} />}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={filtro}
                            onChange={(v) => {
                                setFiltro(v as typeof filtro);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'emAndamento', texto: t('contestacoes.filtro.emAndamento') },
                                { valor: 'abertas', texto: t('contestacoes.filtro.abertas') },
                                { valor: 'todas', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            {sel && prazoVencido(sel.dados) && (
                                <Botao compacto variante="secundario" carregando={envio.isRunning} onClick={() => void acionarPrazo(sel)}>
                                    <AlarmClock className="size-4" /> {t('contestacoes.acionarPrazo')}
                                </Botao>
                            )}
                            <Botao
                                compacto
                                disabled={!sel || !podeContestar(sel.dados)}
                                title={!sel ? t('contestacoes.selecione') : !podeContestar(sel.dados) ? t('contestacoes.naoContestavel') : undefined}
                                onClick={() => {
                                    envio.reset();
                                    setSucesso('');
                                    setAssinaturaAbertura(undefined);
                                    if (sel) setAbrir(sel);
                                }}
                            >
                                <ShieldAlert className="size-4" /> {t('contestacoes.abrir')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[78rem]"
                    vazio={t('contestacoes.vazio')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => podeContestar(l.dados) && setAbrir(l)}
                />
            </CartaoGrade>

            {abrir && (
                <DialogoAbrir
                    linha={abrir}
                    rotulos={r}
                    aoFechar={() => setAbrir(null)}
                    aoConcluir={(assinatura) => {
                        setAssinaturaAbertura(assinatura);
                        setSucesso(t('contestacoes.aberta', { lote: abrir.dados.loteId }));
                        setAbrir(null);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

function DialogoAbrir({
    linha,
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    rotulos: Rotulos;
    aoFechar: () => void;
    aoConcluir: (assinatura: string) => void;
}) {
    const { t } = useTranslation();
    const { titular, assinante, vinculo } = useAtor();
    const envio = useEnviar();
    const [motivo, setMotivo] = useState<lote.MotivoDisputa | null>(null);

    const enviar = async (e: FormEvent) => {
        e.preventDefault();
        if (motivo === null || !titular) return;
        try {
            const assinatura = await envio.dispatchAsync([
                await lote.getParteOpenDisputaInstructionAsync({
                    parte: titular,
                    parteAssinante: assinante,
                    parteCarteira: vinculo,
                    lote: linha.endereco,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    motivo,
                }),
            ]);
            aoConcluir(assinatura);
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <Dialogo
            titulo={t('contestacoes.abrirTitulo', { lote: linha.dados.loteId })}
            subtitulo={`${r.material(linha.dados.material)} | ${r.kg(linha.dados.pesoG)} kg | ${t(`estadoLote.${linha.dados.estado.__kind}`)}`}
            formId="form-contestacao"
            salvando={envio.isRunning}
            podeSalvar={motivo !== null}
            rotuloSalvar={t('contestacoes.assinarAbrir')}
            iconeSalvar={ShieldAlert}
            aoFechar={aoFechar}
        >
            <form id="form-contestacao" onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3 text-sm">
                <Resultado erro={envio.error} sucesso="" />
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 font-semibold text-texto">{t('contestacoes.motivoTitulo')}</legend>
                    {MOTIVOS.map((m) => (
                        <label
                            key={m}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${motivo === m ? 'border-acento bg-acento-suave/40' : 'border-linha'}`}
                        >
                            <input type="radio" name="motivo" className="mt-1 size-4 accent-acento" checked={motivo === m} onChange={() => setMotivo(m)} />
                            <span className="flex flex-col gap-0.5">
                                <span className="font-semibold text-texto">{r.motivo(m)}</span>
                                <span className="text-texto-suave">{t(`contestacoes.motivoAjuda.${NOME_MOTIVO[m]}`)}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <p className="text-texto-suave">{t('contestacoes.efeito')}</p>
            </form>
        </Dialogo>
    );
}

/* ─────────────── Árbitro: decidir ─────────────── */

export function Arbitragem() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.arbitragem')} />
            <SoPapel papel="arbitro" aviso={t('arbitragem.soArbitro')}>
                <ConteudoArbitragem />
            </SoPapel>
        </>
    );
}

function ConteudoArbitragem() {
    const { t } = useTranslation();
    const lotes = useTodosLotes();
    const r = useRotulos();
    const [filtro, setFiltro] = useState<'abertas' | 'julgadas' | 'todas'>('abertas');
    const [decidir, setDecidir] = useState<Linha | null>(null);
    const [sucesso, setSucesso] = useState('');

    const linhas = useMemo(
        () => (lotes.data ?? []).filter((l) => l.dados.estado.__kind === 'EmDisputa' || l.dados.estado.__kind === 'Reembolsado' || julgada(l.dados) !== null),
        [lotes.data],
    );
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            ...colunasBase(t, r),
            {
                id: 'recebido',
                titulo: t('recebimentos.pesoRecebido'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => l.dados.pesoRecebidoG,
                celula: (l) => (l.dados.pesoRecebidoG > 0n ? r.kg(l.dados.pesoRecebidoG) : '—'),
            },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-56', valor: (l) => l.dados.estado.__kind, celula: (l) => <Situacao l={l.dados} r={r} /> },
        ],
        [t, r],
    );
    const filtrar = useMemo(
        () => (l: Linha) => filtro === 'todas' || (filtro === 'abertas') === (l.dados.estado.__kind === 'EmDisputa'),
        [filtro],
    );
    const grade = useGrade(lotes.data ? linhas : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro: filtrar });
    const sel = grade.selecionada;
    const aberta = sel?.dados.estado.__kind === 'EmDisputa';

    return (
        <div className="flex flex-col gap-4">
            <p className="max-w-3xl text-sm text-texto-suave">{t('arbitragem.explicacao')}</p>
            {sucesso && !decidir && (
                <p role="status" className="rounded-lg bg-acento-suave p-3 text-sm text-acento">
                    {sucesso}
                </p>
            )}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={filtro}
                            onChange={(v) => {
                                setFiltro(v as typeof filtro);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'abertas', texto: t('contestacoes.filtro.abertas') },
                                { valor: 'julgadas', texto: t('arbitragem.julgadas') },
                                { valor: 'todas', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                disabled={!aberta}
                                title={aberta ? undefined : t('arbitragem.selecione')}
                                onClick={() => {
                                    setSucesso('');
                                    if (sel) setDecidir(sel);
                                }}
                            >
                                <Scale className="size-4" /> {t('arbitragem.decidir')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[76rem]"
                    vazio={t(filtro === 'abertas' ? 'arbitragem.vazio' : 'contestacoes.vazio')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => l.dados.estado.__kind === 'EmDisputa' && setDecidir(l)}
                />
            </CartaoGrade>

            {decidir && (
                <DialogoDecidir
                    linha={decidir}
                    rotulos={r}
                    aoFechar={() => {
                        setDecidir(null);
                        lotes.refresh();
                    }}
                    aoConcluir={(msg) => {
                        setSucesso(msg);
                        setDecidir(null);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

type TipoDecisao = 'prosseguir' | 'liberar' | 'reembolsar';

/** Enquanto o código circula: confere se ainda vale (altura do bloco) e se o lote já saiu da disputa. */
function useAcompanharCodigo(linha: Linha, ultimoBloco: bigint | null, aoDecidir: (estado: lote.Lote) => void) {
    const client = useClient<AppClient>();
    const [vencido, setVencido] = useState(false);
    useEffect(() => {
        if (ultimoBloco === null) return;
        setVencido(false);
        let ativo = true;
        const id = setInterval(async () => {
            try {
                const [altura, conta] = await Promise.all([client.rpc.getBlockHeight().send(), lote.fetchLote(client.rpc, linha.endereco)]);
                if (!ativo) return;
                if (conta.data.estado.__kind !== 'EmDisputa') aoDecidir(conta.data);
                else if (altura > ultimoBloco) setVencido(true);
            } catch {
                // tenta de novo no próximo intervalo
            }
        }, 2000);
        return () => {
            ativo = false;
            clearInterval(id);
        };
        // `aoDecidir` muda a cada render; o intervalo só depende do código.
    }, [client, linha.endereco, ultimoBloco]);
    return vencido;
}

function DialogoDecidir({ linha, rotulos: r, aoFechar, aoConcluir }: { linha: Linha; rotulos: Rotulos; aoFechar: () => void; aoConcluir: (mensagem: string) => void }) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const envio = useEnviar();
    const l = linha.dados;
    const origem = l.estado.__kind === 'EmDisputa' ? l.estado.origem : lote.EtapaDisputavel.Vendido;
    const podeLiberar = origem === lote.EtapaDisputavel.Recebido;
    const [tipo, setTipo] = useState<TipoDecisao | null>(null);
    const [novoPeso, setNovoPeso] = useState('');
    const [liberado, setLiberado] = useState('');
    const [referencia, setReferencia] = useState('');
    const [codigo, setCodigo] = useState<{ texto: string; ultimoBloco: bigint } | null>(null);
    const [gerando, setGerando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);

    const peso = novoPeso.trim() === '' ? undefined : kgParaGramas(novoPeso);
    const pesoInvalido = peso === null || peso === 0n;
    const centavos = reaisParaCentavos(liberado);
    const liberadoInvalido = centavos === null || centavos > l.valorCentavos;
    const reembolso = centavos !== null && !liberadoInvalido ? l.valorCentavos - centavos : null;
    const pronto =
        tipo === 'prosseguir'
            ? !pesoInvalido
            : tipo === 'liberar'
              ? !pesoInvalido && !liberadoInvalido && referencia.trim() !== ''
              : tipo === 'reembolsar' && referencia.trim() !== '';

    const vencido = useAcompanharCodigo(linha, codigo?.ultimoBloco ?? null, (novo) =>
        aoConcluir(t('arbitragem.decidida', { lote: l.loteId, estado: t(`estadoLote.${novo.estado.__kind}`) })),
    );

    const gerar = async () => {
        if (tipo === 'prosseguir' || tipo === null || peso === null) return;
        setErro(null);
        setGerando(true);
        try {
            const decisao: DecisaoEscrow =
                tipo === 'liberar'
                    ? { tipo: 'liberar', valorLiberadoCentavos: centavos ?? 0n, novoPesoG: peso, referencia: referencia.trim() }
                    : { tipo: 'reembolsar', referencia: referencia.trim() };
            const p = await prepararDecisao(client, linha.endereco, decisao);
            setCodigo({ texto: p.codigo, ultimoBloco: p.ultimoBloco });
        } catch (e) {
            setErro(e);
        } finally {
            setGerando(false);
        }
    };

    const enviar = async (e: FormEvent) => {
        e.preventDefault();
        if (!pronto || peso === null) return;
        if (tipo !== 'prosseguir') return void gerar();
        try {
            await envio.dispatchAsync([
                await instrucaoDecisao(linha.endereco, client.payer, { __kind: 'Prosseguir', novoPesoG: peso === undefined ? none() : some(peso) }),
            ]);
            aoConcluir(t('arbitragem.prosseguiu', { lote: l.loteId, etapa: r.etapa(origem) }));
        } catch {
            // o erro fica em envio.error
        }
    };

    const opcao = (valor: TipoDecisao, ajuda: string, desabilitada = false) => (
        <label
            className={`flex items-start gap-3 rounded-lg border p-3 ${desabilitada ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
                tipo === valor ? 'border-acento bg-acento-suave/40' : 'border-linha'
            }`}
        >
            <input
                type="radio"
                name="decisao"
                className="mt-1 size-4 accent-acento"
                disabled={desabilitada}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
            />
            <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-texto">{t(`arbitragem.tipo.${valor}`)}</span>
                <span className="text-texto-suave">{ajuda}</span>
            </span>
        </label>
    );

    const resumo = `${r.material(l.material)} | ${r.kg(l.pesoG)} kg | ${l.estado.__kind === 'EmDisputa' ? r.motivo(l.estado.motivo) : ''}`;

    if (codigo) {
        return (
            <Dialogo titulo={t('arbitragem.decidirTitulo', { lote: l.loteId })} subtitulo={resumo} aoFechar={aoFechar}>
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-sm text-texto">{t('arbitragem.passoIntermediador')}</p>
                    <MostrarCodigo codigo={codigo.texto} titulo={t('arbitragem.qrTitulo')} apagado={vencido} />
                    {vencido ? (
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-sm text-kraft">{t('vendas.expirado')}</p>
                            <Botao compacto carregando={gerando} onClick={() => void gerar()}>
                                <PenLine className="size-4" /> {t('retiradas.gerarNovo')}
                            </Botao>
                        </div>
                    ) : (
                        <p className="flex items-center gap-2 text-sm text-texto-suave">
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            {t('arbitragem.aguardando')}
                        </p>
                    )}
                </div>
            </Dialogo>
        );
    }

    return (
        <Dialogo
            titulo={t('arbitragem.decidirTitulo', { lote: l.loteId })}
            subtitulo={resumo}
            formId="form-decisao"
            salvando={envio.isRunning || gerando}
            podeSalvar={pronto}
            rotuloSalvar={t(tipo === 'prosseguir' ? 'arbitragem.assinarEnviar' : 'arbitragem.assinarGerar')}
            iconeSalvar={Scale}
            largura="lg"
            aoFechar={aoFechar}
        >
            <form id="form-decisao" onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4 text-sm">
                <Resultado erro={envio.error ?? erro} sucesso="" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-linha p-3">
                    <dt className="text-texto-suave">{t('trilha.cooperativa')}</dt>
                    <dd className="text-texto">{r.nome(l.cooperativa)}</dd>
                    <dt className="text-texto-suave">{t('trilha.industria')}</dt>
                    <dd className="text-texto">{r.nome(l.industria)}</dd>
                    {l.transportador !== SEM_CONTA && (
                        <>
                            <dt className="text-texto-suave">{t('trilha.transportador')}</dt>
                            <dd className="text-texto">{r.nome(l.transportador)}</dd>
                        </>
                    )}
                    <dt className="text-texto-suave">{t('vendas.valor')}</dt>
                    <dd className="font-semibold text-texto">{r.reais(l.valorCentavos)}</dd>
                    <dt className="text-texto-suave">{t('arbitragem.pesos')}</dt>
                    <dd className="text-texto">
                        {t('arbitragem.pesosValor', { saida: r.kg(l.pesoG), chegada: l.pesoRecebidoG > 0n ? r.kg(l.pesoRecebidoG) : '—' })}
                    </dd>
                    <dt className="text-texto-suave">{t('arbitragem.etapa')}</dt>
                    <dd className="text-texto">{r.etapa(origem)}</dd>
                </dl>
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 font-semibold text-texto">{t('arbitragem.decisao')}</legend>
                    {opcao('prosseguir', t('arbitragem.ajuda.prosseguir', { etapa: r.etapa(origem) }))}
                    {opcao('liberar', t(podeLiberar ? 'arbitragem.ajuda.liberar' : 'arbitragem.ajuda.liberarSoRecebido'), !podeLiberar)}
                    {opcao('reembolsar', t('arbitragem.ajuda.reembolsar'))}
                </fieldset>
                {(tipo === 'prosseguir' || tipo === 'liberar') && (
                    <Campo
                        rotulo={t('arbitragem.novoPeso')}
                        inputMode="decimal"
                        placeholder={r.kg(l.pesoG)}
                        value={novoPeso}
                        onChange={(e) => setNovoPeso(e.target.value)}
                        aria-invalid={pesoInvalido}
                        ajuda={t('arbitragem.novoPesoAjuda')}
                    />
                )}
                {tipo === 'liberar' && (
                    <Campo
                        rotulo={t('arbitragem.valorLiberado')}
                        inputMode="decimal"
                        required
                        placeholder="0,00"
                        value={liberado}
                        onChange={(e) => setLiberado(e.target.value)}
                        aria-invalid={liberado !== '' && liberadoInvalido}
                        ajuda={
                            liberado !== '' && liberadoInvalido
                                ? t('arbitragem.liberadoAcima', { valor: r.reais(l.valorCentavos) })
                                : reembolso !== null
                                  ? t('arbitragem.reembolsoResto', { valor: brl(reembolso, idioma) })
                                  : t('arbitragem.valorLiberadoAjuda', { valor: r.reais(l.valorCentavos) })
                        }
                    />
                )}
                {(tipo === 'liberar' || tipo === 'reembolsar') && (
                    <>
                        <Campo
                            rotulo={t('arbitragem.referencia')}
                            required
                            autoComplete="off"
                            value={referencia}
                            onChange={(e) => setReferencia(e.target.value)}
                            ajuda={t('arbitragem.referenciaAjuda')}
                        />
                        <p className="text-texto-suave">{t(l.vendaDireta ? 'arbitragem.vendaDireta' : 'arbitragem.comIntermediador')}</p>
                    </>
                )}
            </form>
        </Dialogo>
    );
}

/* ─────────────── Intermediador: conferir e assinar a decisão ─────────────── */

/** Lê o código do árbitro, mostra a decisão e acrescenta a assinatura do intermediador. */
export function DialogoAssinarDecisao({ aoFechar, aoConcluir }: { aoFechar: () => void; aoConcluir: (assinatura: string) => void }) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const r = useRotulos();
    const [lida, setLida] = useState<DecisaoLida | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [lendo, setLendo] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);

    const ler = async (texto: string) => {
        setAviso(null);
        setLendo(true);
        try {
            setLida(await lerDecisao(client, texto));
        } catch (e) {
            setAviso(t(e instanceof DecisaoInvalida ? `arbitragem.codigo.${e.motivo}` : 'arbitragem.codigo.formato'));
        } finally {
            setLendo(false);
        }
    };

    const assinar = async (e: FormEvent) => {
        e.preventDefault();
        if (!lida) return;
        setErro(null);
        setEnviando(true);
        try {
            aoConcluir(await assinarEEnviarDecisao(client, lida));
        } catch (e) {
            setErro(e);
        } finally {
            setEnviando(false);
        }
    };

    const d = lida?.decisao;
    return (
        <Dialogo
            titulo={t('arbitragem.assinarDecisao')}
            formId={lida ? 'form-assinar-decisao' : undefined}
            salvando={enviando}
            podeSalvar={!!lida}
            rotuloSalvar={t('arbitragem.confirmarDecisao')}
            aoFechar={aoFechar}
        >
            {!lida || !d ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-texto-suave">{t('arbitragem.lerCodigo')}</p>
                    <LerCodigo aoLer={(texto) => void ler(texto)} instrucaoCamera={t('vendas.aponte')} />
                    {lendo && (
                        <p className="flex items-center gap-2 text-sm text-texto-suave">
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            {t('vendas.conferindo')}
                        </p>
                    )}
                    {aviso && (
                        <p role="alert" className="text-sm text-perigo">
                            {aviso}
                        </p>
                    )}
                </div>
            ) : (
                <form id="form-assinar-decisao" onSubmit={(e) => void assinar(e)} className="flex flex-col gap-3">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('retiradas.confira')}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                        <dt className="text-texto-suave">{t('trilha.loteVenda')}</dt>
                        <dd className="text-texto tabular-nums">#{lida.dados.loteId.toString()}</dd>
                        <dt className="text-texto-suave">{t('trilha.cooperativa')}</dt>
                        <dd className="text-texto">{r.nome(lida.dados.cooperativa)}</dd>
                        <dt className="text-texto-suave">{t('trilha.industria')}</dt>
                        <dd className="text-texto">{r.nome(lida.dados.industria)}</dd>
                        <dt className="text-texto-suave">{t('arbitragem.decisao')}</dt>
                        <dd className="font-semibold text-texto">{t(`arbitragem.tipo.${d.tipo}`)}</dd>
                        {d.tipo === 'liberar' ? (
                            <>
                                <dt className="text-texto-suave">{t('arbitragem.aCooperativa')}</dt>
                                <dd className="text-texto tabular-nums">{r.reais(d.valorLiberadoCentavos)}</dd>
                                <dt className="text-texto-suave">{t('arbitragem.aIndustria')}</dt>
                                <dd className="text-texto tabular-nums">{r.reais(lida.dados.valorCentavos - d.valorLiberadoCentavos)}</dd>
                                {d.novoPesoG !== undefined && (
                                    <>
                                        <dt className="text-texto-suave">{t('arbitragem.novoPesoCurto')}</dt>
                                        <dd className="text-texto tabular-nums">{r.kg(d.novoPesoG)} kg</dd>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <dt className="text-texto-suave">{t('arbitragem.aIndustria')}</dt>
                                <dd className="text-texto tabular-nums">{r.reais(lida.dados.valorCentavos)}</dd>
                            </>
                        )}
                        <dt className="text-texto-suave">{t('arbitragem.referencia')}</dt>
                        <dd className="break-all text-texto">{d.referencia}</dd>
                    </dl>
                    <p className="text-sm text-texto-suave">{t('arbitragem.efeitoIntermediador')}</p>
                </form>
            )}
        </Dialogo>
    );
}
