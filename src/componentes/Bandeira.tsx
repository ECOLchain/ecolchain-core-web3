import type { Idioma } from '../i18n';

/**
 * Bandeiras em SVG (emoji de bandeira não aparece no Windows).
 * Proporção 3:2, simplificadas para ficarem legíveis em 20 px.
 */
export function Bandeira({ idioma, className = 'h-3.5 w-5' }: { idioma: Idioma; className?: string }) {
    return (
        <svg viewBox="0 0 30 20" className={`${className} shrink-0 rounded-[2px] ring-1 ring-black/10`} aria-hidden="true">
            {idioma === 'pt-BR' && (
                <>
                    <rect width="30" height="20" fill="#009c3b" />
                    <path d="M15 2.5 27 10 15 17.5 3 10Z" fill="#ffdf00" />
                    <circle cx="15" cy="10" r="4.2" fill="#002776" />
                    <path d="M10.9 9.2a8 8 0 0 1 8.2 1.6" stroke="#fff" strokeWidth=".8" fill="none" />
                </>
            )}
            {idioma === 'en-US' && (
                <>
                    <rect width="30" height="20" fill="#fff" />
                    {[0, 2, 4, 6, 8, 10, 12].map((i) => (
                        <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#b22234" />
                    ))}
                    <rect width="13" height={(7 * 20) / 13} fill="#3c3b6e" />
                    {[2, 5, 8, 11].flatMap((x) =>
                        [2, 5, 8].map((y) => <circle key={`${x}-${y}`} cx={x + (y === 5 ? 1.5 : 0)} cy={y} r=".6" fill="#fff" />),
                    )}
                </>
            )}
            {idioma === 'es-ES' && (
                <>
                    <rect width="30" height="20" fill="#aa151b" />
                    <rect y="5" width="30" height="10" fill="#f1bf00" />
                </>
            )}
        </svg>
    );
}
