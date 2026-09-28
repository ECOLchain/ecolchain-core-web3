import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { useTranslation } from 'react-i18next';
import type { AppClient } from '../solana/cliente';

const ETAPAS = ['pesagem', 'venda', 'transporte', 'recebimento', 'credito', 'reparticao'] as const;

/** Painel inicial. O conteúdo definitivo ainda será definido; por ora mostra o caminho de um lote. */
export function Painel() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const conectada = useConnectedWallet(client) != null;

    return (
        <div className="flex flex-col gap-10">
            <section className="max-w-2xl">
                <h1 className="text-3xl font-semibold tracking-tight text-texto sm:text-4xl">{t('painel.titulo')}</h1>
                <p className="mt-3 text-lg leading-relaxed text-texto-suave">{t('painel.boasVindas')}</p>
                {!conectada && <p className="mt-4 font-medium text-acento">{t('painel.conecte')}</p>}
            </section>

            <section aria-labelledby="etapas">
                <h2 id="etapas" className="text-base font-semibold text-texto">
                    {t('painel.etapas')}
                </h2>
                <ol className="mt-4 grid gap-px overflow-hidden rounded-xl border border-linha bg-linha sm:grid-cols-2 lg:grid-cols-3">
                    {ETAPAS.map((etapa, i) => (
                        <li key={etapa} className="flex items-baseline gap-3 bg-superficie p-5">
                            <span className="text-2xl font-semibold text-kraft tabular-nums">{i + 1}</span>
                            <span className="font-medium text-texto">{t(`painel.etapa.${etapa}`)}</span>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="rounded-xl border border-dashed border-linha p-8 text-center text-texto-suave">
                {t('painel.emDefinicao')}
            </section>
        </div>
    );
}
