import { useEffect, useRef, useState } from 'react';

/** Estado de um menu suspenso: fecha com Esc ou clique fora e devolve o foco ao botão. */
export function useSuspenso<T extends HTMLElement = HTMLDivElement>() {
    const [aberto, setAberto] = useState(false);
    const raiz = useRef<T>(null);
    const botao = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!aberto) return;
        const clique = (e: PointerEvent) => {
            if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
        };
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setAberto(false);
                botao.current?.focus();
            }
        };
        document.addEventListener('pointerdown', clique);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('pointerdown', clique);
            document.removeEventListener('keydown', tecla);
        };
    }, [aberto]);

    return { aberto, setAberto, alternar: () => setAberto((a) => !a), raiz, botao };
}
