import { address } from '@solana/kit';
import { useClient } from '@solana/react';
import { Ban, CircleCheck, Gavel, HandCoins, LoaderCircle, PenLine, RefreshCw } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizarReferencia } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { eventAuthority } from '@clientes/pdas';
import { LerCodigo, MostrarCodigo } from '../componentes/CodigoAssinatura';
import { Dialogo } from '../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../componentes/grade';
import { TituloPagina } from '../componentes/pagina';
import { Botao, Campo, Resultado, Selecao } from '../componentes/ui';
import { usePreferencias } from '../preferencias/Preferencias';
import type { AppClient } from '../solana/cliente';
import type { ContaDecodificada } from '../solana/contas';
import { useCadastro } from '../solana/useCadastro';
import {
    brl,
    gramasParaKg,
    reaisParaCentavos,
    useCarteiras,
    useLotesDaIndustria,
    useMateriais,
    useParticipantes,
    useTodosLotes,
} from '../solana/useDados';
import { useEnviar } from '../solana/useEnviar';
import { assinarVenda, CodigoVendaInvalido, type Conferida, codigoVencido, conferir, type DadosVenda, faltam, iniciarVenda, type PapelVenda } from '../solana/venda';
import { abreviar, rotuloParticipante, SoPapel } from './admin/comum';
import { rotuloEstado, rotuloModo } from './venda/comum';

const SEM_CONTA = '11111111111111111111111111111111';
/** Enquanto o código está na tela, confere a cada 2 s se a venda já chegou à blockchain. */
const INTERVALO_MS = 2000;

type Linha = ContaDecodificada<lote.Lote>;

/** Nomes, materiais, valores e datas usados pelas três telas. */
function useRotulos() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const participantes = useParticipantes();
    const materiais = useMateriais();
    return useMemo(() => {
        const cadastro = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados]));
        const nomes = new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome]));
        return {
            participantes: participantes.data ?? [],
            nome: (carteira: string) => {
                if (carteira === SEM_CONTA) return '—';
                const p = cadastro.get(carteira);
                return p ? rotuloParticipante(p) : carteira;
            },
            material: (codigo: number) => nomes.get(codigo) ?? String(codigo),
            kg: (g: bigint) => gramasParaKg(g, idioma),
            reais: (c: bigint) => brl(c, idioma),
            data: (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' }),
            situacao: (l: lote.Lote) => rotuloEstado(t, l),
        };
    }, [participantes.data, materiais.data, idioma, t]);
}
type Rotulos = ReturnType<typeof useRotulos>;

