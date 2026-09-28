import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type TamanhoFonte, usePreferencias } from '../preferencias/Preferencias';
import { ehRede, REDES } from '../solana/redes';

const FONTES: { valor: TamanhoFonte; rotulo: string; classe: string }[] = [
    { valor: 'pequena', rotulo: 'preferencias.fontePequena', classe: 'text-[0.75rem]' },
    { valor: 'media', rotulo: 'preferencias.fonteMedia', classe: 'text-[0.9375rem]' },
    { valor: 'grande', rotulo: 'preferencias.fonteGrande', classe: 'text-[1.125rem]' },
];

/** Três "A" de tamanhos crescentes: o próprio glifo mostra o que cada opção faz. */
export function ControleFonte() {
    const { t } = useTranslation();
    const { fonte, setFonte } = usePreferencias();
    return (
        <div
            role="radiogroup"
            aria-label={t('preferencias.fonte')}
            className="flex h-9 items-center rounded-lg border border-linha bg-superficie p-0.5"
        >
            {FONTES.map((f) => {
                const ativo = fonte === f.valor;
                return (
                    <button
                        key={f.valor}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        title={t(f.rotulo)}
                        aria-label={t(f.rotulo)}
                        onClick={() => setFonte(f.valor)}
                        className={`flex h-full w-8 items-center justify-center rounded-md font-semibold leading-none transition-colors ${f.classe} ${
                            ativo ? 'bg-acento text-acento-texto' : 'text-texto-suave hover:bg-superficie-2 hover:text-texto'
                        }`}
                    >
                        A
                    </button>
                );
            })}
        </div>
    );
}

export function BotaoTema() {
    const { t } = useTranslation();
    const { temaAtual, setTema } = usePreferencias();
    const escuro = temaAtual === 'escuro';
    const rotulo = t(escuro ? 'preferencias.temaClaro' : 'preferencias.temaEscuro');
    return (
        <button
            type="button"
            onClick={() => setTema(escuro ? 'claro' : 'escuro')}
            title={rotulo}
            aria-label={rotulo}
            className="flex size-9 items-center justify-center rounded-lg border border-linha bg-superficie text-texto-suave transition-colors hover:text-texto"
        >
            {escuro ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
        </button>
    );
}


/** A rede aparece como um selo kraft: é a informação que mais importa conferir antes de assinar. */
export function SeletorRede() {
    const { t } = useTranslation();
    const { rede, setRede } = usePreferencias();
    return (
        <label className="relative flex items-center">
            <span className="sr-only">{t('rede.rotulo')}</span>
            <span className="pointer-events-none absolute left-3 size-2 rounded-full bg-kraft" aria-hidden="true" />
            <select
                value={rede}
                onChange={(e) => ehRede(e.target.value) && setRede(e.target.value)}
                title={t('rede.rotulo')}
                className="h-9 appearance-none rounded-lg border border-kraft/40 bg-kraft-suave pr-3 pl-7 text-sm font-semibold text-kraft transition-colors hover:border-kraft"
            >
                {Object.keys(REDES).map((r) => (
                    <option key={r} value={r}>
                        {t(`rede.${r}`)}
                    </option>
                ))}
            </select>
        </label>
    );
}
