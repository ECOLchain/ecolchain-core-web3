import type { Address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { useCallback } from 'react';
import * as lote from '@clientes/generated/ecol_lote';
import type { AppClient } from './cliente';
import { listarContas } from './contas';

/** Materiais cadastrados, em ordem de código. */
export function useMateriais() {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.MATERIAL_DISCRIMINATOR, lote.getMaterialDecoder())).sort(
                (a, b) => a.dados.codigo - b.dados.codigo,
            ),
        [client],
    );
    return useRequest(fonte);
}

export function useParticipantes() {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () => listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.PARTICIPANTE_DISCRIMINATOR, lote.getParticipanteDecoder()),
        [client],
    );
    return useRequest(fonte);
}

/** Entregas registradas por uma cooperativa (mais recentes primeiro). */
export function useEntregas(cooperativa: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(
                    client,
                    lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    lote.ENTREGA_DISCRIMINATOR,
                    lote.getEntregaDecoder(),
                    cooperativa,
                )
            ).sort((a, b) => Number(b.dados.entregaId - a.dados.entregaId)),
        [client, cooperativa],
    );
    return useRequest(cooperativa ? fonte : null);
}

/** Lotes de uma cooperativa (mais recentes primeiro). */
export function useLotes(cooperativa: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.LOTE_DISCRIMINATOR, lote.getLoteDecoder(), cooperativa)
            ).sort((a, b) => Number(b.dados.loteId - a.dados.loteId)),
        [client, cooperativa],
    );
    return useRequest(cooperativa ? fonte : null);
}

/** Converte "12,5" (kg) em gramas; `null` se inválido ou não positivo. */
export function kgParaGramas(texto: string): bigint | null {
    const n = Number(texto.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.round(n * 1000));
}

export const gramasParaKg = (g: bigint, idioma: string) =>
    (Number(g) / 1000).toLocaleString(idioma, { maximumFractionDigits: 3 });

/** Lotes de todas as cooperativas (telas da administração, do intermediador e da indústria). */
export function useTodosLotes() {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.LOTE_DISCRIMINATOR, lote.getLoteDecoder())).sort((a, b) =>
                Number(b.dados.atualizadoEm - a.dados.atualizadoEm),
            ),
        [client],
    );
    return useRequest(fonte);
}

export const brl = (centavos: bigint, idioma: string) =>
    (Number(centavos) / 100).toLocaleString(idioma, { style: 'currency', currency: 'BRL' });

/** Converte "1.250,50" ou "1250,5" (R$) em centavos; `null` se inválido ou não positivo. */
export function reaisParaCentavos(texto: string): bigint | null {
    const limpo = texto.trim().replace(/\s|R\$/g, '');
    const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    const n = Number(normal);
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.round(n * 100));
}
