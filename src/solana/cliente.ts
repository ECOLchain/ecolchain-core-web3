import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { REDES, type Rede } from './redes';

/**
 * Um cliente Kit por rede: a carteira conectada (Wallet Standard) é payer e identity.
 * Transações v0: os programas ainda são testados com o planner v0 (ver onchain/clients/README.md).
 */
export function criarCliente(rede: Rede) {
    const { chain, rpcUrl, wsUrl } = REDES[rede];
    return createClient()
        .use(walletSigner({ chain }))
        .use(
            solanaRpc({
                rpcUrl,
                ...(wsUrl ? { rpcSubscriptionsUrl: wsUrl } : {}),
                transactionConfig: { version: 0 },
            }),
        );
}

export type AppClient = Awaited<ReturnType<typeof criarCliente>>;
