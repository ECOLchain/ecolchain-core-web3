import { type Address, address, getAddressDecoder, getAddressEncoder, isAddress } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { coletorRef, origemRef } from '@clientes/coletor';
import * as credito from '@clientes/generated/ecol_credito';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { TituloPagina } from '../componentes/pagina';
import { Botao } from '../componentes/ui';
import { usePreferencias } from '../preferencias/Preferencias';
import type { AppClient } from '../solana/cliente';
import { type ContaDecodificada, listarContas } from '../solana/contas';
import { REDES } from '../solana/redes';
import { gramasParaKg, nomeVariacao, useMateriais, useParticipantes, useVariacoes } from '../solana/useDados';
import { abreviar } from './admin/comum';
import { rotuloEstado } from './venda/comum';

const SEM_CONTA = '11111111111111111111111111111111';
/** Mais que isso, a busca pede para refinar (cada trilha custa algumas leituras). */
const MAX_TRILHAS = 20;
/** Posições dos campos (com o discriminador de 8 bytes). `cooperativa` abre as duas contas. */
const OFFSET_COOPERATIVA = 8;
const OFFSET_ORIGEM_REF = 8 + 32 + 8;
const OFFSET_ENTREGA_LOTE = OFFSET_ORIGEM_REF + 32 + 2 + 8 + 32 + 8;
/** `Lote`: cooperativa, lote_id, material, peso_g, peso_recebido_g, qtd_entregas, peso_entregas_g, entregas_hash. */
const OFFSET_LOTE_EVIDENCIAS = 8 + 32 + 8 + 2 + 8 + 8 + 4 + 8 + 32;
const OFFSET_LOTE_INDUSTRIA = OFFSET_LOTE_EVIDENCIAS + 32 + 8;
const OFFSET_LOTE_TRANSPORTADOR = OFFSET_LOTE_INDUSTRIA + 32;

/** Nome para comparar: sem acentos, minúsculas e espaços únicos ("Coletor  1" = "coletor 1"). */
const normalizarNome = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

type Entrega = ContaDecodificada<lote.Entrega>;
type Lote = ContaDecodificada<lote.Lote>;
/** Uma trilha: um lote de origem (quando a busca foi por ele) e o lote de venda em que entrou. */
type Trilha = {
    origem?: Entrega;
    venda?: { lote: Lote; origens: Entrega[]; credito?: credito.Credito };
};
type Resultado = { trilhas: Trilha[]; total: number; participantes: string[] };

/**
 * Trilha pública: qualquer pessoa, com ou sem carteira, encontra um lote pela referência do
 * comprovante (o hash é recalculado aqui; o texto nunca vai on-chain) ou pelo endereço, e segue
 * do lote de origem ao lote de venda, à indústria que o consumiu e ao crédito de carbono.
 */
