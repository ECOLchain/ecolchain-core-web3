import { useConnect, useConnectedWallet, useDisconnect, useWallets, useWalletStatus, WalletReadyGate } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencias } from '../preferencias/Preferencias';
import type { AppClient } from '../solana/cliente';
import { REDES } from '../solana/redes';
import { useCadastro } from '../solana/useCadastro';
import { useSuspenso } from './useSuspenso';

export const abreviar = (endereco: string) => `${endereco.slice(0, 4)}…${endereco.slice(-4)}`;

const painel =
    'absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-linha bg-superficie p-2 shadow-lg shadow-black/10';
const itemPainel =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-texto transition-colors hover:bg-superficie-2';

export function Carteira() {
    const client = useClient<AppClient>();
    return (
        <WalletReadyGate client={client} fallback={<div className="h-11 w-40 animate-pulse rounded-lg bg-superficie-2" />}>
            <BotaoCarteira client={client} />
        </WalletReadyGate>
    );
}

function BotaoCarteira({ client }: { client: AppClient }) {
    const conectada = useConnectedWallet(client);
    return conectada ? <Conectada client={client} /> : <Conectar client={client} />;
}

function Conectar({ client }: { client: AppClient }) {
    const { t } = useTranslation();
    const carteiras = useWallets(client);
    const status = useWalletStatus(client);
    const { dispatch: conectar, error } = useConnect(client);
    const s = useSuspenso();
    const ocupado = status === 'connecting' || status === 'reconnecting';

    return (
        <div ref={s.raiz} className="relative">
            <button
                ref={s.botao}
                type="button"
                onClick={s.alternar}
                disabled={ocupado}
                aria-expanded={s.aberto}
                aria-haspopup="menu"
                className="flex h-10 items-center gap-2 rounded-lg bg-acento px-3 text-sm font-semibold whitespace-nowrap sm:px-4 text-acento-texto transition-opacity hover:opacity-90 disabled:opacity-60"
            >
                <Wallet className="size-4" aria-hidden="true" />
                {status === 'connecting'
                    ? t('carteira.conectando')
                    : status === 'reconnecting'
                      ? t('carteira.reconectando')
                      : t('carteira.conectar')}
            </button>
            {s.aberto && (
                <div role="menu" className={painel}>
                    <p className="px-3 pt-1 pb-2 text-sm font-semibold text-texto">{t('carteira.escolher')}</p>
                    {carteiras.length === 0 ? (
                        <p className="px-3 pb-2 text-sm text-texto-suave">{t('carteira.nenhuma')}</p>
                    ) : (
                        carteiras.map((w) => (
                            <button
                                key={w.name}
                                type="button"
                                role="menuitem"
                                className={itemPainel}
                                onClick={() => {
                                    s.setAberto(false);
                                    conectar(w);
                                }}
                            >
                                <img src={w.icon} alt="" className="size-6 rounded" />
                                {w.name}
                            </button>
                        ))
                    )}
                </div>
            )}
            {error != null && !s.aberto && (
                <p role="alert" className="absolute right-0 top-full mt-2 w-64 text-right text-xs text-perigo">
                    {t('carteira.erro')}
                </p>
            )}
        </div>
    );
}

/** Endereço + papel na primeira linha, rede na segunda: o "quem sou eu, onde estou" antes de assinar. */
function Conectada({ client }: { client: AppClient }) {
    const { t } = useTranslation();
    const { rede } = usePreferencias();
    const conectada = useConnectedWallet(client);
    const { dispatch: desconectar } = useDisconnect(client);
    const { cadastro, status } = useCadastro();
    const [copiado, setCopiado] = useState(false);
    const s = useSuspenso();
    if (!conectada) return null;

    const endereco = conectada.account.address;
    const papel =
        status === 'fetching' && !cadastro
            ? t('papel.verificando')
            : cadastro && cadastro.papeis.length > 0
              ? cadastro.papeis.map((p) => t(`papel.${p}`)).join(', ')
              : cadastro?.inativo
                ? `${t('papel.semCadastro')} (${t('papel.inativo')})`
                : t('papel.semCadastro');

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(endereco);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {
            // área de transferência indisponível: o endereço segue visível no explorer
        }
    };

    return (
        <div ref={s.raiz} className="relative">
            <button
                ref={s.botao}
                type="button"
                onClick={s.alternar}
                aria-expanded={s.aberto}
                aria-haspopup="menu"
                className="flex h-11 items-center gap-2.5 rounded-lg border border-linha bg-superficie py-1 pr-2 pl-1.5 text-left transition-colors hover:border-texto-suave"
            >
                <img src={conectada.wallet.icon} alt={conectada.wallet.name} className="size-8 rounded-md" />
                <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-sm font-semibold whitespace-nowrap text-texto tabular-nums">
                        {abreviar(endereco)}
                        <span className="hidden font-normal text-texto-suave sm:inline"> · {papel}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-kraft">
                        <span className="size-1.5 rounded-full bg-kraft" aria-hidden="true" />
                        {t(`rede.${rede}`)}
                    </span>
                </span>
                <ChevronDown className="size-4 text-texto-suave" aria-hidden="true" />
            </button>
            {s.aberto && (
                <div role="menu" className={painel}>
                    <div className="px-3 pt-1 pb-3">
                        <p className="text-sm font-semibold text-texto">{papel}</p>
                        <p className="mt-1 text-xs break-all text-texto-suave tabular-nums">{endereco}</p>
                    </div>
                    <button type="button" role="menuitem" className={itemPainel} onClick={copiar}>
                        {copiado ? <Check className="size-4 text-acento" /> : <Copy className="size-4" />}
                        {copiado ? t('carteira.copiado') : t('carteira.copiar')}
                    </button>
                    <a
                        role="menuitem"
                        className={itemPainel}
                        href={REDES[rede].explorer(endereco)}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <ExternalLink className="size-4" />
                        {t('carteira.explorer')}
                    </a>
                    <button
                        type="button"
                        role="menuitem"
                        className={`${itemPainel} text-perigo`}
                        onClick={() => {
                            s.setAberto(false);
                            desconectar();
                        }}
                    >
                        <LogOut className="size-4" />
                        {t('carteira.desconectar')}
                    </button>
                </div>
            )}
        </div>
    );
}
