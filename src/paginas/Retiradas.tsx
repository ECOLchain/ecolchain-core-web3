import { type Address, address, getAddressEncoder } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { CircleCheck, FileText, LoaderCircle, QrCode, RefreshCw, ScanLine, Truck } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { LerCodigo, MostrarCodigo } from '../componentes/CodigoAssinatura';
import { Dialogo } from '../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../componentes/grade';
import { TituloPagina } from '../componentes/pagina';
import { Botao, Campo, Resultado } from '../componentes/ui';
import { usePreferencias } from '../preferencias/Preferencias';
import { resolverCarteira } from '../solana/ator';
import type { AppClient } from '../solana/cliente';
import { type ContaDecodificada, listarContas } from '../solana/contas';
import {
    assinarEEnviarRetirada,
    codigoRetirador,
    lerCodigoRetirador,
    lerRetirada,
    prepararRetirada,
    type RetiradaLida,
    RetiradaInvalida,
    type RetiradaPreparada,
    textoParaMtr,
} from '../solana/retirada';
import { useCadastro } from '../solana/useCadastro';
import { gramasParaKg, useLotes, useLotesDaIndustria, useMateriais, useParticipantes } from '../solana/useDados';
import { rotuloParticipante, SoPapel } from './admin/comum';

/** Endereço "vazio" (Pubkey::default): lote ainda sem transportador. */
const SEM_CONTA = '11111111111111111111111111111111';
/** `Lote.transportador`: depois do `industria` (campos de tamanho fixo antes do `estado`). */
const OFFSET_TRANSPORTADOR = 8 + 32 + 8 + 2 + 8 + 8 + 4 + 8 + 32 + 32 + 8 + 32;
/** Intervalo da conferência (retirada concluída? código expirado?) enquanto o QR está na tela. */
const INTERVALO_MS = 2000;

type Linha = ContaDecodificada<lote.Lote>;

export function Retiradas() {
    const { t } = useTranslation();
    const { cadastro } = useCadastro();
    return (
        <>
            <TituloPagina titulo={t('itens.retiradas')} />
            <SoPapel papel={['cooperativa', 'cleantech', 'transportador', 'industria']} aviso={t('retiradas.soParticipante')}>
                {cadastro?.papeis.includes('cooperativa') || cadastro?.papeis.includes('cleantech') ? (
                    <RetiradasCooperativa />
                ) : cadastro?.papeis.includes('industria') ? (
                    <RetiradasIndustria />
                ) : (
                    <RetiradasDoTransportador />
                )}
            </SoPapel>
        </>
    );
}

/** Nome do participante, nome do material, peso e datas: o que as duas visões mostram. */
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
            data: (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' }),
            /** Número do MTR informado na retirada; traço antes dela (ou nos lotes retirados sem o campo). */
            mtr: (l: lote.Lote) => (l.mtr ? String(l.mtr) : '—'),
            /** Vendido ainda não foi retirado; os demais estados vêm da máquina de estados do lote. */
            situacao: (l: lote.Lote) => (l.estado.__kind === 'Vendido' ? t('retiradas.aguardando') : t(`estadoLote.${l.estado.__kind}`)),
        };
    }, [participantes.data, materiais.data, idioma, t]);
}

