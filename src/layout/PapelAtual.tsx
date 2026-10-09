import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import {
    Factory,
    FileCheck2,
    Gavel,
    Landmark,
    type LucideIcon,
    Recycle,
    ShieldCheck,
    Sparkles,
    Ticket,
    Truck,
    UserRound,
    Warehouse,
    Wine,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ORDEM_PAPEIS } from '../navegacao/menu';
import type { AppClient } from '../solana/cliente';
import { type PapelUsuario, useCadastro } from '../solana/useCadastro';

/** Ícone e cor (token `--papel-*` do index.css) de cada papel. */
const VISUAL: Record<PapelUsuario, { icone: LucideIcon; cor: string }> = {
    coletor: { icone: Recycle, cor: 'var(--papel-coletor)' },
    cooperativa: { icone: Warehouse, cor: 'var(--papel-cooperativa)' },
    transportador: { icone: Truck, cor: 'var(--papel-transportador)' },
    industria: { icone: Factory, cor: 'var(--papel-industria)' },
    importador: { icone: Wine, cor: 'var(--papel-importador)' },
    cleantech: { icone: Sparkles, cor: 'var(--papel-cleantech)' },
    operador: { icone: ShieldCheck, cor: 'var(--papel-operador)' },
    intermediador: { icone: Landmark, cor: 'var(--papel-outros)' },
    registrador: { icone: FileCheck2, cor: 'var(--papel-outros)' },
    zupy: { icone: Ticket, cor: 'var(--papel-outros)' },
    arbitro: { icone: Gavel, cor: 'var(--papel-outros)' },
};

/**
 * Quem está operando o app agora: o papel principal da carteira conectada (na ordem do menu) e o
 * nome do cadastro. `cor` também pinta a faixa do topo do header.
 */
export function usePapelAtual() {
    const client = useClient<AppClient>();
    const conectada = useConnectedWallet(client);
    const { cadastro, status } = useCadastro();
    if (!conectada) return null;
    if (!cadastro) return status === 'fetching' ? ({ carregando: true } as const) : null;
    const papeis = ORDEM_PAPEIS.filter((p) => cadastro.papeis.includes(p));
    const principal = papeis[0];
    return {
        carregando: false as const,
        papel: principal,
        outros: papeis.slice(1),
        nome: cadastro.nome,
        /** Nome da carteira conectada (ex.: "Loja Centro"), quando ela tem cadastro de carteira. */
        nomeCarteira: cadastro.nomeCarteira,
        inativo: cadastro.inativo,
        cor: principal ? VISUAL[principal].cor : 'var(--papel-nenhum)',
    };
}

/** Selo de destaque no header: ícone, papel e nome, na cor do papel. */
export function PapelAtual({ atual }: { atual: ReturnType<typeof usePapelAtual> }) {
    const { t } = useTranslation();
    if (!atual) return null;
    if (atual.carregando) return <div className="h-11 w-40 animate-pulse rounded-full bg-superficie-2" aria-hidden="true" />;

    const Icone = atual.papel ? VISUAL[atual.papel].icone : UserRound;
    const rotulo = atual.papel ? t(`papel.${atual.papel}`) : t('papel.semCadastro');
    const todos = [atual.papel, ...atual.outros].filter(Boolean).map((p) => t(`papel.${p}`));
    const titulo = [t('papelAtual.operandoComo', { papel: todos.join(', ') || rotulo }), atual.nome, atual.nomeCarteira]
        .filter(Boolean)
        .join(' — ');

    return (
        <div
            role="status"
            aria-label={titulo}
            title={titulo}
            style={{ '--papel': atual.cor } as CSSProperties}
            className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-[var(--papel)] py-1 pr-3.5 pl-1.5 sm:gap-2.5 sm:pr-5 text-[var(--papel-texto)] shadow-md ring-2 ring-[var(--papel)]/25 ring-offset-superficie sm:ring-offset-2"
        >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--papel-texto)]/20 sm:size-8">
                <Icone className="size-4 sm:size-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
                <span className="hidden text-xs font-medium opacity-85 sm:block">{t('papelAtual.operando')}</span>
                <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                    <span className="truncate text-sm font-bold sm:text-base">{rotulo}</span>
                    {atual.outros.length > 0 && <span className="text-xs font-semibold opacity-85">+{atual.outros.length}</span>}
                    {atual.nome && <span className="hidden truncate border-l border-[var(--papel-texto)]/35 pl-1.5 text-sm font-medium opacity-90 md:inline">{atual.nome}</span>}
                    {atual.nomeCarteira && <span className="hidden truncate text-xs font-medium opacity-80 lg:inline">· {atual.nomeCarteira}</span>}
                    {atual.inativo && <span className="text-xs font-semibold opacity-85">({t('papel.inativo')})</span>}
                </span>
            </span>
        </div>
    );
}
