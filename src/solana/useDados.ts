import { type Address, getAddressEncoder } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { useCallback } from 'react';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import type { AppClient } from './cliente';
import { type ContaDecodificada, listarContas } from './contas';

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

/** `Lote.industria`: depois do `preco_minimo_centavos` (campos de tamanho fixo antes do `estado`). */
const OFFSET_LOTE_INDUSTRIA = 8 + 32 + 8 + 2 + 8 + 8 + 4 + 8 + 32 + 32 + 8;

/** Lotes comprados por uma indústria (mais recentes primeiro). */
export function useLotesDaIndustria(industria: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.LOTE_DISCRIMINATOR, lote.getLoteDecoder(), undefined, [
                    { offset: OFFSET_LOTE_INDUSTRIA, bytes: getAddressEncoder().encode(industria!) as Uint8Array },
                ])
            ).sort((a, b) => Number(b.dados.atualizadoEm - a.dados.atualizadoEm)),
        [client, industria],
    );
    return useRequest(industria ? fonte : null);
}

/** Variações cadastradas (cores do vidro), por código do material e em ordem de índice (ADR 0011). */
export function useVariacoes() {
    const client = useClient<AppClient>();
    const fonte = useCallback(async () => {
        const todas = await listarContas(
            client,
            lote.ECOL_LOTE_PROGRAM_ADDRESS,
            lote.MATERIAL_VARIACAO_DISCRIMINATOR,
            lote.getMaterialVariacaoDecoder(),
        );
        const porMaterial = new Map<number, ContaDecodificada<lote.MaterialVariacao>[]>();
        for (const v of todas.sort((a, b) => a.dados.indice - b.dados.indice)) {
            porMaterial.set(v.dados.material, [...(porMaterial.get(v.dados.material) ?? []), v]);
        }
        return porMaterial;
    }, [client]);
    return useRequest(fonte);
}

/** Nome da variação (`lerNomeFixo`), ou vazio quando o lote não tem variação. */
export function nomeVariacao(
    variacoes: Map<number, ContaDecodificada<lote.MaterialVariacao>[]> | undefined,
    material: number,
    indice: number,
) {
    if (!indice) return '';
    const v = variacoes?.get(material)?.find((x) => x.dados.indice === indice);
    return v ? lerNomeFixo(v.dados.nome) : `#${indice}`;
}

/** Garrafas postas no mercado por um importador (mais recentes primeiro). */
export function useDistribuicoes(importador: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(
                    client,
                    lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    lote.DISTRIBUICAO_DISCRIMINATOR,
                    lote.getDistribuicaoDecoder(),
                    importador,
                )
            ).sort((a, b) => Number(b.dados.distribId - a.dados.distribId)),
        [client, importador],
    );
    return useRequest(importador ? fonte : null);
}

/** Coletas de um importador (mais recentes primeiro). */
export function useColetasImportador(importador: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.COLETA_DISCRIMINATOR, lote.getColetaDecoder(), importador)
            ).sort((a, b) => Number(b.dados.coletaId - a.dados.coletaId)),
        [client, importador],
    );
    return useRequest(importador ? fonte : null);
}

/** `Coleta.destino`: depois de importador, id, material, variação, garrafas, peso e local. */
const OFFSET_COLETA_DESTINO = 8 + 32 + 8 + 2 + 1 + 4 + 8 + 32;

/** Coletas de importadores enviadas a uma cooperativa ou Clean Tech (qualquer etapa a partir do envio). */
export function useColetasDestino(destino: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () =>
            listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.COLETA_DISCRIMINATOR, lote.getColetaDecoder(), undefined, [
                { offset: OFFSET_COLETA_DESTINO, bytes: getAddressEncoder().encode(destino!) as Uint8Array },
            ]),
        [client, destino],
    );
    return useRequest(destino ? fonte : null);
}

/** Converte "1.200" em número inteiro de garrafas; `null` se inválido ou negativo. */
export function textoParaGarrafas(texto: string): number | null {
    const limpo = texto.trim().replace(/[.\s]/g, '');
    if (limpo === '') return 0;
    if (!/^\d+$/.test(limpo)) return null;
    const n = Number(limpo);
    return n <= 0xffff_ffff ? n : null;
}

/** `Carteira.participante`: logo depois do endereço da carteira. */
const OFFSET_CARTEIRA_PARTICIPANTE = 8 + 32;

/** Carteiras vinculadas a um participante (inclui o registro do próprio titular, se tiver nome). */
export function useCarteiras(participante: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (
                await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.CARTEIRA_DISCRIMINATOR, lote.getCarteiraDecoder(), undefined, [
                    { offset: OFFSET_CARTEIRA_PARTICIPANTE, bytes: getAddressEncoder().encode(participante!) as Uint8Array },
                ])
            ).sort((a, b) => Number(a.dados.criadaEm - b.dados.criadaEm)),
        [client, participante],
    );
    return useRequest(participante ? fonte : null);
}

/**
 * Lances da rodada atual de um lote em leilão (ADR 0013), do maior para o menor (empate: o mais antigo
 * primeiro). Contas de rodadas anteriores (outro `prazoLeilao`) ficam de fora até serem fechadas.
 */
export function useLancesDoLote(loteEndereco: Address | undefined, prazoLeilao: bigint) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () =>
            (await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.LANCE_DISCRIMINATOR, lote.getLanceDecoder(), loteEndereco))
                .filter((l) => l.dados.prazoLeilao === prazoLeilao)
                .sort((a, b) =>
                    a.dados.valorCentavos === b.dados.valorCentavos
                        ? Number(a.dados.atualizadoEm - b.dados.atualizadoEm)
                        : a.dados.valorCentavos > b.dados.valorCentavos
                          ? -1
                          : 1,
                ),
        [client, loteEndereco, prazoLeilao],
    );
    return useRequest(loteEndereco ? fonte : null);
}
