import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

/**
 * O título é declarado pela página (`TituloPagina`) e desenhado pela moldura do painel central (`Shell`),
 * na barra de título fixa. Assim há um só `h1` na tela e ele fica visível enquanto o miolo rola.
 */
const Registro = createContext<((titulo: string) => void) | null>(null);
const Atual = createContext('');

export function TituloProvider({ children }: { children: ReactNode }) {
    const [titulo, setTitulo] = useState('');
    return (
        <Registro value={setTitulo}>
            <Atual value={titulo}>{children}</Atual>
        </Registro>
    );
}

export const useTituloAtual = () => useContext(Atual);

/** Declara o título da página: vai para a barra do painel e para a aba do navegador. */
export function TituloPagina({ titulo }: { titulo: string }) {
    const registrar = useContext(Registro);
    useEffect(() => {
        registrar?.(titulo);
    }, [registrar, titulo]);
    return <title>{`${titulo} · EcolChain`}</title>;
}
