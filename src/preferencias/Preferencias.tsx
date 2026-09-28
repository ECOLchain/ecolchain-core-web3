import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import i18n, { ehIdioma, IDIOMA_PADRAO, type Idioma } from '../i18n';
import { ehRede, REDE_PADRAO, type Rede } from '../solana/redes';

export type Tema = 'claro' | 'escuro';
export type TamanhoFonte = 'pequena' | 'media' | 'grande';

type Salvas = { tema?: Tema; fonte: TamanhoFonte; idioma: Idioma; rede: Rede };

type Contexto = Salvas & {
    /** Tema efetivo: o escolhido ou, se nenhum, o do sistema. */
    temaAtual: Tema;
    setTema: (t: Tema) => void;
    setFonte: (f: TamanhoFonte) => void;
    setIdioma: (i: Idioma) => void;
    setRede: (r: Rede) => void;
};

const CHAVE = 'ecolchain:preferencias';
const TAMANHOS: readonly TamanhoFonte[] = ['pequena', 'media', 'grande'];

/** Lê as preferências salvas. O armazenamento pode estar bloqueado (aba privada): nesse caso usa o padrão. */
export function lerPreferencias(): Salvas {
    let bruto: Record<string, unknown> = {};
    try {
        bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Record<string, unknown>;
    } catch {
        // sem armazenamento: segue com os padrões
    }
    return {
        tema: bruto.tema === 'claro' || bruto.tema === 'escuro' ? bruto.tema : undefined,
        fonte: TAMANHOS.includes(bruto.fonte as TamanhoFonte) ? (bruto.fonte as TamanhoFonte) : 'media',
        idioma: ehIdioma(bruto.idioma) ? bruto.idioma : IDIOMA_PADRAO,
        rede: ehRede(bruto.rede) ? bruto.rede : REDE_PADRAO,
    };
}

function salvar(p: Salvas) {
    try {
        localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {
        // preferência vale só nesta sessão
    }
}

const PreferenciasContext = createContext<Contexto | null>(null);

function temaDoSistema(): Tema {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function PreferenciasProvider({ children }: { children: ReactNode }) {
    const [salvas, setSalvas] = useState<Salvas>(lerPreferencias);
    const [sistema, setSistema] = useState<Tema>(temaDoSistema);

    // Sem escolha explícita, acompanha o sistema operacional.
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const mudar = () => setSistema(mq.matches ? 'escuro' : 'claro');
        mq.addEventListener('change', mudar);
        return () => mq.removeEventListener('change', mudar);
    }, []);

    const temaAtual = salvas.tema ?? sistema;

    useEffect(() => {
        const html = document.documentElement;
        html.classList.toggle('dark', temaAtual === 'escuro');
        if (salvas.fonte === 'media') delete html.dataset.fonte;
        else html.dataset.fonte = salvas.fonte;
        html.lang = salvas.idioma;
        if (i18n.language !== salvas.idioma) void i18n.changeLanguage(salvas.idioma);
        salvar(salvas);
    }, [salvas, temaAtual]);

    const valor = useMemo<Contexto>(() => {
        const atualizar = (parcial: Partial<Salvas>) => setSalvas((p) => ({ ...p, ...parcial }));
        return {
            ...salvas,
            temaAtual,
            setTema: (tema) => atualizar({ tema }),
            setFonte: (fonte) => atualizar({ fonte }),
            setIdioma: (idioma) => atualizar({ idioma }),
            setRede: (rede) => atualizar({ rede }),
        };
    }, [salvas, temaAtual]);

    return <PreferenciasContext value={valor}>{children}</PreferenciasContext>;
}

export function usePreferencias(): Contexto {
    const ctx = use(PreferenciasContext);
    if (!ctx) throw new Error('usePreferencias fora do PreferenciasProvider');
    return ctx;
}
