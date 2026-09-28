import { type Address } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient, useRequest } from '@solana/react';
import { useCallback } from 'react';
import { fetchMaybeCreditoConfig } from '@clientes/generated/ecol_credito';
import { fetchMaybeGlobalConfig, fetchMaybeParticipante, Papel } from '@clientes/generated/ecol_lote';
import { fetchMaybeReparticaoConfig } from '@clientes/generated/ecol_reparticao';
import { credito, lote, reparticao } from '@clientes/pdas';
import type { AppClient } from './cliente';

/** Papéis que a interface reconhece: os do cadastro de participante e as chaves das configs. */
export type PapelUsuario =
    | 'coletor'
    | 'cooperativa'
    | 'transportador'
    | 'industria'
    | 'operador'
    | 'intermediador'
    | 'registrador'
    | 'zupy'
    | 'arbitro';

export type Cadastro = {
    papeis: PapelUsuario[];
    /** Participante cadastrado, mas desativado pelo operador. */
    inativo: boolean;
};

const PAPEL_PARTICIPANTE: Record<Papel, PapelUsuario> = {
    [Papel.Coletor]: 'coletor',
    [Papel.Cooperativa]: 'cooperativa',
    [Papel.Transportador]: 'transportador',
    [Papel.Industria]: 'industria',
};

async function buscarCadastro(client: AppClient, carteira: Address): Promise<Cadastro> {
    const rpc = client.rpc;
    const [participante, global, creditoConfig, repConfig] = await Promise.all([
        lote.participante(carteira).then((a) => fetchMaybeParticipante(rpc, a)),
        lote.config().then((a) => fetchMaybeGlobalConfig(rpc, a)),
        credito.config().then((a) => fetchMaybeCreditoConfig(rpc, a)),
        reparticao.config().then((a) => fetchMaybeReparticaoConfig(rpc, a)),
    ]);

    const papeis = new Set<PapelUsuario>();
    let inativo = false;
    if (participante.exists) {
        if (participante.data.ativo) papeis.add(PAPEL_PARTICIPANTE[participante.data.papel]);
        else inativo = true;
    }
    if (global.exists) {
        if (global.data.operador === carteira) papeis.add('operador');
        if (global.data.intermediador === carteira) papeis.add('intermediador');
        if (global.data.arbitro === carteira) papeis.add('arbitro');
    }
    if (creditoConfig.exists) {
        if (creditoConfig.data.operador === carteira) papeis.add('operador');
        if (creditoConfig.data.intermediador === carteira) papeis.add('intermediador');
        if (creditoConfig.data.registrador === carteira) papeis.add('registrador');
    }
    if (repConfig.exists) {
        if (repConfig.data.operador === carteira) papeis.add('operador');
        if (repConfig.data.intermediador === carteira) papeis.add('intermediador');
        if (repConfig.data.zupy === carteira) papeis.add('zupy');
    }
    return { papeis: [...papeis], inativo };
}

/**
 * Cadastro da carteira conectada, lido on-chain nos três programas.
 * `status` é 'disabled' sem carteira conectada.
 */
export function useCadastro() {
    const client = useClient<AppClient>();
    const conectada = useConnectedWallet(client);
    const carteira = conectada?.account.address as Address | undefined;

    // A identidade da função decide quando buscar de novo: só muda com a carteira ou a rede (cliente).
    const fonte = useCallback(
        () => (carteira ? buscarCadastro(client, carteira) : Promise.resolve(null)),
        [client, carteira],
    );
    const { data, status, error, refresh } = useRequest(carteira ? fonte : null);
    return { carteira, cadastro: data ?? undefined, status, error, refresh };
}