function Situacao({ linha, texto }: { linha: Linha; texto: string }) {
    const anunciado = linha.dados.estado.__kind === 'Anunciado';
    return (
        <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                anunciado ? 'bg-kraft/15 text-kraft' : 'bg-acento-suave text-acento'
            }`}
        >
            {texto}
        </span>
    );
}

/** Colunas comuns: lote, cooperativa, material, peso, indústria, valor e situação. */
function colunasBase(t: (k: string) => string, r: Rotulos): Coluna<Linha>[] {
    return [
        { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
        { id: 'cooperativa', titulo: t('trilha.cooperativa'), valor: (l) => r.nome(l.dados.cooperativa), busca: (l) => l.dados.cooperativa },
        { id: 'material', titulo: t('cooperativa.material'), valor: (l) => r.material(l.dados.material), largura: 'w-28' },
        { id: 'peso', titulo: t('cooperativa.pesoKg'), valor: (l) => l.dados.pesoG, celula: (l) => r.kg(l.dados.pesoG), numerica: true, largura: 'w-24' },
    ];
}

/* ───────────────────────── Administração: Leilões ───────────────────────── */

export function Leiloes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.leiloes')} />
            <SoPapel papel="operador" aviso={t('admin.soAdministracao')}>
                <ConteudoLeiloes />
            </SoPapel>
        </>
    );
}

function ConteudoLeiloes() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const lotes = useTodosLotes();
    const r = useRotulos();
    const envio = useEnviar();
    const [filtro, setFiltro] = useState<'anunciados' | 'vendidos' | 'todos'>('anunciados');
    const [popup, setPopup] = useState<Linha | null>(null);
    const [concluida, setConcluida] = useState<string | null>(null);
    const agora = BigInt(Math.floor(Date.now() / 1000));

    const linhas = useMemo(
        () =>
            (lotes.data ?? []).filter(
                (l) => ['Anunciado', 'SemLance'].includes(l.dados.estado.__kind) || l.dados.industria !== SEM_CONTA,
            ),
        [lotes.data],
    );
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            ...colunasBase(t, r),
            { id: 'minimo', titulo: t('vendas.precoMinimo'), valor: (l) => l.dados.precoMinimoCentavos, celula: (l) => r.reais(l.dados.precoMinimoCentavos), numerica: true, largura: 'w-32' },
            {
                id: 'prazo',
                titulo: t('vendas.prazoLeilao'),
                largura: 'w-36',
                valor: (l) => (l.dados.estado.__kind === 'Anunciado' ? l.dados.estado.prazoLeilao : 0n),
                celula: (l) => <span className="text-texto-suave">{l.dados.estado.__kind === 'Anunciado' ? r.data(l.dados.estado.prazoLeilao) : '—'}</span>,
            },
            {
                id: 'lances',
                titulo: t('venda.maiorLance'),
                largura: 'w-44',
                numerica: true,
                valor: (l) => l.dados.maiorLanceCentavos,
                celula: (l) =>
                    l.dados.qtdLances === 0 ? (
                        <span className="text-texto-suave">—</span>
                    ) : (
                        <span className="flex flex-col items-end">
                            <span className="font-semibold text-texto">{r.reais(l.dados.maiorLanceCentavos)}</span>
                            <span className="text-xs text-texto-suave">
                                {r.nome(l.dados.lanceLider)} · {t('venda.qtdLances', { count: l.dados.qtdLances })}
                            </span>
                        </span>
                    ),
            },
            { id: 'industria', titulo: t('trilha.industria'), valor: (l) => r.nome(l.dados.industria), busca: (l) => l.dados.industria },
            { id: 'valor', titulo: t('vendas.valor'), valor: (l) => l.dados.valorCentavos, celula: (l) => (l.dados.valorCentavos > 0n ? r.reais(l.dados.valorCentavos) : '—'), numerica: true, largura: 'w-32' },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-36', valor: (l) => r.situacao(l.dados), celula: (l) => <Situacao linha={l} texto={r.situacao(l.dados)} /> },
        ],
        [t, r],
    );
    const filtrar = useMemo(
        () => (l: Linha) =>
            filtro === 'todos' ||
            (filtro === 'anunciados' ? l.dados.estado.__kind === 'Anunciado' : l.dados.industria !== SEM_CONTA),
        [filtro],
    );
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'prazo', desc: false }, filtro: filtrar });
    const sel = grade.selecionada;
    const anunciado = sel?.dados.estado.__kind === 'Anunciado' ? sel.dados.estado : null;
    const prazoVencido = !!anunciado && agora >= anunciado.prazoLeilao;
    // Leilão com lances on-chain (ADR 0013): a venda espera o prazo e não se encerra "sem lance".
    const comLances = !!sel && sel.dados.qtdLances > 0;
    const aguardandoPrazo = comLances && !prazoVencido;

    const encerrar = async () => {
        if (!sel) return;
        setConcluida(null);
        await envio.dispatchAsync([
            await lote.getOperadorCloseLeilaoSemLanceInstructionAsync({
                operador: client.payer,
                lote: sel.endereco,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
            }),
        ]).catch(() => undefined);
        lotes.refresh();
    };

    return (
        <div className="flex flex-col gap-4">
            {concluida && !popup && (
                <p role="status" className="flex items-center gap-2 rounded-lg bg-acento-suave p-3 text-sm text-acento">
                    <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                    {concluida}
                </p>
            )}
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('vendas.encerrado')} />}
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
                                { valor: 'anunciados', texto: t('vendas.anunciados') },
                                { valor: 'vendidos', texto: t('vendas.vendidos') },
                                { valor: 'todos', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            {prazoVencido && !comLances && (
                                <Botao compacto variante="secundario" carregando={envio.isRunning} onClick={() => void encerrar()}>
                                    <Ban className="size-4" /> {t('vendas.encerrarSemLance')}
                                </Botao>
                            )}
                            <Botao
                                compacto
                                disabled={!anunciado || aguardandoPrazo}
                                title={!anunciado ? t('vendas.selecione') : aguardandoPrazo ? t('vendas.aguardaPrazoLances') : undefined}
                                onClick={() => {
                                    setConcluida(null);
                                    if (sel) setPopup(sel);
                                }}
                            >
                                <Gavel className="size-4" /> {t('vendas.registrar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[72rem]"
                    vazio={t('vendas.vazioLeiloes')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) =>
                        l.dados.estado.__kind === 'Anunciado' &&
                        !(l.dados.qtdLances > 0 && agora < l.dados.estado.prazoLeilao) &&
                        setPopup(l)
                    }
                />
            </CartaoGrade>

            {popup && (
                <DialogoRegistrarVenda
                    linha={popup}
                    rotulos={r}
                    aoFechar={() => {
                        setPopup(null);
                        lotes.refresh();
                    }}
                    aoConcluir={(msg) => {
                        setConcluida(msg);
                        setPopup(null);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

/** Enquanto o código circula, avisa quando o lote sair de `Anunciado` (venda enviada). */
function useAguardarVenda(lote_: Linha | null, ativo: boolean, aoVender: (l: lote.Lote) => void) {
    const client = useClient<AppClient>();
    const callback = useRef(aoVender);
    callback.current = aoVender;
    useEffect(() => {
        if (!lote_ || !ativo) return;
        let vivo = true;
        const id = setInterval(async () => {
            try {
                const conta = await lote.fetchLote(client.rpc, lote_.endereco);
                if (vivo && conta.data.estado.__kind !== 'Anunciado') callback.current(conta.data);
            } catch {
                // RPC oscilando: tenta de novo no próximo intervalo
            }
        }, INTERVALO_MS);
        return () => {
            vivo = false;
            clearInterval(id);
        };
    }, [client, lote_, ativo]);
}

/** Com o código na tela: o blockhash dele ainda vale? (cerca de um minuto) */
function useCodigoVencido(dados: DadosVenda | null) {
    const client = useClient<AppClient>();
    const [vencido, setVencido] = useState(false);
    useEffect(() => {
        setVencido(false);
        if (!dados) return;
        let vivo = true;
        const id = setInterval(async () => {
            try {
                if (vivo && (await codigoVencido(client, dados))) setVencido(true);
            } catch {
                // RPC oscilando: tenta de novo no próximo intervalo
            }
        }, INTERVALO_MS);
        return () => {
            vivo = false;
            clearInterval(id);
        };
    }, [client, dados]);
    return vencido;
}

function DialogoRegistrarVenda({
    linha,
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    rotulos: Rotulos;
    aoFechar: () => void;
    aoConcluir: (mensagem: string) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    // Com lances on-chain, a vencedora e o valor vêm do maior lance (o programa não aceita outros).
    const vencedor = linha.dados.qtdLances > 0;
    const [industria, setIndustria] = useState(vencedor ? (linha.dados.lanceLider as string) : '');
    /** Carteira que vai assinar pela indústria (vazio = a titular). */
    const [assinanteInd, setAssinanteInd] = useState('');
    const carteirasInd = useCarteiras(industria ? address(industria) : undefined);
    const vinculadas = (carteirasInd.data ?? []).filter((c) => c.dados.ativa && c.dados.endereco !== industria);
    const [valor, setValor] = useState(
        vencedor ? (Number(linha.dados.maiorLanceCentavos) / 100).toLocaleString(idioma, { minimumFractionDigits: 2 }) : '',
    );
    const [deposito, setDeposito] = useState('');
    const [ata, setAta] = useState('');
    const [codigo, setCodigo] = useState<string | null>(null);
    const [dados, setDados] = useState<DadosVenda | null>(null);
    const [assinando, setAssinando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);
    const expirado = useCodigoVencido(dados);

    const industrias = useMemo(
        () =>
            r.participantes
                .filter((p) => p.dados.papel === lote.Papel.Industria && p.dados.ativo)
                .sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [r.participantes],
    );
    const centavos = reaisParaCentavos(valor);
    const abaixo = centavos !== null && centavos < linha.dados.precoMinimoCentavos;
    const pronto = !!industria && centavos !== null && !abaixo && deposito.trim() !== '' && ata.trim() !== '';

    useAguardarVenda(linha, !!codigo, (l) =>
        aoConcluir(t('vendas.concluida', { lote: linha.dados.loteId, nome: r.nome(l.industria), valor: r.reais(l.valorCentavos) })),
    );

    const gerar = async () => {
        if (!pronto || centavos === null) return;
        setErro(null);
        setAssinando(true);
        try {
            const { codigo: c, dados: d } = await iniciarVenda(client, {
                lote: linha.endereco,
                industria: address(industria),
                industriaAssinante: address(assinanteInd || industria),
                valorCentavos: centavos,
                deposito: deposito.trim(),
                ata: ata.trim(),
            });
            setCodigo(c);
            setDados(d);
        } catch (e) {
            setErro(e);
        } finally {
            setAssinando(false);
        }
    };

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        void gerar();
    };

    return (
        <Dialogo
            titulo={t('vendas.registrar')}
            subtitulo={t('retiradas.resumo', { lote: linha.dados.loteId, material: r.material(linha.dados.material), kg: r.kg(linha.dados.pesoG) })}
            formId={codigo ? undefined : 'form-venda'}
            salvando={assinando}
            podeSalvar={pronto}
            rotuloSalvar={t('vendas.assinarGerar')}
            iconeSalvar={PenLine}
            aoFechar={aoFechar}
        >
            {!codigo ? (
                <form id="form-venda" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto-suave">
                        {t('vendas.passo1', { cooperativa: r.nome(linha.dados.cooperativa), minimo: r.reais(linha.dados.precoMinimoCentavos) })}
                    </p>
                    {vencedor && <p className="rounded-lg bg-acento-suave p-3 text-sm text-acento">{t('vendas.vencedorLances', { count: linha.dados.qtdLances })}</p>}
                    {industrias.length === 0 ? (
                        <p className="text-sm text-kraft">{t('vendas.semIndustrias')}</p>
                    ) : (
                        <Selecao
                            rotulo={t('vendas.vencedora')}
                            required
                            disabled={vencedor}
                            value={industria}
                            onChange={(e) => {
                                setIndustria(e.target.value);
                                setAssinanteInd('');
                            }}
                        >
                            <option value="" disabled>
                                {t('vendas.escolherIndustria')}
                            </option>
                            {industrias.map((p) => (
                                <option key={p.endereco} value={p.dados.carteira}>
                                    {rotuloParticipante(p.dados)}
                                </option>
                            ))}
                        </Selecao>
                    )}
                    {vinculadas.length > 0 && (
                        <Selecao
                            rotulo={t('vendas.carteiraIndustria')}
                            value={assinanteInd}
                            onChange={(e) => setAssinanteInd(e.target.value)}
                        >
                            <option value="">{t('carteiras.titular')}</option>
                            {vinculadas.map((c) => (
                                <option key={c.endereco} value={c.dados.endereco}>
                                    {`${lerNomeFixo(c.dados.nome)} — ${abreviar(c.dados.endereco)}`}
                                </option>
                            ))}
                        </Selecao>
                    )}
                    <Campo
                        rotulo={t('vendas.valorLance')}
                        inputMode="decimal"
                        required
                        readOnly={vencedor}
                        placeholder="0,00"
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                        ajuda={abaixo ? t('vendas.abaixoMinimo', { minimo: r.reais(linha.dados.precoMinimoCentavos) }) : undefined}
                    />
                    <Campo
                        rotulo={t('vendas.deposito')}
                        required
                        autoComplete="off"
                        value={deposito}
                        onChange={(e) => setDeposito(e.target.value)}
                        ajuda={t('vendas.depositoAjuda')}
                    />
                    <Campo
                        rotulo={t('vendas.ata')}
                        required
                        autoComplete="off"
                        value={ata}
                        onChange={(e) => setAta(e.target.value)}
                        ajuda={t('vendas.ataAjuda')}
                    />
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('vendas.passo2')}</p>
                    <MostrarCodigo codigo={codigo} titulo={t('vendas.qrTitulo')} apagado={expirado} />
                    {expirado ? (
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-sm text-kraft">{t('vendas.expirado')}</p>
                            <Botao compacto carregando={assinando} onClick={() => void gerar()}>
                                <RefreshCw className="size-4" /> {t('retiradas.gerarNovo')}
                            </Botao>
                        </div>
                    ) : (
                        <p className="flex items-center gap-2 text-sm text-texto-suave">
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            {t('vendas.aguardando')}
                        </p>
                    )}
                </div>
            )}
        </Dialogo>
    );
}

/* ─────────────── Intermediador e indústria: conferir e assinar ─────────────── */

/** Lê o código, mostra o que será assinado e acrescenta a assinatura da carteira conectada. */
function DialogoAssinarVenda({
    papel,
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    papel: Exclude<PapelVenda, 'operador'>;
    rotulos: Rotulos;
    aoFechar: () => void;
    aoConcluir: (resultado: { enviada: string } | { codigo: string }) => void;
}) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const [conferida, setConferida] = useState<Conferida | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [lendo, setLendo] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);
    const [proximo, setProximo] = useState<string | null>(null);
    const proximoVencido = useCodigoVencido(proximo ? (conferida?.dados ?? null) : null);

    const ler = async (texto: string) => {
        setAviso(null);
        setLendo(true);
        try {
            const c = await conferir(client, texto);
            if (c.assinaturas[papel]) throw new CodigoVendaInvalido('jaAssinado');
            setConferida(c);
        } catch (e) {
            setAviso(t(e instanceof CodigoVendaInvalido ? `vendas.codigo.${e.motivo}` : 'vendas.codigo.formato'));
        } finally {
            setLendo(false);
        }
    };

    const assinar = async (e: FormEvent) => {
        e.preventDefault();
        if (!conferida) return;
        setErro(null);
        setEnviando(true);
        try {
            const resultado = await assinarVenda(client, conferida, papel);
            if ('enviada' in resultado) aoConcluir(resultado);
            else setProximo(resultado.codigo);
        } catch (e) {
            setErro(e);
        } finally {
            setEnviando(false);
        }
    };

    const titulo = t(papel === 'industria' ? 'vendas.aceitar' : 'vendas.assinarDeposito');
    if (proximo) {
        const quem = faltam(conferida?.assinaturas ?? {}).filter((p) => p !== papel);
        return (
            <Dialogo titulo={titulo} aoFechar={() => aoConcluir({ codigo: proximo })}>
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-sm text-texto">{t('vendas.assinadoProximo', { quem: quem.map((p) => t(`vendas.papel.${p}`)).join(', ') })}</p>
                    <MostrarCodigo codigo={proximo} titulo={t('vendas.qrTitulo')} apagado={proximoVencido} />
                    {proximoVencido && <p className="text-sm text-kraft">{t('vendas.codigo.vencido')}</p>}
                </div>
            </Dialogo>
        );
    }

    return (
        <Dialogo
            titulo={titulo}
            formId={conferida ? 'form-assinar-venda' : undefined}
            salvando={enviando}
            podeSalvar={!!conferida}
            rotuloSalvar={t(papel === 'industria' ? 'vendas.confirmarCompra' : 'vendas.confirmarDeposito')}
            aoFechar={aoFechar}
        >
            {!conferida ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-texto-suave">{t('vendas.lerCodigo')}</p>
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
                <form id="form-assinar-venda" onSubmit={assinar} className="flex flex-col gap-3">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('retiradas.confira')}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                        <dt className="text-texto-suave">{t('trilha.loteVenda')}</dt>
                        <dd className="text-texto tabular-nums">#{conferida.lote.loteId.toString()}</dd>
                        <dt className="text-texto-suave">{t('trilha.cooperativa')}</dt>
                        <dd className="text-texto">{r.nome(conferida.lote.cooperativa)}</dd>
                        <dt className="text-texto-suave">{t('cooperativa.material')}</dt>
                        <dd className="text-texto">
                            {r.material(conferida.lote.material)}, {t('trilha.peso', { kg: r.kg(conferida.lote.pesoG) })}
                        </dd>
                        <dt className="text-texto-suave">{t('vendas.vencedora')}</dt>
                        <dd className="text-texto">{r.nome(conferida.dados.industria)}</dd>
                        <dt className="text-texto-suave">{t('vendas.valor')}</dt>
                        <dd className="font-semibold text-texto tabular-nums">{r.reais(conferida.dados.valorCentavos)}</dd>
                        <dt className="text-texto-suave">{t('vendas.deposito')}</dt>
                        <dd className="text-texto break-all">{conferida.dados.deposito}</dd>
                        <dt className="text-texto-suave">{t('vendas.ata')}</dt>
                        <dd className="text-texto break-all">{conferida.dados.ata}</dd>
                        <dt className="text-texto-suave">{t('vendas.assinaturas')}</dt>
                        <dd className="flex flex-wrap gap-1.5">
                            {(['operador', 'intermediador', 'industria'] as const).map((p) => (
                                <span
                                    key={p}
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        conferida.assinaturas[p] ? 'bg-acento-suave text-acento' : 'bg-kraft/15 text-kraft'
                                    }`}
                                >
                                    {t(conferida.assinaturas[p] ? 'vendas.assinou' : 'vendas.falta', { papel: t(`vendas.papel.${p}`) })}
                                </span>
                            ))}
                        </dd>
                    </dl>
                    <p className="text-sm text-texto-suave">{t(papel === 'industria' ? 'vendas.efeitoIndustria' : 'vendas.efeitoIntermediador')}</p>
                </form>
            )}
        </Dialogo>
    );
}

