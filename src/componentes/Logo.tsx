/**
 * Logo provisório: dois elos de corrente (a trilha on-chain) que se fecham num ciclo (a reciclagem).
 * Substitua este componente quando houver a marca oficial.
 */
export function LogoSimbolo({ className = 'size-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
            <rect x="3" y="9" width="17" height="14" rx="7" stroke="var(--cor-acento)" strokeWidth="3.2" />
            <rect x="12" y="9" width="17" height="14" rx="7" stroke="var(--cor-kraft)" strokeWidth="3.2" />
            {/* Reforça o elo verde por cima no cruzamento superior, para parecerem entrelaçados. */}
            <path d="M13.2 10.6 A7 7 0 0 1 17 9.6" stroke="var(--cor-acento)" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
    );
}

export function Logo() {
    return (
        <span className="flex items-center gap-2" aria-label="EcolChain">
            <LogoSimbolo />
            <span className="hidden text-lg font-semibold tracking-tight text-texto min-[26rem]:inline">EcolChain</span>
        </span>
    );
}