export function Trilha() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const [params, setParams] = useSearchParams();
    const consulta = params.get('q') ?? '';
    const [texto, setTexto] = useState(consulta);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [buscando, setBuscando] = useState(false);
    const [erro, setErro] = useState(false);

    const buscar = useCallback(
        async (q: string): Promise<Resultado> => {
            const programa = lote.ECOL_LOTE_PROGRAM_ADDRESS;
            const entregasCom = (offset: number, bytes: Uint8Array) =>
                listarContas(client, programa, lote.ENTREGA_DISCRIMINATOR, lote.getEntregaDecoder(), undefined, [{ offset, bytes }]);
            const lotesCom = (offset: number, bytes: Uint8Array) =>
                listarContas(client, programa, lote.LOTE_DISCRIMINATOR, lote.getLoteDecoder(), undefined, [{ offset, bytes }]);
            const bytesDe = (a: Address) => getAddressEncoder().encode(a) as Uint8Array;

            const vendas = new Map<string, Promise<Trilha['venda']>>();
            const lerVenda = (endereco: Address, conta?: Lote) => {
                if (!vendas.has(endereco)) {
                    vendas.set(
                        endereco,
                        (async () => {
                            const dados = conta?.dados ?? (await lote.fetchMaybeLote(client.rpc, endereco).then((l) => (l.exists ? l.data : undefined)));
                            if (!dados) return undefined;
                            const origens = await entregasCom(OFFSET_ENTREGA_LOTE, bytesDe(endereco));
                            const c = dados.credito !== SEM_CONTA ? await credito.fetchMaybeCredito(client.rpc, dados.credito) : undefined;
                            return {
                                lote: { endereco, dados },
                                origens: origens.sort((x, y) => Number(x.dados.entregaId - y.dados.entregaId)),
                                credito: c?.exists ? c.data : undefined,
                            };
                        })(),
                    );
                }
                return vendas.get(endereco)!;
            };

            // Coleta sem repetir: cada lote de origem ou de venda aparece uma vez.
            const origens = new Map<string, Entrega>();
            const lotes = new Map<string, Lote>();
            const juntar = (es: Entrega[], ls: Lote[] = []) => {
                for (const e of es) origens.set(e.endereco, e);
                for (const l of ls) lotes.set(l.endereco, l);
            };

            // Participante (pelo nome ou pela carteira): os lotes em que ele aparece.
            const doParticipante = async (p: lote.Participante) => {
                const carteira = bytesDe(p.carteira);
                if (p.papel === lote.Papel.Coletor) juntar(await entregasCom(OFFSET_ORIGEM_REF, await coletorRef(p.carteira)));
                if (p.papel === lote.Papel.Cooperativa) {
                    const [es, ls] = await Promise.all([entregasCom(OFFSET_COOPERATIVA, carteira), lotesCom(OFFSET_COOPERATIVA, carteira)]);
                    juntar(es.filter((e) => e.dados.lote === SEM_CONTA), ls);
                }
                if (p.papel === lote.Papel.Industria) juntar([], await lotesCom(OFFSET_LOTE_INDUSTRIA, carteira));
                if (p.papel === lote.Papel.Transportador) juntar([], await lotesCom(OFFSET_LOTE_TRANSPORTADOR, carteira));
            };

            const participantes = await listarContas(client, programa, lote.PARTICIPANTE_DISCRIMINATOR, lote.getParticipanteDecoder());
            let achados: lote.Participante[];
            if (isAddress(q)) {
                const alvo = address(q);
                const e = await lote.fetchMaybeEntrega(client.rpc, alvo);
                if (e.exists) juntar([{ endereco: alvo, dados: e.data }]);
                else {
                    const l = await lote.fetchMaybeLote(client.rpc, alvo);
                    if (l.exists) juntar([], [{ endereco: alvo, dados: l.data }]);
                }
                achados = participantes.filter((p) => p.dados.carteira === alvo).map((p) => p.dados);
            } else {
                const ref = await origemRef(q);
                const [es, ls] = await Promise.all([entregasCom(OFFSET_ORIGEM_REF, ref), lotesCom(OFFSET_LOTE_EVIDENCIAS, ref)]);
                juntar(es, ls);
                const termo = normalizarNome(q);
                achados = participantes.filter((p) => normalizarNome(lerNomeFixo(p.dados.nome)).includes(termo)).map((p) => p.dados);
            }
            await Promise.all(achados.map(doParticipante));

            // Origens já em um lote de venda também encontrado aparecem dentro dele, não sozinhas.
            const soltas = [...origens.values()].filter((o) => !lotes.has(o.dados.lote));
            const total = soltas.length + lotes.size;
            const recentes = <T extends { dados: { criadoEm: bigint } }>(x: T, y: T) => Number(y.dados.criadoEm - x.dados.criadoEm);
            const trilhas = await Promise.all([
                ...[...lotes.values()]
                    .sort(recentes)
                    .slice(0, MAX_TRILHAS)
                    .map(async (l) => ({ venda: await lerVenda(l.endereco, l) })),
                ...soltas
                    .sort(recentes)
                    .slice(0, Math.max(0, MAX_TRILHAS - lotes.size))
                    .map(async (o) => ({ origem: o, venda: o.dados.lote !== SEM_CONTA ? await lerVenda(o.dados.lote) : undefined })),
            ]);
            return { trilhas, total, participantes: achados.map((p) => lerNomeFixo(p.nome) || abreviar(p.carteira)) };
        },
        [client],
    );

    useEffect(() => {
        if (!consulta.trim()) {
            setResultado(null);
            return;
        }
        let vivo = true;
        setBuscando(true);
        setErro(false);
        buscar(consulta.trim())
            .then((r) => vivo && setResultado(r))
            .catch(() => vivo && setErro(true))
            .finally(() => vivo && setBuscando(false));
        return () => {
            vivo = false;
        };
    }, [consulta, buscar]);

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (texto.trim()) setParams({ q: texto.trim() });
    };

    return (
        <div className="flex max-w-4xl flex-col gap-5">
            <TituloPagina titulo={t('itens.explorar')} />
            <section className="rounded-xl border border-linha bg-superficie p-4 shadow-sm sm:p-5">
                <form onSubmit={enviar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-sm font-medium text-texto">{t('trilha.busca')}</span>
                        <span className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-suave" aria-hidden="true" />
                            <input
                                value={texto}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={t('trilha.buscaExemplo')}
                                onChange={(e) => setTexto(e.target.value)}
                                className="h-10 w-full rounded-lg border border-linha bg-fundo pr-3 pl-9 text-sm text-texto placeholder:text-texto-suave/80 focus:border-acento"
                            />
                        </span>
                    </label>
                    <Botao type="submit" carregando={buscando} disabled={!texto.trim()}>
                        {t('trilha.buscar')}
                    </Botao>
                </form>
                <p className="mt-3 max-w-3xl text-sm text-texto-suave">{t('trilha.ajuda')}</p>
            </section>

            {buscando && (
                <p className="flex items-center gap-2 text-texto-suave">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    {t('trilha.buscando')}
                </p>
            )}
            {!buscando && erro && <p className="text-perigo">{t('trilha.erro')}</p>}
            {!buscando && resultado && resultado.participantes.length > 0 && (
                <p className="text-sm text-texto-suave">{t('trilha.participantes', { nomes: resultado.participantes.join(', ') })}</p>
            )}
            {!buscando && resultado?.trilhas.length === 0 && (
                <p className="rounded-xl border border-dashed border-linha p-6 text-texto-suave">{t('trilha.nada')}</p>
            )}
            {!buscando &&
                resultado?.trilhas.map((tr, i) => <CartaoTrilha key={tr.origem?.endereco ?? tr.venda?.lote.endereco ?? i} trilha={tr} />)}
            {!buscando && resultado && resultado.total > resultado.trilhas.length && (
                <p className="text-sm text-kraft">{t('trilha.limite', { n: resultado.trilhas.length, total: resultado.total })}</p>
            )}
        </div>
    );
}

