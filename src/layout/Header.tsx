import { Menu, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '../componentes/Logo';
import { Carteira } from './Carteira';
import { BotaoTema, ControleFonte, SeletorRede } from './Controles';
import { useSuspenso } from './useSuspenso';

type Props = {
    menuAberto: boolean;
    alternarMenu: () => void;
};

export function Header({ menuAberto, alternarMenu }: Props) {
    const { t } = useTranslation();
    const ajustes = useSuspenso();

    return (
        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 border-b border-linha bg-superficie/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
            <button
                type="button"
                onClick={alternarMenu}
                aria-expanded={menuAberto}
                aria-controls="menu-lateral"
                aria-label={t(menuAberto ? 'menu.recolher' : 'menu.abrir')}
                title={t(menuAberto ? 'menu.recolher' : 'menu.abrir')}
                className="flex size-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
            >
                <Menu className="size-5" />
            </button>
            <Link to="/" aria-label={t('app.inicio')} className="rounded-lg">
                <Logo />
            </Link>

            <div className="ml-auto flex items-center gap-2">
                {/* Telas largas: preferências direto no header. */}
                <div className="hidden items-center gap-2 lg:flex">
                    <ControleFonte />
                    <BotaoTema />
                </div>
                {/* Telas estreitas: as mesmas preferências num painel. */}
                <div ref={ajustes.raiz} className="relative lg:hidden">
                    <button
                        ref={ajustes.botao}
                        type="button"
                        onClick={ajustes.alternar}
                        aria-expanded={ajustes.aberto}
                        aria-label={t('preferencias.fonte')}
                        className="flex size-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
                    >
                        <SlidersHorizontal className="size-5" />
                    </button>
                    {ajustes.aberto && (
                        <div className="absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-lg shadow-black/10">
                            <div className="flex items-center justify-between gap-2">
                                <ControleFonte />
                                <BotaoTema />
                            </div>
                            <div className="sm:hidden">
                                <SeletorRede />
                            </div>
                        </div>
                    )}
                </div>
                <div className="hidden sm:block">
                    <SeletorRede />
                </div>
                <Carteira />
            </div>
        </header>
    );
}
