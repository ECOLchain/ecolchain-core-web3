import {
    type Address,
    address,
    appendTransactionMessageInstruction,
    type Blockhash,
    compileTransaction,
    createNoopSigner,
    createTransactionMessage,
    getBase58Decoder,
    getBase58Encoder,
    getBase64EncodedWireTransaction,
    getPublicKeyFromAddress,
    isTransactionModifyingSigner,
    partiallySignTransactionMessageWithSigners,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type SignatureBytes,
    type Transaction,
    type TransactionSigner,
    verifySignature,
} from '@solana/kit';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority } from '@clientes/pdas';
import { vinculoDe } from './ator';
import type { AppClient } from './cliente';

/**
 * Retirada do lote (`transportador_pickup_lote`): a cooperativa e o transportador assinam a mesma
 * transação, cada um no seu aparelho.
 *
 * A cooperativa monta a transação, assina (e paga a taxa) e mostra num QR Code só o necessário para
 * remontá-la:
 * `ecolchain:retirada:v2:<lote>:<cooperativa>:<assinante coop>:<transportador>:<assinante transp>:<blockhash>:<último bloco>:<assinatura>`.
 * Desde a ADR 0011, cada lado pode assinar com uma carteira vinculada ao titular; o assinante fica
 * vazio no código quando é o próprio titular.
 * O aparelho do transportador remonta a mesma transação a partir da blockchain, confere a assinatura
 * da cooperativa, assina e envia. Assim o QR fica pequeno (fácil de ler) e o transportador assina o
 * que ele mesmo montou, não bytes vindos de fora.
 *
 * O blockhash vale por cerca de um minuto; depois disso a cooperativa gera outro código.
 */
const PREFIXO = 'ecolchain:retirada:v2:';

type Partes = {
    lote: Address;
    /** Titulares (identidade on-chain). */
    cooperativa: Address;
    transportador: Address;
    /** Carteiras que assinam (o titular ou uma carteira vinculada a ele). */
    cooperativaAssinante: Address;
    transportadorAssinante: Address;
    blockhash: Blockhash;
    ultimoBloco: bigint;
};

/** A mesma transação, byte a byte, dos dois lados: mesmas contas, pagador e blockhash. */
async function montarMensagem(client: AppClient, p: Partes, signers: { cooperativa: TransactionSigner; transportador: TransactionSigner }) {
    const conta = await lote.fetchLote(client.rpc, p.lote);
    const ix = await lote.getTransportadorPickupLoteInstructionAsync({
        transportador: p.transportador,
        transportadorAssinante: signers.transportador,
        transportadorCarteira: await vinculoDe(p.transportador, p.transportadorAssinante),
        cooperativa: p.cooperativa,
        cooperativaAssinante: signers.cooperativa,
        cooperativaCarteira: await vinculoDe(p.cooperativa, p.cooperativaAssinante),
        lote: p.lote,
        payer: signers.cooperativa,
        asset: conta.data.asset,
        eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
    });
    const mensagem = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signers.cooperativa, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: p.blockhash, lastValidBlockHeight: p.ultimoBloco }, m),
        (m) => appendTransactionMessageInstruction(ix, m),
    );
    return { mensagem, estado: conta.data.estado.__kind };
}

const iguais = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export type RetiradaPreparada = { codigo: string; ultimoBloco: bigint };

/**
 * Lado da cooperativa: assina com a carteira conectada (em nome do titular `cooperativa`) e devolve o
 * texto do QR. `transportadorAssinante` é a carteira com que o transportador vai assinar.
 */
export async function prepararRetirada(
    client: AppClient,
    loteEndereco: Address,
    cooperativa: Address,
    transportador: Address,
    transportadorAssinante: Address,
): Promise<RetiradaPreparada> {
    const { value: bloco } = await client.rpc.getLatestBlockhash().send();
    const partes: Partes = {
        lote: loteEndereco,
        cooperativa,
        transportador,
        cooperativaAssinante: client.payer.address,
        transportadorAssinante,
        blockhash: bloco.blockhash,
        ultimoBloco: bloco.lastValidBlockHeight,
    };
    // O transportador assina depois, no aparelho dele: aqui só reservamos o lugar da assinatura.
    const { mensagem } = await montarMensagem(client, partes, {
        cooperativa: client.payer,
        transportador: createNoopSigner(transportadorAssinante),
    });
    const original = compileTransaction(mensagem).messageBytes;
    const assinada = await partiallySignTransactionMessageWithSigners(mensagem);
    // Se a carteira alterar a transação ao assinar, o transportador não consegue remontá-la.
    if (!iguais(assinada.messageBytes, original)) throw new Error('carteiraAlterou');
    const assinatura = assinada.signatures[partes.cooperativaAssinante];
    if (!assinatura) throw new Error('carteiraSemAssinatura');
    const outroQue = (assinante: Address, titular: Address) => (assinante === titular ? '' : assinante);
    const codigo = [
        partes.lote,
        partes.cooperativa,
        outroQue(partes.cooperativaAssinante, partes.cooperativa),
        transportador,
        outroQue(transportadorAssinante, transportador),
        partes.blockhash,
        partes.ultimoBloco,
        getBase58Decoder().decode(assinatura),
    ].join(':');
    return { codigo: PREFIXO + codigo, ultimoBloco: partes.ultimoBloco };
}