/** Grade + botão de assinar, comum ao intermediador (todas as vendas) e à indústria (as suas). */
function TelaAssinatura({
    papel,
    linhas,
    carregando,
    recarregar,
    vazio,
}: {
    papel: Exclude<PapelVenda, 'operador'>;
    linhas: Linha[] | undefined;
    carregando: boolean;
    recarregar: () => void;
    vazio: string;
}) {
    const { t } = useTranslation();
    const r = useRotulos();
    const [popup, setPopup] = useState(false);
    const [resultado, setResultado] = useState<{ enviada: string } | { codigo: string } | null>(null);
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            ...colunasBase(t, r),
            ...(papel === 'intermediador'
                ? [{ id: 'industria', titulo: t('trilha.industria'), valor: (l: Linha) => r.nome(l.dados.industria), busca: (l: Linha) => l.dados.industria }]
                : []),
            { id: 'valor', titulo: t('vendas.valor'), valor: (l) => l.dados.valorCentavos, celula: (l) => r.reais(l.dados.valorCentavos), numerica: true, largura: 'w-32' },
            // Compra direta (ADR 0012): quem retira; nas vendas por leilão, "Leilão".
            {
                id: 'retirada',
                titulo: t('venda.retirada'),
                largura: 'w-36',
                valor: (l: Linha) => (l.dados.vendaDireta ? rotuloModo(t, l.dados.modoRetirada) : t('venda.leilao')),
                celula: (l: Linha) => (
                    <span className="text-texto-suave">{l.dados.vendaDireta ? rotuloModo(t, l.dados.modoRetirada) : t('venda.leilao')}</span>
                ),
            },
            { id: 'prazo', titulo: t('retiradas.prazo'), largura: 'w-36', valor: (l) => l.dados.prazoEntrega, celula: (l) => <span className="text-texto-suave">{r.data(l.dados.prazoEntrega)}</span> },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-36', valor: (l) => r.situacao(l.dados), celula: (l) => <Situacao linha={l} texto={r.situacao(l.dados)} /> },
        ],
        [t, r, papel],
    );
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'prazo', desc: true } });

    return (
        <div className="flex flex-col gap-4">
            {resultado && !popup && 'enviada' in resultado && (
                <Resultado assinatura={resultado.enviada} sucesso={t('vendas.enviada')} />
            )}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <AcoesGrade>
                            <Botao
                                compacto
                                onClick={() => {
                                    setResultado(null);
                                    setPopup(true);
                                }}
                            >
                                <PenLine className="size-4" /> {t(papel === 'industria' ? 'vendas.aceitar' : 'vendas.assinarDeposito')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade grade={grade} larguraMinima={papel === 'industria' ? 'min-w-[60rem]' : 'min-w-[70rem]'} vazio={vazio} carregando={carregando} />
            </CartaoGrade>
            {popup && (
                <DialogoAssinarVenda
                    papel={papel}
                    rotulos={r}
                    aoFechar={() => setPopup(false)}
                    aoConcluir={(res) => {
                        setResultado(res);
                        setPopup(false);
                        recarregar();
                    }}
                />
            )}
        </div>
    );
}

