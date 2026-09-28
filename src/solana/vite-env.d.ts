/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_RPC_DEVNET?: string;
    readonly VITE_WS_DEVNET?: string;
    readonly VITE_RPC_LOCALNET?: string;
    readonly VITE_WS_LOCALNET?: string;
}
