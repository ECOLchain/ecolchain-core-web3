import { Check, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Bandeira } from '../componentes/Bandeira';
import { IDIOMAS } from '../i18n';
import { usePreferencias } from '../preferencias/Preferencias';
import { useSuspenso } from './useSuspenso';

/**
 * Idioma no rodapé do menu lateral. Expandido: bandeira + nome, lista abrindo para cima.
 * Recolhido: só a bandeira, lista abrindo ao lado do menu.
 */
export function SeletorIdioma({ recolhido }: { recolhido: boolean }) {
    const { t } = useTranslation();
    const { idioma, setIdioma } = usePreferencias();
    const s = useSuspenso();
    const atual = IDIOMAS.find((i) => i.codigo === idioma) ?? IDIOMAS[0];

    return (
        <div ref={s.raiz} className="relative">
            <button
                ref={s.botao}
                type="button"
                onClick={s.alternar}
                aria-haspopup="listbox"
                aria-expanded={s.aberto}
                aria-label={`${t('preferencias.idioma')}: ${atual.nome}`}
                title={recolhido ? `${t('preferencias.idioma')}: ${atual.nome}` : undefined}
                className={`flex h-10 w-full items-center gap-3 rounded-lg text-sm font-medium text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto ${
                    recolhido ? 'justify-center' : 'px-3'
                }`}
            >
                <Bandeira idioma={atual.codigo} />
                {!recolhido && (
                    <>
                        <span className="flex-1 truncate text-left">{atual.nome}</span>
                        <ChevronUp className={`size-4 transition-transform ${s.aberto ? '' : 'rotate-180'}`} aria-hidden="true" />
                    </>
                )}
            </button>

            {s.aberto && (
                <ul
                    role="listbox"
                    aria-label={t('preferencias.idioma')}
                    className={`absolute z-50 w-56 rounded-xl border border-linha bg-superficie p-1.5 shadow-lg shadow-black/10 ${
                        recolhido ? 'bottom-0 left-full ml-3' : 'bottom-full left-0 mb-2 w-full'
                    }`}
                >
                    {IDIOMAS.map((i) => {
                        const selecionado = i.codigo === idioma;
                        return (
                            <li key={i.codigo} role="option" aria-selected={selecionado}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIdioma(i.codigo);
                                        s.setAberto(false);
                                        s.botao.current?.focus();
                                    }}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-superficie-2 ${
                                        selecionado ? 'font-semibold text-texto' : 'text-texto-suave'
                                    }`}
                                >
                                    <Bandeira idioma={i.codigo} />
                                    <span className="flex-1">{i.nome}</span>
                                    {selecionado && <Check className="size-4 text-acento" aria-hidden="true" />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