/* ───────────────────── Intermediador: Escrow dos lotes ───────────────────── */

export function EscrowLotes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.escrow')} />
            <SoPapel papel="intermediador" aviso={t('vendas.soIntermediador')}>
                <ConteudoEscrow />
            </SoPapel>
        </>
    );
}

/** Situações do escrow: retido até o recebimento, aguardando liberação, liberado ou devolvido. */
type FiltroEscrow = 'aguardando' | 'retido' | 'liberados' | 'todos';
const RETIDO = ['Vendido', 'EmTransporte', 'Recebido', 'EmDisputa'];
const LIBERADO = ['Reciclado', 'Agregado'];
const DOMINIO_LIBERACAO = 'ECOLCHAIN:LIBERACAO:v1';

function ConteudoEscrow() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const lotes = useTodosLotes();
    const r = useRotulos();
    const envio = useEnviar();
    const [filtro, setFiltro] = useState<FiltroEscrow>('aguardando');
    const [popup, setPopup] = useState<{ tipo: 'venda' } | { tipo: 'liberar'; linha: Linha } | null>(null);
    const [resultadoVenda, setResultadoVenda] = useState<{ enviada: string } | { codigo: string } | null>(null);
    const [sucesso, setSucesso] = useState('');

    const linhas = useMemo(() => (lotes.data ?? []).filter((l) => l.dados.industria !== SEM_CONTA), [lotes.data]);
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            ...colunasBase(t, r),
            { id: 'industria', titulo: t('trilha.industria'), valor: (l) => r.nome(l.dados.industria), busca: (l) => l.dados.industria },
            { id: 'valor', titulo: t('vendas.valor'), valor: (l) => l.dados.valorCentavos, celula: (l) => r.reais(l.dados.valorCentavos), numerica: true, largura: 'w-32' },
            {
                id: 'recebido',
                titulo: t('recebimentos.pesoRecebido'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => l.dados.pesoRecebidoG,
                celula: (l) =>
                    l.dados.pesoRecebidoG > 0n ? (
                        <span title={t(l.dados.recebimentoAtestado ? 'recebimentos.atestado' : 'recebimentos.informado')}>
                            {r.kg(l.dados.pesoRecebidoG)}
                            {l.dados.recebimentoAtestado && <span className="ml-1 text-acento">✓</span>}
                        </span>
                    ) : (
                        '—'
                    ),
            },
            {
                id: 'escrow',
                titulo: t('escrow.coluna'),
                largura: 'w-44',
                valor: (l) => escrowDe(l.dados),
                celula: (l) => {
                    const e = escrowDe(l.dados);
                    const cor = e === 'aguardando' ? 'bg-kraft/15 text-kraft' : e === 'liberado' ? 'bg-acento-suave text-acento' : 'bg-superficie-2 text-texto-suave';
                    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>{t(`escrow.situacao.${e}`)}</span>;
                },
            },
        ],
        [t, r],
    );
    const filtrar = useMemo(
        () => (l: Linha) => {
            const k = l.dados.estado.__kind;
            if (filtro === 'aguardando') return k === 'Recebido';
            if (filtro === 'retido') return RETIDO.includes(k);
            if (filtro === 'liberados') return LIBERADO.includes(k);
            return true;
        },
        [filtro],
    );
    const grade = useGrade(lotes.data ? linhas : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro: filtrar });
    const sel = grade.selecionada;
    const podeLiberar = sel?.dados.estado.__kind === 'Recebido';

    const liberar = async (linha: Linha, referencia: string) => {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DOMINIO_LIBERACAO + normalizarReferencia(referencia))));
        try {
            await envio.dispatchAsync([
                await lote.getIntermediadorConfirmLiberacaoInstructionAsync({
                    intermediador: client.payer,
                    lote: linha.endereco,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    liberacaoRefHash: hash,
                }),
            ]);
            setSucesso(t('escrow.liberado', { lote: linha.dados.loteId, valor: r.reais(linha.dados.valorCentavos), nome: r.nome(linha.dados.cooperativa) }));
            setPopup(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!popup && resultadoVenda && 'enviada' in resultadoVenda && <Resultado assinatura={resultadoVenda.enviada} sucesso={t('vendas.enviada')} />}
            {!popup && !resultadoVenda && <Resultado assinatura={envio.data} erro={envio.error} sucesso={sucesso} />}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('escrow.coluna')}
                            valor={filtro}
                            onChange={(v) => {
                                setFiltro(v as FiltroEscrow);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'aguardando', texto: t('escrow.situacao.aguardando') },
                                { valor: 'retido', texto: t('escrow.filtroRetido') },
                                { valor: 'liberados', texto: t('escrow.filtroLiberados') },
                                { valor: 'todos', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                variante="secundario"
                                onClick={() => {
                                    setResultadoVenda(null);
                                    setPopup({ tipo: 'venda' });
                                }}
                            >
                                <PenLine className="size-4" /> {t('vendas.assinarDeposito')}
                            </Botao>
                            <Botao
                                compacto
                                disabled={!podeLiberar}
                                title={podeLiberar ? undefined : t('escrow.selecione')}
                                onClick={() => {
                                    envio.reset();
                                    setResultadoVenda(null);
                                    if (sel) setPopup({ tipo: 'liberar', linha: sel });
                                }}
                            >
                                <HandCoins className="size-4" /> {t('escrow.liberar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[66rem]"
                    vazio={t(filtro === 'aguardando' ? 'escrow.vazioAguardando' : 'vendas.vazioEscrow')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => l.dados.estado.__kind === 'Recebido' && setPopup({ tipo: 'liberar', linha: l })}
                />
            </CartaoGrade>

            {popup?.tipo === 'venda' && (
                <DialogoAssinarVenda
                    papel="intermediador"
                    rotulos={r}
                    aoFechar={() => setPopup(null)}
                    aoConcluir={(res) => {
                        setResultadoVenda(res);
                        setPopup(null);
                        lotes.refresh();
                    }}
                />
            )}
            {popup?.tipo === 'liberar' && (
                <DialogoLiberacao
                    linha={popup.linha}
                    rotulos={r}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={(ref) => void liberar(popup.linha, ref)}
                />
            )}
        </div>
    );
}

/** Onde está o dinheiro do lote, do ponto de vista do intermediador. */
function escrowDe(l: lote.Lote): 'retido' | 'aguardando' | 'liberado' | 'devolvido' | 'emDisputa' {
    const k = l.estado.__kind;
    if (k === 'Recebido') return 'aguardando';
    if (k === 'EmDisputa') return 'emDisputa';
    if (LIBERADO.includes(k)) return 'liberado';
    if (k === 'Reembolsado') return 'devolvido';
    return 'retido';
}

/** Confere o recebimento e registra a referência do repasse à cooperativa. */
function DialogoLiberacao({
    linha,
    rotulos: r,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    rotulos: Rotulos;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (referencia: string) => void;
}) {
    const { t } = useTranslation();
    const [referencia, setReferencia] = useState('');
    const d = linha.dados;
    return (
        <Dialogo
            titulo={t('escrow.liberar')}
            subtitulo={t('retiradas.resumo', { lote: d.loteId, material: r.material(d.material), kg: r.kg(d.pesoG) })}
            formId="form-liberacao"
            salvando={salvando}
            podeSalvar={referencia.trim() !== ''}
            rotuloSalvar={t('escrow.confirmar')}
            iconeSalvar={HandCoins}
            aoFechar={aoFechar}
        >
            <form
                id="form-liberacao"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (referencia.trim()) aoSalvar(referencia.trim());
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                    <dt className="text-texto-suave">{t('escrow.recebedor')}</dt>
                    <dd className="text-texto">{r.nome(d.cooperativa)}</dd>
                    <dt className="text-texto-suave">{t('escrow.pagador')}</dt>
                    <dd className="text-texto">{r.nome(d.industria)}</dd>
                    <dt className="text-texto-suave">{t('vendas.valor')}</dt>
                    <dd className="font-semibold text-texto tabular-nums">{r.reais(d.valorCentavos)}</dd>
                    <dt className="text-texto-suave">{t('recebimentos.pesoSaida')}</dt>
                    <dd className="text-texto tabular-nums">{t('trilha.peso', { kg: r.kg(d.pesoG) })}</dd>
                    <dt className="text-texto-suave">{t('recebimentos.pesoRecebido')}</dt>
                    <dd className="text-texto tabular-nums">
                        {t('trilha.peso', { kg: r.kg(d.pesoRecebidoG) })}{' '}
                        <span className={d.recebimentoAtestado ? 'text-acento' : 'text-kraft'}>
                            ({t(d.recebimentoAtestado ? 'recebimentos.atestado' : 'recebimentos.informado')})
                        </span>
                    </dd>
                </dl>
                <Campo
                    rotulo={t('escrow.referencia')}
                    required
                    autoFocus
                    autoComplete="off"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    ajuda={t('escrow.referenciaAjuda')}
                />
                <p className="text-sm text-texto-suave">{t('escrow.efeito')}</p>
            </form>
        </Dialogo>
    );
}

/* ─────────────────────────── Indústria: Compras ─────────────────────────── */

export function Compras() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.compras')} />
            <SoPapel papel="industria" aviso={t('vendas.soIndustria')}>
                <ConteudoCompras />
            </SoPapel>
        </>
    );
}

function ConteudoCompras() {
    const { t } = useTranslation();
    const { ator } = useCadastro();
    const lotes = useLotesDaIndustria(ator);
    return (
        <TelaAssinatura
            papel="industria"
            linhas={lotes.data ?? undefined}
            carregando={lotes.status === 'fetching' && !lotes.data}
            recarregar={lotes.refresh}
            vazio={t('vendas.vazioCompras')}
        />
    );
}
