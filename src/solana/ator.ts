import type { Address } from '@solana/kit';
import { useClient } from '@solana/react';
import * as lote from '@clientes/generated/ecol_lote';
import { lote as pLote } from '@clientes/pdas';
import type { AppClient } from './cliente';
import { useCadastro } from './useCadastro';

/**
 * Quem a carteira conectada representa nas instruções (ADR 0011): `titular` é a identidade on-chain do
 * ator e a carteira conectada assina; quando ela é vinculada, `vinculo` (conta `Carteira`) vai junto.
 * Uso: `{ cooperativa: titular, cooperativaAssinante: assinante, cooperativaCarteira: vinculo }`.
 */
export function useAtor() {
    const client = useClient<AppClient>();
    const { ator, cadastro } = useCadastro();
    return { titular: ator as Address | undefined, assinante: client.payer, vinculo: cadastro?.vinculo };
}

/**
 * Quem um endereço representa: ele mesmo (titular cadastrado) ou, se for carteira vinculada ativa,
 * o titular dela. `null` sem cadastro. Usado quando outro aparelho mostra a carteira por QR.
 */
export async function resolverCarteira(
    client: AppClient,
    endereco: Address,
): Promise<{ titular: Address; assinante: Address; vinculo?: Address; participante: lote.Participante } | null> {
    const proprio = await lote.fetchMaybeParticipante(client.rpc, await pLote.participante(endereco));
    if (proprio.exists) return { titular: endereco, assinante: endereco, participante: proprio.data };
    const vinculoEndereco = await pLote.carteira(endereco);
    const vinculo = await lote.fetchMaybeCarteira(client.rpc, vinculoEndereco);
    if (!vinculo.exists || !vinculo.data.ativa) return null;
    const titular = await lote.fetchMaybeParticipante(client.rpc, await pLote.participante(vinculo.data.participante));
    if (!titular.exists) return null;
    return { titular: vinculo.data.participante, assinante: endereco, vinculo: vinculoEndereco, participante: titular.data };
}

/** Conta `Carteira` a informar quando quem assina não é o titular. */
export const vinculoDe = async (titular: Address, assinante: Address) =>
    assinante === titular ? undefined : pLote.carteira(assinante);
