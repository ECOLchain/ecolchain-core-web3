import { type Address } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient, useRequest } from '@solana/react';
import { useCallback } from 'react';
import { fetchMaybeCreditoConfig } from '@clientes/generated/ecol_credito';
import { fetchMaybeCarteira, fetchMaybeGlobalConfig, fetchMaybeParticipante, Papel } from '@clientes/generated/ecol_lote';
import { fetchMaybeReparticaoConfig } from '@clientes/generated/ecol_reparticao';
import { lerNomeFixo } from '@clientes/nome';
import { credito, lote, reparticao } from '@clientes/pdas';
import type { AppClient } from './cliente';

/** Papéis que a interface reconhece: os do cadastro de participante e as chaves das configs. */
export type PapelUsuario =
    | 'coletor'
    | 'cooperativa'
    | 'transportador'
    | 'industria'
    | 'importador'
    | 'cleantech'
    | 'operador'
    | 'intermediador'
    | 'registrador'
    | 'zupy'
    | 'arbitro';

export type Cadastro = {
    papeis: PapelUsuario[];
    /** Participante cadastrado, mas desativado pelo operador. */
    inativo: boolean;
    /** Nome do cadastro de participante (vazio nos papéis de config e em cadastros sem nome). */
    nome: string;
    /**
     * Carteira titular do participante (identidade on-chain do ator: seeds dos lotes, campos
     * `cooperativa`/`industria`/...). É a própria carteira conectada, salvo quando ela é vinculada (ADR 0011).
     */
    titular?: Address;
    /** Conta `Carteira` da carteira conectada, quando ela assina por outro titular (vai nas instruções). */
    vinculo?: Address;
    /** Nome da carteira conectada (cadastro de carteiras), quando houver. */
    nomeCarteira: string;
};

const PAPEL_PARTICIPANTE: Record<Papel, PapelUsuario> = {
    [Papel.Coletor]: 'coletor',
    [Papel.Cooperativa]: 'cooperativa',
    [Papel.Transportador]: 'transportador',
    [Papel.Industria]: 'industria',
    [Papel.Importador]: 'importador',
    [Papel.CleanTech]: 'cleantech',
};

async function buscarCadastro(client: AppClient, carteira: Address): Promise<Cadastro> {
    const rpc = client.rpc;
    const [proprio, vinculoConta, global, creditoConfig, repConfig] = await Promise.all([
        lote.participante(carteira).then((a) => fetchMaybeParticipante(rpc, a)),
        lote.carteira(carteira).then((a) => fetchMaybeCarteira(rpc, a)),
        lote.config().then((a) => fetchMaybeGlobalConfig(rpc, a)),
        credito.config().then((a) => fetchMaybeCreditoConfig(rpc, a)),
        reparticao.config().then((a) => fetchMaybeReparticaoConfig(rpc, a)),
    ]);

    // Carteira vinculada (ativa) fala pelo titular; desativada, não opera como ele.
    const vinculada = !proprio.exists && vinculoConta.exists && vinculoConta.data.participante !== carteira;
    const participante =
        vinculada && vinculoConta.data.ativa
            ? await lote.participante(vinculoConta.data.participante).then((a) => fetchMaybeParticipante(rpc, a))
            : proprio;
    const papeis = new Set<PapelUsuario>();
    let inativo = vinculada && !vinculoConta.data.ativa;
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
    return {
        papeis: [...papeis],
        inativo,
        nome: participante.exists ? lerNomeFixo(participante.data.nome) : '',
        titular: participante.exists ? participante.data.carteira : undefined,
        vinculo: vinculada && vinculoConta.data.ativa ? vinculoConta.address : undefined,
        nomeCarteira: vinculoConta.exists ? lerNomeFixo(vinculoConta.data.nome) : '',
    };
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
    const cadastro = data ?? undefined;
    // `ator`: quem a carteira conectada representa (o titular, se for vinculada). As telas leem e gravam
    // os dados do ator; a carteira conectada só assina.
    const ator = cadastro?.titular ?? carteira;
    return { carteira, ator, cadastro, status, error, refresh };
}
