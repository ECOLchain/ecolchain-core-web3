// Redes suportadas. Mainnet fica de fora até os programas serem publicados lá.
export const REDES = {
    devnet: {
        chain: 'solana:devnet',
        rpcUrl: import.meta.env.VITE_RPC_DEVNET ?? 'https://api.devnet.solana.com',
        wsUrl: import.meta.env.VITE_WS_DEVNET as string | undefined,
        explorer: (endereco: string) => `https://explorer.solana.com/address/${endereco}?cluster=devnet`,
    },
    localnet: {
        chain: 'solana:localnet',
        rpcUrl: import.meta.env.VITE_RPC_LOCALNET ?? 'http://127.0.0.1:8899',
        wsUrl: import.meta.env.VITE_WS_LOCALNET as string | undefined,
        explorer: (endereco: string) =>
            `https://explorer.solana.com/address/${endereco}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`,
    },
} as const;

export type Rede = keyof typeof REDES;

export const REDE_PADRAO: Rede = 'devnet';

export function ehRede(valor: unknown): valor is Rede {
    return typeof valor === 'string' && valor in REDES;
}
