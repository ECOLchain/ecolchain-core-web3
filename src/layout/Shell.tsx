import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { Header } from './Header';
import { MenuLateral } from './MenuLateral';

const telaLarga = () => window.matchMedia('(min-width: 64rem)').matches;

export function Shell() {
    const { t } = useTranslation();
    const [expandido, setExpandido] = useState(true);
    const [gavetaAberta, setGavetaAberta] = useState(false);

    // O mesmo botão recolhe o menu em telas largas e abre a gaveta em telas estreitas.
    const alternarMenu = () => (telaLarga() ? setExpandido((e) => !e) : setGavetaAberta((a) => !a));

    return (
        <div className="min-h-dvh">
            <a
                href="#conteudo"
                className="sr-only z-50 rounded-lg bg-acento px-4 py-2 text-acento-texto focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
                {t('app.pular')}
            </a>
            <Header menuAberto={telaLarga() ? expandido : gavetaAberta} alternarMenu={alternarMenu} />
            <MenuLateral expandido={expandido} gavetaAberta={gavetaAberta} fecharGaveta={() => setGavetaAberta(false)} />
            <main
                id="conteudo"
                className={`pt-16 transition-[padding] duration-200 ${expandido ? 'lg:pl-64' : 'lg:pl-[4.25rem]'}`}
            >
                <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
