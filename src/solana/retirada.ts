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
import type { AppClient } from './cliente';

/**
 * Retirada do lote (`transportador_pickup_lote`): a cooperativa e o transportador assinam a mesma
 * transação, cada um no seu aparelho.
 *
 * A cooperativa monta a transação, assina (e paga a taxa) e mostra num QR Code só o necessário para
 * remontá-la: `ecolchain:retirada:v1:<lote>:<cooperativa>:<transportador>:<blockhash>:<último bloco>:<assinatura>`.
 * O aparelho do transportador remonta a mesma transação a partir da blockchain, confere a assinatura
 * da cooperativa, assina e envia. Assim o QR fica pequeno (fácil de ler) e o transportador assina o
 * que ele mesmo montou, não bytes vindos de fora.
 *
 * O blockhash vale por cerca de um minuto; depois disso a cooperativa gera outro código.
 */
const PREFIXO = 'ecolchain:retirada:v1:';

type Partes = { lote: Address; cooperativa: Address; transportador: Address; blockhash: Blockhash; ultimoBloco: bigint };

/** A mesma transação, byte a byte, dos dois lados: mesmas contas, pagador e blockhash. */
async function montarMensagem(client: AppClient, p: Partes, signers: { cooperativa: TransactionSigner; transportador: TransactionSigner }) {
    const conta = await lote.fetchLote(client.rpc, p.lote);
    const ix = await lote.getTransportadorPickupLoteInstructionAsync({
        transportador: signers.transportador,
        cooperativa: signers.cooperativa,
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

/** Lado da cooperativa: assina com a carteira conectada e devolve o texto do QR. */
export async function prepararRetirada(client: AppClient, loteEndereco: Address, transportador: Address): Promise<RetiradaPreparada> {
    const { value: bloco } = await client.rpc.getLatestBlockhash().send();
    const partes: Partes = {
        lote: loteEndereco,
        cooperativa: client.payer.address,
        transportador,
        blockhash: bloco.blockhash,
        ultimoBloco: bloco.lastValidBlockHeight,
    };
    // O transportador assina depois, no aparelho dele: aqui só reservamos o lugar da assinatura.
    const { mensagem } = await montarMensagem(client, partes, { cooperativa: client.payer, transportador: createNoopSigner(transportador) });
    const original = compileTransaction(mensagem).messageBytes;
    const assinada = await partiallySignTransactionMessageWithSigners(mensagem);
    // Se a carteira alterar a transação ao assinar, o transportador não consegue remontá-la.
    if (!iguais(assinada.messageBytes, original)) throw new Error('carteiraAlterou');
    const assinatura = assinada.signatures[partes.cooperativa];
    if (!assinatura) throw new Error('carteiraSemAssinatura');
    const codigo = [partes.lote, partes.cooperativa, transportador, partes.blockhash, partes.ultimoBloco, getBase58Decoder().decode(assinatura)].join(':');
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
    if (campos.length !== 6) throw new RetiradaInvalida('formato');
    let partes: Partes;
    let assinatura: SignatureBytes;
    try {
        partes = {
            lote: address(campos[0]),
            cooperativa: address(campos[1]),
            transportador: address(campos[2]),
            blockhash: campos[3] as Blockhash,
            ultimoBloco: BigInt(campos[4]),
        };
        assinatura = getBase58Encoder().encode(campos[5]) as SignatureBytes;
    } catch {
        throw new RetiradaInvalida('formato');
    }
    if (partes.transportador !== transportador) throw new RetiradaInvalida('outroTransportador');

    const { mensagem, estado } = await montarMensagem(client, partes, {
        cooperativa: createNoopSigner(partes.cooperativa),
        transportador: createNoopSigner(transportador),
    });
    if (estado !== 'Vendido') throw new RetiradaInvalida('jaRetirado');
    const tx = compileTransaction(mensagem);
    const chave = await getPublicKeyFromAddress(partes.cooperativa);
    if (assinatura.length !== 64 || !(await verifySignature(chave, assinatura, tx.messageBytes))) {
        throw new RetiradaInvalida('assinaturaInvalida');
    }
    return {
        tx: { ...tx, signatures: { ...tx.signatures, [partes.cooperativa]: assinatura } },
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
