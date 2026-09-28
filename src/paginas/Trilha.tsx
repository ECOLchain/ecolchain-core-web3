import { type Address, address, getAddressEncoder, isAddress } from '@solana/kit';
import { useClient } from '@solana/react';
import { ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { origemRef } from '@clientes/coletor';
import * as credito from '@clientes/generated/ecol_credito';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { TituloPagina } from '../componentes/pagina';
import { Botao } from '../componentes/ui';
import { usePreferencias } from '../preferencias/Preferencias';
import type { AppClient } from '../solana/cliente';
import { type ContaDecodificada, listarContas } from '../solana/contas';
import { REDES } from '../solana/redes';
import { gramasParaKg, useMateriais, useParticipantes } from '../solana/useDados';
import { abreviar } from './admin/comum';

const SEM_CONTA = '11111111111111111111111111111111';
/** Posições dos campos na conta `Entrega` (com o discriminador de 8 bytes). */
const OFFSET_ORIGEM_REF = 8 + 32 + 8;
const OFFSET_LOTE = OFFSET_ORIGEM_REF + 32 + 2 + 8 + 32 + 8;

type Entrega = ContaDecodificada<lote.Entrega>;
type Lote = ContaDecodificada<lote.Lote>;
/** Uma trilha: um lote de origem (quando a busca foi por ele) e o lote de venda em que entrou. */
type Trilha = {
    origem?: Entrega;
    venda?: { lote: Lote; origens: Entrega[]; credito?: credito.Credito };
};

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
    const [trilhas, setTrilhas] = useState<Trilha[] | null>(null);
    const [buscando, setBuscando] = useState(false);
    const [erro, setErro] = useState(false);

    const buscar = useCallback(
        async (q: string) => {
            const lerVenda = async (endereco: Address): Promise<Trilha['venda']> => {
                const l = await lote.fetchMaybeLote(client.rpc, endereco);
                if (!l.exists) return undefined;
                const origens = await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.ENTREGA_DISCRIMINATOR, lote.getEntregaDecoder(), undefined, [
                    { offset: OFFSET_LOTE, bytes: getAddressEncoder().encode(endereco) as Uint8Array },
                ]);
                const c =
                    l.data.credito !== SEM_CONTA ? await credito.fetchMaybeCredito(client.rpc, l.data.credito) : undefined;
                return {
                    lote: { endereco, dados: l.data },
                    origens: origens.sort((a, b) => Number(a.dados.entregaId - b.dados.entregaId)),
                    credito: c?.exists ? c.data : undefined,
                };
            };

            if (isAddress(q)) {
                const alvo = address(q);
                const e = await lote.fetchMaybeEntrega(client.rpc, alvo);
                if (e.exists) {
                    return [{ origem: { endereco: alvo, dados: e.data }, venda: e.data.lote !== SEM_CONTA ? await lerVenda(e.data.lote) : undefined }];
                }
                const venda = await lerVenda(alvo);
                return venda ? [{ venda }] : [];
            }
            const ref = await origemRef(q);
            const origens = await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.ENTREGA_DISCRIMINATOR, lote.getEntregaDecoder(), undefined, [
                { offset: OFFSET_ORIGEM_REF, bytes: ref },
            ]);
            return Promise.all(
                origens.map(async (o) => ({ origem: o, venda: o.dados.lote !== SEM_CONTA ? await lerVenda(o.dados.lote) : undefined })),
            );
        },
        [client],
    );

    useEffect(() => {
        if (!consulta.trim()) {
            setTrilhas(null);
            return;
        }
        let vivo = true;
        setBuscando(true);
        setErro(false);
        buscar(consulta.trim())
            .then((r) => vivo && setTrilhas(r))
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
            {!buscando && trilhas?.length === 0 && (
                <p className="rounded-xl border border-dashed border-linha p-6 text-texto-suave">{t('trilha.nada')}</p>
            )}
            {!buscando && trilhas?.map((tr, i) => <CartaoTrilha key={tr.origem?.endereco ?? tr.venda?.lote.endereco ?? i} trilha={tr} />)}
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
    const nomeMaterial = (codigo: number) => materiais.data?.find((m) => m.dados.codigo === codigo)?.dados.nome ?? String(codigo);
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
                    <Dado rotulo={t('cooperativa.material')}>{nomeMaterial(origem.dados.material)}</Dado>
                    <Dado rotulo={t('trilha.pesoRotulo')}>{kg(origem.dados.pesoG)}</Dado>
                    <Dado rotulo={t('trilha.cooperativa')}>{nome(origem.dados.cooperativa)}</Dado>
                    <p className="text-sm text-texto-suave">{t('trilha.registrado', { data: data(origem.dados.tsPesagem) })}</p>
                    {link(origem.endereco)}
                    {!venda && <p className="text-sm text-kraft">{t('trilha.naoVinculado')}</p>}
                </Etapa>
            )}
            {venda && (
                <>
                    <Etapa titulo={t('trilha.loteVenda')} marca={`#${venda.lote.dados.loteId}`}>
                        <Dado rotulo={t('cooperativa.lotes.estado')}>{t(`estadoLote.${estado}`)}</Dado>
                        <Dado rotulo={t('cooperativa.material')}>{nomeMaterial(venda.lote.dados.material)}</Dado>
                        {venda.lote.dados.pesoG > 0n && <Dado rotulo={t('trilha.pesoRotulo')}>{kg(venda.lote.dados.pesoG)}</Dado>}
                        <Dado rotulo={t('trilha.cooperativa')}>{nome(venda.lote.dados.cooperativa)}</Dado>
                        {venda.lote.dados.transportador !== SEM_CONTA && (
                            <Dado rotulo={t('trilha.transportador')}>{nome(venda.lote.dados.transportador)}</Dado>
                        )}
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
                                            <span>{t(`origem.${lote.OrigemEntrega[o.dados.origem]}`)}</span>
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
