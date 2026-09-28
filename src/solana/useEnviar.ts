import type { Instruction } from '@solana/kit';
import { useAction, useClient } from '@solana/react';
import type { AppClient } from './cliente';

/**
 * Envia instruções assinadas pela carteira conectada (a carteira mostra a confirmação ao usuário).
 * Devolve a assinatura da transação.
 */
export function useEnviar() {
    const client = useClient<AppClient>();
    return useAction(async (signal: AbortSignal, instrucoes: Instruction[]) => {
        const resultado = await client.sendTransaction(instrucoes, { abortSignal: signal });
        return resultado.context.signature as string;
    });
}