/** A trilha em etapas, de cima para baixo, na ordem física: origem → venda → consumo → crédito. */
function CartaoTrilha({ trilha }: { trilha: Trilha }) {
    const { t } = useTranslation();
    const { idioma, rede } = usePreferencias();
    const participantes = useParticipantes();
    const materiais = useMateriais();
    const nome = useMemo(() => {
        const mapa = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados]));
        return (carteira: string) => {
            const p = mapa.get(carteira);
            const n = p ? lerNomeFixo(p.nome) : '';
            return n ? `${n} — ${abreviar(carteira)}` : abreviar(carteira);
        };
    }, [participantes.data]);
    // origem_ref de uma entrega com coletor → nome do coletor (o hash é recalculado da carteira).
    const [coletores, setColetores] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const lista = (participantes.data ?? []).filter((p) => p.dados.papel === lote.Papel.Coletor);
        let vivo = true;
        Promise.all(lista.map(async (p) => [hex(await coletorRef(p.dados.carteira)), nome(p.dados.carteira)] as const)).then(
            (pares) => vivo && setColetores(new Map(pares)),
        );
        return () => {
            vivo = false;
        };
    }, [participantes.data, nome]);
    const coletor = (e: Entrega) => (e.dados.origem === lote.OrigemEntrega.Coletor ? coletores.get(hex(e.dados.origemRef)) : undefined);
    const variacoes = useVariacoes();
    const nomeMaterial = (codigo: number, variacao = 0) =>
        [materiais.data?.find((m) => m.dados.codigo === codigo)?.dados.nome ?? String(codigo), nomeVariacao(variacoes.data, codigo, variacao)]
            .filter(Boolean)
            .join(' · ');
    const garrafas = (n: number) => t('material.garrafasN', { n: n.toLocaleString(idioma) });
    // Origem Importador: a referência é a conta da coleta (ADR 0011) — mostra o importador e a NF.
    const client = useClient<AppClient>();
    const enderecoColeta =
        trilha.origem?.dados.origem === lote.OrigemEntrega.Importador
            ? (getAddressDecoder().decode(new Uint8Array(trilha.origem.dados.origemRef)) as Address)
            : undefined;
    const fonteColeta = useCallback(() => lote.fetchMaybeColeta(client.rpc, enderecoColeta!), [client, enderecoColeta]);
    const coleta = useRequest(enderecoColeta ? fonteColeta : null).data;
    const dadosColeta = coleta?.exists ? coleta.data : undefined;
    const data = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' });
    const kg = (g: bigint) => t('trilha.peso', { kg: gramasParaKg(g, idioma) });
    const link = (endereco: string) => (
        <a
            href={REDES[rede].explorer(endereco)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-acento underline-offset-4 hover:underline"
        >
            {t('trilha.verExplorer')}
            <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
    );
    const { origem, venda } = trilha;
    const estado = venda?.lote.dados.estado.__kind;
    const consumido = estado === 'Reciclado' || estado === 'Agregado';

    return (
        <ol className="relative flex flex-col gap-3 border-l-2 border-acento/40 pl-5">
            {origem && (
                <Etapa titulo={t('trilha.loteOrigem')} marca={`#${origem.dados.entregaId}`}>
                    <Dado rotulo={t('cooperativa.coletas.origem')}>{t(`origem.${lote.OrigemEntrega[origem.dados.origem]}`)}</Dado>
                    {coletor(origem) && <Dado rotulo={t('trilha.coletor')}>{coletor(origem)}</Dado>}
                    {dadosColeta && (
                        <>
                            <Dado rotulo={t('papel.importador')}>{nome(dadosColeta.importador)}</Dado>
                            <Dado rotulo={t('trilha.coletaImportador')}>
                                {`#${dadosColeta.coletaId} · ${t(`estadoColeta.${lote.EstadoColeta[dadosColeta.estado]}`)}`}
                                {dadosColeta.estado === lote.EstadoColeta.Reciclada && ` · ${t('trilha.nfReciclagem')}`}
                            </Dado>
                        </>
                    )}
                    <Dado rotulo={t('cooperativa.material')}>{nomeMaterial(origem.dados.material, origem.dados.variacao)}</Dado>
                    <Dado rotulo={t('trilha.pesoRotulo')}>{kg(origem.dados.pesoG)}</Dado>
                    {origem.dados.qtdGarrafas > 0 && <Dado rotulo={t('material.garrafasCurto')}>{garrafas(origem.dados.qtdGarrafas)}</Dado>}
                    <Dado rotulo={t('trilha.cooperativa')}>{nome(origem.dados.cooperativa)}</Dado>
                    <p className="text-sm text-texto-suave">{t('trilha.registrado', { data: data(origem.dados.tsPesagem) })}</p>
                    {link(origem.endereco)}
                    {!venda && <p className="text-sm text-kraft">{t('trilha.naoVinculado')}</p>}
                </Etapa>
            )}
            {venda && (
                <>
                    <Etapa titulo={t('trilha.loteVenda')} marca={`#${venda.lote.dados.loteId}`}>
                        <Dado rotulo={t('cooperativa.lotes.estado')}>{rotuloEstado(t, venda.lote.dados)}</Dado>
                        <Dado rotulo={t('cooperativa.material')}>{nomeMaterial(venda.lote.dados.material, venda.lote.dados.variacao)}</Dado>
                        {venda.lote.dados.pesoG > 0n && <Dado rotulo={t('trilha.pesoRotulo')}>{kg(venda.lote.dados.pesoG)}</Dado>}
                        {venda.lote.dados.qtdGarrafas > 0 && (
                            <Dado rotulo={t('material.garrafasCurto')}>{garrafas(venda.lote.dados.qtdGarrafas)}</Dado>
                        )}
                        <Dado rotulo={t('trilha.cooperativa')}>{nome(venda.lote.dados.cooperativa)}</Dado>
                        {venda.lote.dados.transportador !== SEM_CONTA && (
                            <Dado rotulo={t('trilha.transportador')}>{nome(venda.lote.dados.transportador)}</Dado>
                        )}
                        {venda.lote.dados.mtr > 0 && <Dado rotulo={t('retiradas.mtr')}>{venda.lote.dados.mtr}</Dado>}
                        <p className="text-sm text-texto-suave">{t('trilha.desde', { data: data(venda.lote.dados.atualizadoEm) })}</p>
                        {link(venda.lote.endereco)}
                        {venda.origens.length > 0 && (
                            <details className="mt-1 text-sm">
                                <summary className="cursor-pointer text-texto">
                                    {t('trilha.origens')} ({venda.origens.length})
                                </summary>
                                <ul className="mt-2 flex flex-col gap-1 text-texto-suave">
                                    {venda.origens.map((o) => (
                                        <li
                                            key={o.endereco}
                                            className={`grid grid-cols-[4rem_1fr_auto] gap-3 ${o.endereco === origem?.endereco ? 'font-semibold text-texto' : ''}`}
                                        >
                                            <span className="tabular-nums">#{o.dados.entregaId.toString()}</span>
                                            <span>
                                                {t(`origem.${lote.OrigemEntrega[o.dados.origem]}`)}
                                                {coletor(o) && ` — ${coletor(o)}`}
                                            </span>
                                            <span className="tabular-nums">{kg(o.dados.pesoG)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </Etapa>
                    <Etapa titulo={consumido ? t('trilha.consumido') : t('trilha.naoConsumido')} apagada={!consumido}>
                        {venda.lote.dados.industria !== SEM_CONTA && (
                            <Dado rotulo={t('trilha.industria')}>{nome(venda.lote.dados.industria)}</Dado>
                        )}
                        {venda.lote.dados.pesoRecebidoG > 0n && (
                            <Dado rotulo={t('trilha.pesoRotulo')}>{kg(venda.lote.dados.pesoRecebidoG)}</Dado>
                        )}
                    </Etapa>
                    {venda.credito && (
                        <Etapa titulo={t('trilha.credito')} marca={venda.credito.serial || undefined}>
                            <Dado rotulo={t('cooperativa.lotes.estado')}>
                                {t(`estadoCredito.${credito.EstadoCredito[venda.credito.estado]}`)}
                            </Dado>
                            {link(venda.lote.dados.credito)}
                        </Etapa>
                    )}
                </>
            )}
        </ol>
    );
}

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function Etapa({ titulo, marca, apagada, children }: { titulo: string; marca?: string; apagada?: boolean; children?: ReactNode }) {
    return (
        <li className="relative rounded-xl border border-linha bg-superficie p-4 shadow-sm">
            <span
                className={`absolute top-5 -left-[1.72rem] size-3 rounded-full border-2 border-superficie ${apagada ? 'bg-linha' : 'bg-acento'}`}
                aria-hidden="true"
            />
            <h2 className={`mb-2 flex items-baseline gap-2 font-semibold ${apagada ? 'text-texto-suave' : 'text-texto'}`}>
                {titulo}
                {marca && <span className="text-sm font-medium tabular-nums text-kraft">{marca}</span>}
            </h2>
            <div className="flex flex-col gap-1">{children}</div>
        </li>
    );
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
    return (
        <p className="text-sm">
            <span className="text-texto-suave">{rotulo}: </span>
            <span className="text-texto">{children}</span>
        </p>
    );
}
