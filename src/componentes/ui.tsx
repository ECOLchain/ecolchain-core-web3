import { CircleAlert, CircleCheck, ExternalLink, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferencias } from '../preferencias/Preferencias';
import { chaveDoErro } from '../solana/erros';
import { REDES } from '../solana/redes';


const campoBase =
    'h-10 w-full rounded-lg border border-linha bg-fundo px-3 text-sm text-texto placeholder:text-texto-suave/70 transition-colors focus:border-acento';

export function Campo({ rotulo, ajuda, ...props }: { rotulo: string; ajuda?: string } & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">{rotulo}</span>
            <input {...props} className={`${campoBase} ${props.className ?? ''}`} />
            {ajuda && <span className="text-xs text-texto-suave">{ajuda}</span>}
        </label>
    );
}

export function Selecao({
    rotulo,
    children,
    ...props
}: { rotulo: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">{rotulo}</span>
            <select {...props} className={campoBase}>
                {children}
            </select>
        </label>
    );
}

export function Botao({
    carregando,
    variante = 'principal',
    compacto,
    children,
    ...props
}: { carregando?: boolean; variante?: 'principal' | 'secundario'; compacto?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
    const estilo =
        variante === 'principal'
            ? 'bg-acento text-acento-texto hover:opacity-90'
            : 'border border-linha bg-superficie text-texto hover:border-texto-suave';
    return (
        <button
            {...props}
            disabled={props.disabled || carregando}
            className={`inline-flex ${compacto ? 'h-9 px-3' : 'h-10 px-4'} items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 ${estilo} ${props.className ?? ''}`}
        >
            {carregando && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
}

/** Situação ativo/inativo, com texto (não só cor). */
export function Situacao({ ativo }: { ativo: boolean }) {
    const { t } = useTranslation();
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                ativo ? 'bg-acento-suave text-acento' : 'bg-superficie-2 text-texto-suave'
            }`}
        >
            <span className={`size-1.5 rounded-full ${ativo ? 'bg-acento' : 'bg-texto-suave'}`} aria-hidden="true" />
            {t(ativo ? 'admin.ativo' : 'admin.inativo')}
        </span>
    );
}

/** Resultado da última transação: link para o explorer ou o erro traduzido. */
export function Resultado({ assinatura, erro, sucesso }: { assinatura?: string; erro?: unknown; sucesso: string }) {
    const { t } = useTranslation();
    const { rede } = usePreferencias();
    if (erro != null) {
        return (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-perigo/10 p-3 text-sm text-perigo">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {/* Erro do programa ainda sem tradução: mensagem genérica em vez da chave crua. */}
                {t(chaveDoErro(erro), { defaultValue: t('erros.generico') })}
            </p>
        );
    }
    if (!assinatura) return null;
    const cluster = rede === 'devnet' ? 'devnet' : `custom&customUrl=${encodeURIComponent(REDES.localnet.rpcUrl)}`;
    return (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-acento-suave p-3 text-sm text-acento">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            {sucesso}
            <a
                href={`https://explorer.solana.com/tx/${assinatura}?cluster=${cluster}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
            >
                {t('admin.verTransacao')}
                <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
        </p>
    );
}

export function Carregando() {
    const { t } = useTranslation();
    return (
        <p className="flex items-center gap-2 text-texto-suave">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t('admin.carregando')}
        </p>
    );
}
