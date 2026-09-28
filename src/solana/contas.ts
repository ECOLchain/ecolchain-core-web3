import { type Address, type Decoder, getBase58Decoder, getBase64Encoder, type ReadonlyUint8Array } from '@solana/kit';
import type { AppClient } from './cliente';

export type ContaDecodificada<T> = { endereco: Address; dados: T };

/**
 * Lista todas as contas de um tipo (pelo discriminador Anchor) de um programa.
 * Contas que não decodificam são ignoradas: dados on-chain não são confiáveis.
 */
export async function listarContas<T>(
    client: AppClient,
    programa: Address,
    discriminador: ReadonlyUint8Array,
    decoder: Decoder<T>,
    /** Filtra pelo primeiro campo da conta (logo após o discriminador), ex.: a cooperativa dona. */
    primeiroCampo?: Address,
    /** Outros campos exigidos: bytes exatos na posição `offset` da conta (com o discriminador). */
    filtros: { offset: number; bytes: Uint8Array }[] = [],
): Promise<ContaDecodificada<T>[]> {
    const contas = await client.rpc
        .getProgramAccounts(programa, {
            encoding: 'base64',
            filters: [
                {
                    memcmp: {
                        offset: 0n,
                        bytes: getBase58Decoder().decode(discriminador) as never,
                        encoding: 'base58',
                    },
                },
                ...(primeiroCampo
                    ? [{ memcmp: { offset: 8n, bytes: primeiroCampo as never, encoding: 'base58' as const } }]
                    : []),
                ...filtros.map((f) => ({
                    memcmp: { offset: BigInt(f.offset), bytes: getBase58Decoder().decode(f.bytes) as never, encoding: 'base58' as const },
                })),
            ],
        })
        .send();
    const lista: ContaDecodificada<T>[] = [];
    for (const { pubkey, account } of contas) {
        try {
            const bytes = getBase64Encoder().encode(account.data[0]);
            lista.push({ endereco: pubkey, dados: decoder.decode(bytes) });
        } catch {
            // conta com layout inesperado: fora da lista
        }
    }
    return lista;
}
