import { LoaderCircle, Save, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Popup de inclusão e alteração: não ocupa espaço no painel central.
 *
 * As ações ficam no cabeçalho, não num rodapé: o corpo pode rolar e o Salvar continua à vista.
 * O Salvar é o único elemento sólido; o × fecha (Esc também). O botão Salvar vive fora do
 * `<form>` e se liga a ele pelo atributo `form`, o que mantém o Enter num campo submetendo.
 */
export function Dialogo({
    titulo,
    subtitulo,
    formId,
    salvando = false,
    podeSalvar = true,
    rotuloSalvar,
    aoFechar,
    largura = 'md',
    children,
}: {
    titulo: string;
    subtitulo?: string;
    /** `id` do formulário que o Salvar submete; ausente = diálogo só de leitura. */
    formId?: string;
    salvando?: boolean;
    podeSalvar?: boolean;
    rotuloSalvar?: string;
    aoFechar: () => void;
    largura?: 'md' | 'lg';
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDialogElement>(null);
    const salvar = rotuloSalvar ?? t('admin.salvar');

    useEffect(() => {
        const d = ref.current;
        if (d && !d.open) d.showModal();
        return () => d?.close();
    }, []);

    return (
        <dialog
            ref={ref}
            aria-labelledby="dialogo-titulo"
            onCancel={(e) => {
                // Esc: quem fecha é o dono do estado, não o navegador.
                e.preventDefault();
                if (!salvando) aoFechar();
            }}
            className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-linha bg-superficie p-0 text-texto shadow-2xl backdrop:bg-black/45 ${
                largura === 'lg' ? 'max-w-3xl' : 'max-w-lg'
            }`}
        >
            <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
                <header className="flex shrink-0 items-center justify-between gap-3 bg-barra px-5 py-3 text-barra-texto">
                    <div className="min-w-0">
                        <h2 id="dialogo-titulo" className="truncate text-base font-semibold">
                            {titulo}
                        </h2>
                        {subtitulo && <p className="truncate text-xs opacity-80">{subtitulo}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {formId && (
                            <button
                                type="submit"
                                form={formId}
                                disabled={salvando || !podeSalvar}
                                title={salvar}
                                aria-label={salvar}
                                className="flex size-9 items-center justify-center rounded-lg bg-barra-texto text-[#1a5a4d] shadow-sm transition hover:opacity-90 focus-visible:outline-barra-texto disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {salvando ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-5" />}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={aoFechar}
                            disabled={salvando}
                            title={t('admin.fechar')}
                            aria-label={t('admin.fechar')}
                            className="flex size-9 items-center justify-center rounded-lg opacity-85 transition hover:bg-white/10 hover:opacity-100 focus-visible:outline-barra-texto disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                </header>
                <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-5">{children}</div>
            </div>
        </dialog>
    );
}