/** Motivos para recusar um QR lido pelo transportador (chaves de tradução em `retiradas.qr.*`). */
export class RetiradaInvalida extends Error {
    constructor(readonly motivo: 'formato' | 'outroTransportador' | 'assinaturaInvalida' | 'jaRetirado') {
        super(motivo);
    }
}

export type RetiradaLida = { tx: Transaction; lote: Address; cooperativa: Address; ultimoBloco: bigint };

/**
 * Lado do transportador: remonta a transação a partir do QR e da blockchain e confere a assinatura
 * da cooperativa. Nada é assinado aqui.
 */
export async function lerRetirada(client: AppClient, texto: string, transportador: Address): Promise<RetiradaLida> {
    if (!texto.startsWith(PREFIXO)) throw new RetiradaInvalida('formato');
    const campos = texto.slice(PREFIXO.length).split(':');
    if (campos.length !== 8) throw new RetiradaInvalida('formato');
    let partes: Partes;
    let assinatura: SignatureBytes;
    try {
        const cooperativa = address(campos[1]);
        const transp = address(campos[3]);
        partes = {
            lote: address(campos[0]),
            cooperativa,
            cooperativaAssinante: campos[2] ? address(campos[2]) : cooperativa,
            transportador: transp,
            transportadorAssinante: campos[4] ? address(campos[4]) : transp,
            blockhash: campos[5] as Blockhash,
            ultimoBloco: BigInt(campos[6]),
        };
        assinatura = getBase58Encoder().encode(campos[7]) as SignatureBytes;
    } catch {
        throw new RetiradaInvalida('formato');
    }
    // Quem lê o QR tem de ser a carteira que a cooperativa indicou para assinar pelo transportador.
    if (partes.transportadorAssinante !== transportador) throw new RetiradaInvalida('outroTransportador');

    const { mensagem, estado } = await montarMensagem(client, partes, {
        cooperativa: createNoopSigner(partes.cooperativaAssinante),
        transportador: createNoopSigner(transportador),
    });
    if (estado !== 'Vendido') throw new RetiradaInvalida('jaRetirado');
    const tx = compileTransaction(mensagem);
    const chave = await getPublicKeyFromAddress(partes.cooperativaAssinante);
    if (assinatura.length !== 64 || !(await verifySignature(chave, assinatura, tx.messageBytes))) {
        throw new RetiradaInvalida('assinaturaInvalida');
    }
    return {
        tx: { ...tx, signatures: { ...tx.signatures, [partes.cooperativaAssinante]: assinatura } },
        lote: partes.lote,
        cooperativa: partes.cooperativa,
        ultimoBloco: partes.ultimoBloco,
    };
}

/** Pede a assinatura do transportador à carteira, confere que a mensagem não mudou e envia. */
export async function assinarEEnviarRetirada(client: AppClient, lida: RetiradaLida): Promise<string> {
    const signer = client.payer;
    if (!isTransactionModifyingSigner(signer)) throw new Error('carteiraSemAssinatura');
    const [assinada] = await signer.modifyAndSignTransactions([lida.tx]);
    // Se a carteira alterar a transação (ex.: acrescentar instruções), a assinatura da cooperativa deixa de valer.
    if (!iguais(assinada.messageBytes, lida.tx.messageBytes)) throw new Error('carteiraAlterou');
    const assinatura = await client.rpc
        .sendTransaction(getBase64EncodedWireTransaction(assinada), { encoding: 'base64', preflightCommitment: 'confirmed' })
        .send();
    for (let i = 0; i < 30; i++) {
        const { value } = await client.rpc.getSignatureStatuses([assinatura]).send();
        const status = value[0];
        if (status?.err) throw new Error(JSON.stringify(status.err));
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return assinatura;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return assinatura;
}
