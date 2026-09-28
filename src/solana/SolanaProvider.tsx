import { ClientProvider } from '@solana/react';
import { type ReactNode, useMemo } from 'react';
import { usePreferencias } from '../preferencias/Preferencias';
import { criarCliente } from './cliente';

/** Recria o cliente (e a conexão da carteira) quando o usuário troca de rede. */
export function SolanaProvider({ children }: { children: ReactNode }) {
    const { rede } = usePreferencias();
    const cliente = useMemo(() => criarCliente(rede), [rede]);
    return (
        <ClientProvider key={rede} client={cliente}>
            {children}
        </ClientProvider>
    );
}
