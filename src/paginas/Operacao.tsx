import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ItemMenu } from '../navegacao/menu';
import { TituloPagina } from '../componentes/pagina';
import type { AppClient } from '../solana/cliente';

/** Página provisória de cada operação do menu, até a tela real ser construída. */
export function Operacao({ item }: { item: ItemMenu }) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const conectada = useConnectedWallet(client) != null;
    const Icone = item.icone;

    return (
        <section className="max-w-2xl">
            <TituloPagina titulo={t(`itens.${item.id}`)} />
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-acento-suave text-acento">
                    <Icone className="size-5" aria-hidden="true" />
                </span>
                <p className="text-lg leading-relaxed text-texto-suave">{t(`descricoes.${item.id}`)}</p>
            </div>
            <p className="mt-8 rounded-xl border border-dashed border-linha p-6 text-texto-suave">
                {conectada ? t('paginas.emConstrucao') : t('menu.conecteParaUsar')}
            </p>
        </section>
    );
}

export function NaoEncontrada() {
    const { t } = useTranslation();
    return (
        <section className="max-w-2xl">
            <TituloPagina titulo={t('paginas.naoEncontrada')} />
            <Link to="/" className="mt-4 inline-block font-medium text-acento underline underline-offset-4">
                {t('paginas.voltar')}
            </Link>
        </section>
    );
}
