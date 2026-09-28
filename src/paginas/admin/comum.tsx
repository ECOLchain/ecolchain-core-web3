import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Carregando } from '../../componentes/ui';
import { useCadastro } from '../../solana/useCadastro';

/** Mostra o conteúdo só para a carteira de administração (operador); as demais veem o motivo. */
export function SoAdministracao({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const { carteira, cadastro, status } = useCadastro();
    if (!carteira) return <Aviso texto={t('menu.conecteParaUsar')} />;
    if (!cadastro && status === 'fetching') return <Carregando />;
    if (!cadastro?.papeis.includes('operador')) return <Aviso texto={t('admin.soAdministracao')} />;
    return <>{children}</>;
}

function Aviso({ texto }: { texto: string }) {
    return <p className="max-w-2xl rounded-xl border border-dashed border-linha p-6 text-texto-suave">{texto}</p>;
}

export const abreviar = (endereco: string) => `${endereco.slice(0, 4)}…${endereco.slice(-4)}`;

/** sha256 de um texto, em bytes (referência do cadastro off-chain; on-chain vai só o hash). */
export async function sha256(texto: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}
