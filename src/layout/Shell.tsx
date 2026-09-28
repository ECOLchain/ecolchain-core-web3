import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { TituloProvider, useTituloAtual } from '../componentes/pagina';
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
        <TituloProvider>
        <div className="h-dvh overflow-hidden">
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
                className={`flex h-full flex-col pt-16 transition-[padding] duration-200 ${expandido ? 'lg:pl-64' : 'lg:pl-[4.25rem]'}`}
            >
                <div className="flex min-h-0 flex-1 bg-moldura px-2 pt-2 sm:px-4 sm:pt-3">
                    <PainelCentral>
                        <Outlet />
                    </PainelCentral>
                </div>
            </main>
        </div>
        </TituloProvider>
    );
}

/**
 * Moldura de toda página: barra de título fixa no topo e só o miolo rolando. Sem teto de largura,
 * para as grades usarem a tela toda. Base reta, encostada no rodapé da janela.
 */
function PainelCentral({ children }: { children: ReactNode }) {
    const titulo = useTituloAtual();
    return (
        <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-t-xl border border-b-0 border-linha bg-superficie p-1.5 pb-0 shadow-sm">
            <div className="shrink-0 rounded-t-lg bg-barra px-4 py-2 text-barra-texto">
                {titulo && <h1 className="truncate text-sm font-semibold tracking-wide">{titulo}</h1>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-fundo px-4 py-5 sm:px-6">{children}</div>
        </div>
    );
}
