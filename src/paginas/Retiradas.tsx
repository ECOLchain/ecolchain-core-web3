import { type Address, address, getAddressEncoder, isAddress } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { CircleCheck, LoaderCircle, QrCode, RefreshCw, ScanLine, Truck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { Dialogo } from '../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../componentes/grade';
import { LeitorQr } from '../componentes/LeitorQr';
import { TituloPagina } from '../componentes/pagina';
import { Botao, Resultado, Selecao } from '../componentes/ui';
import { usePreferencias } from '../preferencias/Preferencias';
import type { AppClient } from '../solana/cliente';
import { type ContaDecodificada, listarContas } from '../solana/contas';
import {
    assinarEEnviarRetirada,
    lerRetirada,
    prepararRetirada,
    type RetiradaLida,
    RetiradaInvalida,
    type RetiradaPreparada,
} from '../solana/retirada';
import { useCadastro } from '../solana/useCadastro';
import { gramasParaKg, useLotes, useMateriais, useParticipantes } from '../solana/useDados';
import { rotuloParticipante, SoPapel } from './admin/comum';

/** Endereço "vazio" (Pubkey::default): lote ainda sem transportador. */
const SEM_CONTA = '11111111111111111111111111111111';
/** `Lote.transportador`: depois do `industria` (campos de tamanho fixo antes do `estado`). */
const OFFSET_TRANSPORTADOR = 8 + 32 + 8 + 2 + 8 + 8 + 4 + 8 + 32 + 32 + 8 + 32;
/** Intervalo da conferência (retirada concluída? código expirado?) enquanto o QR está na tela. */
const INTERVALO_MS = 2000;

type Linha = ContaDecodificada<lote.Lote>;
type Participantes = ContaDecodificada<lote.Participante>[];

export function Retiradas() {
    const { t } = useTranslation();
    const { cadastro } = useCadastro();
    return (
        <>
            <TituloPagina titulo={t('itens.retiradas')} />
            <SoPapel papel={['cooperativa', 'transportador']} aviso={t('retiradas.soParticipante')}>
                {cadastro?.papeis.includes('cooperativa') ? <RetiradasCooperativa /> : <RetiradasTransportador />}
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
            participantes: participantes.data ?? [],
            nome: (carteira: string) => {
                if (carteira === SEM_CONTA) return '—';
                const p = cadastro.get(carteira);
                return p ? rotuloParticipante(p) : carteira;
            },
            material: (codigo: number) => nomes.get(codigo) ?? String(codigo),
            kg: (g: bigint) => gramasParaKg(g, idioma),
            data: (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' }),
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
    const { carteira } = useCadastro();
    const lotes = useLotes(carteira ? address(carteira) : undefined);
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
            { id: 'transportador', titulo: t('papel.transportador'), valor: (l) => r.nome(l.dados.transportador), busca: (l) => l.dados.transportador },
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
                    participantes={r.participantes}
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
 * Passo 1: identificar o transportador (QR da tela Minha carteira dele, ou a lista).
 * Passo 2: a cooperativa assina e mostra a transação num QR para o transportador assinar e enviar.
 */
function DialogoRetirada({
    linha,
    participantes,
    rotulos: r,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    participantes: Participantes;
    rotulos: ReturnType<typeof useRotulos>;
    aoFechar: () => void;
    aoConcluir: (mensagem: string) => void;
}) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const [transportador, setTransportador] = useState('');
    const [lendoQr, setLendoQr] = useState(false);
    const [avisoQr, setAvisoQr] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    const [preparada, setPreparada] = useState<RetiradaPreparada | null>(null);
    const [expirado, setExpirado] = useState(false);
    const [assinando, setAssinando] = useState(false);
    const [erro, setErro] = useState<unknown>(null);

    const transportadores = useMemo(
        () =>
            participantes
                .filter((p) => p.dados.papel === lote.Papel.Transportador && p.dados.ativo)
                .sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [participantes],
    );

    const lerQr = (texto: string) => {
        setLendoQr(false);
        const falha = (chave: string) => setAvisoQr({ tipo: 'erro', texto: t(chave) });
        if (!isAddress(texto)) return falha('retiradas.qrNaoCarteira');
        const cadastro = participantes.find((p) => p.dados.carteira === texto);
        if (!cadastro) return falha('retiradas.qrSemCadastro');
        if (cadastro.dados.papel !== lote.Papel.Transportador) return falha('retiradas.qrNaoTransportador');
        if (!cadastro.dados.ativo) return falha('retiradas.qrInativo');
        setTransportador(cadastro.dados.carteira);
        setAvisoQr({ tipo: 'ok', texto: t('retiradas.qrLido', { nome: rotuloParticipante(cadastro.dados) }) });
    };

    const gerar = async () => {
        setErro(null);
        setAssinando(true);
        try {
            setPreparada(await prepararRetirada(client, linha.endereco, address(transportador)));
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
        if (transportador) void gerar();
    };

    return (
        <Dialogo
            titulo={t('retiradas.registrar')}
            subtitulo={t('retiradas.resumo', { lote: linha.dados.loteId, material: r.material(linha.dados.material), kg: r.kg(linha.dados.pesoG) })}
            formId={preparada ? undefined : 'form-retirada'}
            salvando={assinando}
            podeSalvar={!!transportador}
            rotuloSalvar={t('retiradas.assinarGerar')}
            iconeSalvar={QrCode}
            aoFechar={aoFechar}
        >
            {!preparada ? (
                <form id="form-retirada" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto-suave">{t('retiradas.passo1', { industria: r.nome(linha.dados.industria) })}</p>
                    {transportadores.length === 0 ? (
                        <p className="text-sm text-kraft">{t('retiradas.semTransportadores')}</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                                <Selecao
                                    rotulo={t('papel.transportador')}
                                    required
                                    value={transportador}
                                    onChange={(e) => {
                                        setTransportador(e.target.value);
                                        setAvisoQr(null);
                                    }}
                                >
                                    <option value="" disabled>
                                        {t('retiradas.escolher')}
                                    </option>
                                    {transportadores.map((p) => (
                                        <option key={p.endereco} value={p.dados.carteira}>
                                            {rotuloParticipante(p.dados)}
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
                            {lendoQr && <LeitorQr aoLer={lerQr} aoCancelar={() => setLendoQr(false)} instrucao={t('retiradas.aponteTransportador')} />}
                            {avisoQr && (
                                <p role="status" className={`text-sm ${avisoQr.tipo === 'ok' ? 'text-acento' : 'text-perigo'}`}>
                                    {avisoQr.texto}
                                </p>
                            )}
                        </div>
                    )}
                </form>
            ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                    <Resultado erro={erro} sucesso="" />
                    <p className="text-sm text-texto">{t('retiradas.passo2', { nome: r.nome(transportador) })}</p>
                    {/* Fundo branco também no tema escuro: leitores de QR esperam módulos escuros sobre claro. */}
                    <div className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ring-linha ${expirado ? 'opacity-25' : ''}`}>
                        <QRCodeSVG
                            value={preparada.codigo}
                            size={320}
                            level="L"
                            marginSize={2}
                            title={t('retiradas.qrTitulo')}
                            className="block h-auto w-[min(20rem,70vw)]"
                        />
                    </div>
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

function RetiradasTransportador() {
    const { t } = useTranslation();
    const { carteira } = useCadastro();
    const lotes = useLotesDoTransportador(carteira ? address(carteira) : undefined);
    const r = useRotulos();
    const [popup, setPopup] = useState(false);
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
                    vazio={t('retiradas.vazioTransportador')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                />
            </CartaoGrade>

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
                    <LeitorQr aoLer={(texto) => void lerQr(texto)} aoCancelar={aoFechar} instrucao={t('retiradas.aponteCamera')} />
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
                    </dl>
                    <p className="text-sm text-texto-suave">{t('retiradas.efeito')}</p>
                </form>
            )}
        </Dialogo>
    );
}
