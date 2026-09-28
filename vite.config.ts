import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Os clientes Codama ficam em onchain/clients e são importados direto do código-fonte.
// `dedupe` garante que eles usem o mesmo @solana/kit desta aplicação.
export default defineConfig(({ mode }) => ({
    plugins: [react(), tailwindcss()],
    // Os clientes gerados usam `process.env.NODE_ENV` (mensagens de erro só em desenvolvimento);
    // por virem do código-fonte, não passam pelo pré-bundle que faria essa troca.
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    resolve: {
        alias: {
            '@clientes': fileURLToPath(new URL('../onchain/clients/src', import.meta.url)),
        },
        dedupe: ['@solana/kit', '@solana/program-client-core'],
    },
    server: {
        fs: { allow: ['..'] },
    },
}));