function Situacao({ linha, texto }: { linha: Linha; texto: string }) {
    const aguardando = linha.dados.estado.__kind === 'Vendido';
    return (
        <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                aguardando ? 'bg-kraft/15 text-kraft' : 'bg-acento-suave text-acento'
            }`}
        >
            {texto}
        </span>
    );
}

/* ─────────────────────────────── Cooperativa ─────────────────────────────── */

function RetiradasCooperativa() {
    const { t } = useTranslation();
    const { ator } = useCadastro();
    const lotes = useLotes(ator);
    const r = useRotulos();
    const [filtro, setFiltro] = useState<'todas' | 'aguardando' | 'retiradas'>('aguardando');
    const [popup, setPopup] = useState<Linha | null>(null);
    const [concluida, setConcluida] = useState<string | null>(null);

    // Só o que já foi vendido: aguardando retirada ou com transportador registrado.
    const linhas = useMemo(
        () => (lotes.data ?? []).filter((l) => l.dados.estado.__kind === 'Vendido' || l.dados.transportador !== SEM_CONTA),
        [lotes.data],
    );
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => r.material(l.dados.material), largura: 'w-32' },
            { id: 'peso', titulo: t('cooperativa.pesoKg'), valor: (l) => l.dados.pesoG, celula: (l) => r.kg(l.dados.pesoG), numerica: true, largura: 'w-28' },
            { id: 'industria', titulo: t('trilha.industria'), valor: (l) => r.nome(l.dados.industria), busca: (l) => l.dados.industria },
            {
                id: 'prazo',
                titulo: t('retiradas.prazo'),
                largura: 'w-40',
                valor: (l) => l.dados.prazoEntrega,
                celula: (l) => <span className="text-texto-suave">{r.data(l.dados.prazoEntrega)}</span>,
            },
            {
                id: 'transportador',
                titulo: t('papel.transportador'),
                // Retirada própria (ADR 0012): quem retira é a indústria compradora.
                valor: (l) =>
                    l.dados.transportador === SEM_CONTA && l.dados.modoRetirada === lote.ModoRetirada.Propria
                        ? t('retiradas.propria')
                        : r.nome(l.dados.transportador),
                busca: (l) => l.dados.transportador,
            },
            { id: 'mtr', titulo: t('retiradas.mtr'), largura: 'w-28', numerica: true, valor: (l) => l.dados.mtr, busca: (l) => r.mtr(l.dados), celula: (l) => <span className="tabular-nums">{r.mtr(l.dados)}</span> },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-44', valor: (l) => r.situacao(l.dados), celula: (l) => <Situacao linha={l} texto={r.situacao(l.dados)} /> },
        ],
        [t, r],
    );
    const filtrar = useMemo(
        () => (l: Linha) => filtro === 'todas' || (filtro === 'aguardando') === (l.dados.estado.__kind === 'Vendido'),
        [filtro],
    );
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'prazo', desc: false }, filtro: filtrar });
    const sel = grade.selecionada;
    const podeRetirar = sel?.dados.estado.__kind === 'Vendido';

    return (
        <div className="flex flex-col gap-4">
            {concluida && !popup && (
                <p role="status" className="flex items-center gap-2 rounded-lg bg-acento-suave p-3 text-sm text-acento">
                    <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
                    {concluida}
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
                                { valor: 'aguardando', texto: t('retiradas.aguardando') },
                                { valor: 'retiradas', texto: t('retiradas.retiradas') },
                                { valor: 'todas', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                disabled={!podeRetirar}
                                title={podeRetirar ? undefined : t('retiradas.selecione')}
                                onClick={() => {
                                    setConcluida(null);
                                    if (sel) setPopup(sel);
                                }}
                            >
                                <Truck className="size-4" /> {t('retiradas.registrar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[60rem]"
                    vazio={t('retiradas.vazioCooperativa')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => l.dados.estado.__kind === 'Vendido' && setPopup(l)}
                />
            </CartaoGrade>

            {popup && (
                <DialogoRetirada
                    linha={popup}
                    rotulos={r}
                    aoFechar={() => setPopup(null)}
                    aoConcluir={(texto) => {
                        setConcluida(texto);
                        setPopup(null);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

/**
 * Passo 1: ler o código de quem retira (carteira e número do MTR, gerado na tela Retiradas dele).
 * Passo 2: a cooperativa assina e mostra a transação num QR para o transportador assinar e enviar.
 */
function DialogoRetirada({
    linha,
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    rotulos: ReturnType<typeof useRotulos>;
    aoFechar: () => void;
    aoConcluir: (mensagem: string) => void;
}) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const { ator: cooperativa } = useCadastro();
    /** Retirada própria: a indústria compradora assina no lugar do transportador. */
    const propria = linha.dados.modoRetirada === lote.ModoRetirada.Propria;
    /** Quem retira, lido do código dele: titular, carteira que assina (pode ser vinculada) e MTR. */
    const [retirador, setRetirador] = useState<{ titular: Address; assinante: Address; nome: string; mtr: number } | null>(null);
    const [avisoQr, setAvisoQr] = useState<string | null>(null);
    const [preparada, setPreparada] = useState<RetiradaPreparada | null>(null);
    const [expirado, setExpirado] = useState(false);
    const [assinando, setAssinando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);
    const transportador = retirador?.titular ?? '';

    const lerQr = async (texto: string) => {
        setAvisoQr(null);
        const lido = lerCodigoRetirador(texto.trim());
        if (!lido) return setAvisoQr(t('retiradas.qrNaoCarteira'));
        // O código pode ser de uma carteira vinculada ao transportador (ADR 0011): ela assina por ele.
        const quem = await resolverCarteira(client, lido.carteira).catch(() => null);
        if (!quem) return setAvisoQr(t('retiradas.qrSemCadastro'));
        if (propria) {
            if (quem.titular !== linha.dados.industria) return setAvisoQr(t('retiradas.qrNaoCompradora'));
        } else if (quem.participante.papel !== lote.Papel.Transportador) return setAvisoQr(t('retiradas.qrNaoTransportador'));
        if (!quem.participante.ativo) return setAvisoQr(t('retiradas.qrInativo'));
        setRetirador({ titular: quem.titular, assinante: quem.assinante, nome: rotuloParticipante(quem.participante), mtr: lido.mtr });
    };

    const gerar = async () => {
        setErro(null);
        setAssinando(true);
        try {
            setPreparada(
                await prepararRetirada(client, linha.endereco, cooperativa!, retirador!.titular, retirador!.assinante, retirador!.mtr),
            );
            setExpirado(false);
        } catch (e) {
            setErro(e);
        } finally {
            setAssinando(false);
        }
    };

    // Com o QR na tela: a retirada chegou à blockchain? O código ainda vale?
    useEffect(() => {
        if (!preparada || expirado) return;
        let vivo = true;
        const conferir = async () => {
            try {
                const [conta, altura] = await Promise.all([
                    lote.fetchLote(client.rpc, linha.endereco),
                    client.rpc.getBlockHeight().send(),
                ]);
                if (!vivo) return;
                if (conta.data.estado.__kind !== 'Vendido') {
                    aoConcluir(t('retiradas.concluida', { lote: linha.dados.loteId, nome: r.nome(conta.data.transportador) }));
                    return;
                }
                if (altura > preparada.ultimoBloco) setExpirado(true);
            } catch {
                // RPC oscilando: tenta de novo no próximo intervalo
            }
        };
        const id = setInterval(conferir, INTERVALO_MS);
        return () => {
            vivo = false;
            clearInterval(id);
        };
    }, [preparada, expirado, client, linha, aoConcluir, r, t]);

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (retirador) void gerar();
    };

    return (
        <Dialogo
            titulo={t('retiradas.registrar')}
            subtitulo={t('retiradas.resumo', { lote: linha.dados.loteId, material: r.material(linha.dados.material), kg: r.kg(linha.dados.pesoG) })}
            formId={preparada ? undefined : 'form-retirada'}
            salvando={assinando}
            podeSalvar={!!retirador}
            rotuloSalvar={t('retiradas.assinarGerar')}
            iconeSalvar={QrCode}
            aoFechar={aoFechar}
        >
            {!preparada ? (
                <form id="form-retirada" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto-suave">
                        {t(propria ? 'retiradas.passo1Propria' : 'retiradas.passo1', { industria: r.nome(linha.dados.industria) })}
                    </p>
                    {retirador ? (
                        <div className="flex flex-col gap-3">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                                <dt className="text-texto-suave">{t(propria ? 'retiradas.quemRetira' : 'papel.transportador')}</dt>
                                <dd className="text-texto">{retirador.nome}</dd>
                                <dt className="text-texto-suave">{t('retiradas.mtrRotulo')}</dt>
                                <dd className="font-semibold text-texto tabular-nums">{retirador.mtr}</dd>
                            </dl>
                            <Botao type="button" variante="secundario" compacto className="self-start" onClick={() => setRetirador(null)}>
                                <ScanLine className="size-4" /> {t('retiradas.lerOutro')}
                            </Botao>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <LerCodigo aoLer={(texto) => void lerQr(texto)} instrucaoCamera={t('retiradas.aponteTransportador')} />
                            {avisoQr && (
                                <p role="alert" className="text-sm text-perigo">
                                    {avisoQr}
                                </p>
                            )}
                        </div>
                    )}
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('retiradas.passo2', { nome: r.nome(transportador) })}</p>
                    <p className="text-sm text-texto-suave">{t('retiradas.mtrNoCodigo', { mtr: retirador?.mtr })}</p>
                    <MostrarCodigo codigo={preparada.codigo} titulo={t('retiradas.qrTitulo')} apagado={expirado} />
                    {expirado ? (
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-sm text-kraft">{t('retiradas.expirado')}</p>
                            <Botao compacto carregando={assinando} onClick={() => void gerar()}>
                                <RefreshCw className="size-4" /> {t('retiradas.gerarNovo')}
                            </Botao>
                        </div>
                    ) : (
                        <p className="flex items-center gap-2 text-sm text-texto-suave">
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                            {t('retiradas.aguardandoTransportador')}
                        </p>
                    )}
                </div>
            )}
        </Dialogo>
    );
}

/* ─────────────────────────────── Transportador ─────────────────────────────── */

function useLotesDoTransportador(carteira: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () =>
            listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.LOTE_DISCRIMINATOR, lote.getLoteDecoder(), undefined, [
                { offset: OFFSET_TRANSPORTADOR, bytes: getAddressEncoder().encode(carteira!) as Uint8Array },
            ]),
        [client, carteira],
    );
    return useRequest(carteira ? fonte : null);
}

/** Indústria que escolheu retirar ela mesma (ADR 0012): os lotes comprados com retirada própria. */
function RetiradasIndustria() {
    const { ator } = useCadastro();
    const lotes = useLotesDaIndustria(ator);
    const proprias = useMemo(
        () => lotes.data?.filter((l) => l.dados.modoRetirada === lote.ModoRetirada.Propria),
        [lotes.data],
    );
    return <RetiradasTransportador lotes={{ ...lotes, data: proprias }} vazio="retiradas.vazioIndustria" />;
}

function RetiradasDoTransportador() {
    const { ator } = useCadastro();
    return <RetiradasTransportador lotes={useLotesDoTransportador(ator)} vazio="retiradas.vazioTransportador" />;
}

/** Quem retira (transportador ou indústria com retirada própria): lê o QR da cooperativa e assina. */
function RetiradasTransportador({
    lotes,
    vazio,
}: {
    lotes: { data: Linha[] | undefined; status: string; refresh: () => void };
    vazio: string;
}) {
    const { t } = useTranslation();
    const r = useRotulos();
    const [popup, setPopup] = useState(false);
    const [codigo, setCodigo] = useState(false);
    const [assinatura, setAssinatura] = useState<string>();

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
            { id: 'cooperativa', titulo: t('trilha.cooperativa'), valor: (l) => r.nome(l.dados.cooperativa), busca: (l) => l.dados.cooperativa },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => r.material(l.dados.material), largura: 'w-32' },
            { id: 'peso', titulo: t('cooperativa.pesoKg'), valor: (l) => l.dados.pesoG, celula: (l) => r.kg(l.dados.pesoG), numerica: true, largura: 'w-28' },
            { id: 'industria', titulo: t('trilha.industria'), valor: (l) => r.nome(l.dados.industria), busca: (l) => l.dados.industria },
            {
                id: 'prazo',
                titulo: t('retiradas.prazo'),
                largura: 'w-40',
                valor: (l) => l.dados.prazoEntrega,
                celula: (l) => <span className="text-texto-suave">{r.data(l.dados.prazoEntrega)}</span>,
            },
            { id: 'mtr', titulo: t('retiradas.mtr'), largura: 'w-28', numerica: true, valor: (l) => l.dados.mtr, busca: (l) => r.mtr(l.dados), celula: (l) => <span className="tabular-nums">{r.mtr(l.dados)}</span> },
            { id: 'situacao', titulo: t('admin.situacao'), largura: 'w-40', valor: (l) => r.situacao(l.dados), celula: (l) => <Situacao linha={l} texto={r.situacao(l.dados)} /> },
        ],
        [t, r],
    );
    const grade = useGrade(lotes.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'prazo', desc: false } });

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={assinatura} sucesso={t('retiradas.confirmada')} />}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <AcoesGrade>
                            <Botao
                                compacto
                                variante="secundario"
                                onClick={() => {
                                    setAssinatura(undefined);
                                    setCodigo(true);
                                }}
                            >
                                <FileText className="size-4" /> {t('retiradas.gerarCodigo')}
                            </Botao>
                            <Botao
                                compacto
                                onClick={() => {
                                    setAssinatura(undefined);
                                    setPopup(true);
                                }}
                            >
                                <ScanLine className="size-4" /> {t('retiradas.assinar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[60rem]"
                    vazio={t(vazio)}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                />
            </CartaoGrade>

            {codigo && <DialogoCodigoRetirador aoFechar={() => setCodigo(false)} />}

            {popup && (
                <DialogoAssinarRetirada
                    rotulos={r}
                    aoFechar={() => setPopup(false)}
                    aoConcluir={(sig) => {
                        setAssinatura(sig);
                        setPopup(false);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

/**
 * Quem retira informa o número do MTR desta carga e mostra à cooperativa um código com a carteira
 * conectada e o MTR. A cooperativa lê o código e monta a retirada com esse número.
 */
function DialogoCodigoRetirador({ aoFechar }: { aoFechar: () => void }) {
    const { t } = useTranslation();
    const { carteira } = useCadastro();
    const [texto, setTexto] = useState('');
    const [mtr, setMtr] = useState<number | null>(null);
    const valido = textoParaMtr(texto);

    return (
        <Dialogo
            titulo={t('retiradas.gerarCodigo')}
            formId={mtr === null ? 'form-codigo-retirador' : undefined}
            podeSalvar={valido !== null}
            rotuloSalvar={t('retiradas.mostrarCodigo')}
            iconeSalvar={QrCode}
            aoFechar={aoFechar}
        >
            {mtr === null || !carteira ? (
                <form
                    id="form-codigo-retirador"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valido !== null) setMtr(valido);
                    }}
                    className="flex flex-col gap-4"
                >
                    <p className="text-sm text-texto-suave">{t('retiradas.codigoRetiradorPasso')}</p>
                    <Campo
                        rotulo={t('retiradas.mtrRotulo')}
                        inputMode="numeric"
                        maxLength={6}
                        required
                        autoFocus
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
                        aria-invalid={texto !== '' && valido === null}
                        ajuda={texto !== '' && valido === null ? t('retiradas.mtrInvalido') : t('retiradas.mtrAjuda')}
                    />
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-sm text-texto">{t('retiradas.codigoRetiradorMostrar', { mtr })}</p>
                    <MostrarCodigo codigo={codigoRetirador(address(carteira), mtr)} titulo={t('retiradas.codigoRetiradorTitulo')} />
                    <Botao type="button" variante="secundario" compacto onClick={() => setMtr(null)}>
                        {t('retiradas.corrigirMtr')}
                    </Botao>
                </div>
            )}
        </Dialogo>
    );
}

/** O transportador lê o QR da cooperativa, confere o lote e assina a retirada. */
function DialogoAssinarRetirada({
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    rotulos: ReturnType<typeof useRotulos>;
    aoFechar: () => void;
    aoConcluir: (assinatura: string) => void;
}) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const { carteira } = useCadastro();
    const [lida, setLida] = useState<RetiradaLida | null>(null);
    const [dados, setDados] = useState<lote.Lote | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);

    const lerQr = async (texto: string) => {
        setAviso(null);
        setErro(null);
        try {
            const l = await lerRetirada(client, texto, address(carteira!));
            setDados((await lote.fetchLote(client.rpc, l.lote)).data);
            setLida(l);
        } catch (e) {
            setAviso(t(e instanceof RetiradaInvalida ? `retiradas.qr.${e.motivo}` : 'retiradas.qr.formato'));
        }
    };

    const assinar = async (e: FormEvent) => {
        e.preventDefault();
        if (!lida) return;
        setErro(null);
        setEnviando(true);
        try {
            const altura = await client.rpc.getBlockHeight().send();
            if (altura > lida.ultimoBloco) throw new Error('block height exceeded');
            aoConcluir(await assinarEEnviarRetirada(client, lida));
        } catch (e) {
            setErro(e);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Dialogo
            titulo={t('retiradas.assinar')}
            formId={lida ? 'form-assinar-retirada' : undefined}
            salvando={enviando}
            podeSalvar={!!lida}
            rotuloSalvar={t('retiradas.confirmarAssinar')}
            aoFechar={aoFechar}
        >
            {!lida || !dados ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-texto-suave">{t('retiradas.aponte')}</p>
                    <LerCodigo aoLer={(texto) => void lerQr(texto)} instrucaoCamera={t('retiradas.aponteCamera')} />
                    {aviso && (
                        <p role="alert" className="text-sm text-perigo">
                            {aviso}
                        </p>
                    )}
                </div>
            ) : (
                <form id="form-assinar-retirada" onSubmit={assinar} className="flex flex-col gap-3">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('retiradas.confira')}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                        <dt className="text-texto-suave">{t('trilha.loteVenda')}</dt>
                        <dd className="text-texto tabular-nums">#{dados.loteId.toString()}</dd>
                        <dt className="text-texto-suave">{t('trilha.cooperativa')}</dt>
                        <dd className="text-texto">{r.nome(lida.cooperativa)}</dd>
                        <dt className="text-texto-suave">{t('cooperativa.material')}</dt>
                        <dd className="text-texto">{r.material(dados.material)}</dd>
                        <dt className="text-texto-suave">{t('trilha.pesoRotulo')}</dt>
                        <dd className="text-texto tabular-nums">{t('trilha.peso', { kg: r.kg(dados.pesoG) })}</dd>
                        <dt className="text-texto-suave">{t('trilha.industria')}</dt>
                        <dd className="text-texto">{r.nome(dados.industria)}</dd>
                        <dt className="text-texto-suave">{t('retiradas.prazo')}</dt>
                        <dd className="text-texto">{r.data(dados.prazoEntrega)}</dd>
                        <dt className="text-texto-suave">{t('retiradas.mtrRotulo')}</dt>
                        <dd className="font-semibold text-texto tabular-nums">{lida.mtr}</dd>
                    </dl>
                    <p className="text-sm text-texto-suave">{t('retiradas.efeito')}</p>
                </form>
            )}
        </Dialogo>
    );
}
