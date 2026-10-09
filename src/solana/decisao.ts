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
    none,
    partiallySignTransactionMessageWithSigners,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type SignatureBytes,
    some,
    type Transaction,
    type TransactionSigner,
    verifySignature,
} from '@solana/kit';
import { normalizarReferencia } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import type { AppClient } from './cliente';

/**
 * Decisão do árbitro que movimenta o escrow (`arbitro_resolve_disputa` com `Liberar` ou `Reembolsar`):
 * o árbitro e o intermediador assinam a mesma transação, cada um no seu aparelho, como na retirada.
 *
 * O árbitro monta, assina (e paga a taxa) e mostra o código:
 * `ecolchain:decisao:v1:<lote>:<L|R>:<valor liberado>:<novo peso ou vazio>:<referência>:<árbitro>:<blockhash>:<último bloco>:<assinatura>`.
 * A referência (id da devolução ou do repasse) vai como texto, para o intermediador conferir; on-chain
 * fica só o hash (`ECOLCHAIN:DECISAO:v1` sobre o texto normalizado). O intermediador remonta a
 * transação a partir da blockchain, confere a assinatura do árbitro, assina e envia.
 *
 * `Prosseguir` não mexe no escrow: o árbitro assina sozinho, sem código.
 */
const PREFIXO = 'ecolchain:decisao:v1:';
const DOMINIO = 'ECOLCHAIN:DECISAO:v1';

export type DecisaoEscrow =
    | { tipo: 'liberar'; valorLiberadoCentavos: bigint; novoPesoG?: bigint; referencia: string }
    | { tipo: 'reembolsar'; referencia: string };

type Partes = {
    lote: Address;
    decisao: DecisaoEscrow;
    arbitro: Address;
    intermediador: Address;
    blockhash: Blockhash;
    ultimoBloco: bigint;
};

const hashReferencia = async (texto: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DOMINIO + normalizarReferencia(texto))));

/** Instrução da decisão; `intermediador` só nas decisões que movimentam o escrow. */
export async function instrucaoDecisao(
    loteEndereco: Address,
    arbitro: TransactionSigner,
    decisao: lote.DecisaoDisputaArgs,
    intermediador?: TransactionSigner,
) {
    return lote.getArbitroResolveDisputaInstructionAsync({
        arbitro,
        intermediador,
        lote: loteEndereco,
        eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
        decisao,
    });
}

async function argsDe(d: DecisaoEscrow): Promise<lote.DecisaoDisputaArgs> {
    const refHash = await hashReferencia(d.referencia);
    return d.tipo === 'liberar'
        ? {
              __kind: 'Liberar',
              valorLiberadoCentavos: d.valorLiberadoCentavos,
              novoPesoG: d.novoPesoG === undefined ? none() : some(d.novoPesoG),
              refHash,
          }
        : { __kind: 'Reembolsar', refHash };
}

/** A mesma transação, byte a byte, dos dois lados. */
async function montarMensagem(p: Partes, signers: { arbitro: TransactionSigner; intermediador: TransactionSigner }) {
    const ix = await instrucaoDecisao(p.lote, signers.arbitro, await argsDe(p.decisao), signers.intermediador);
    return pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signers.arbitro, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: p.blockhash, lastValidBlockHeight: p.ultimoBloco }, m),
        (m) => appendTransactionMessageInstruction(ix, m),
    );
}

const iguais = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export type DecisaoPreparada = { codigo: string; ultimoBloco: bigint };

/** Lado do árbitro: assina com a carteira conectada e devolve o texto do código. */
export async function prepararDecisao(client: AppClient, loteEndereco: Address, decisao: DecisaoEscrow): Promise<DecisaoPreparada> {
    const config = await lote.fetchGlobalConfig(client.rpc, await pLote.config());
    const { value: bloco } = await client.rpc.getLatestBlockhash().send();
    const partes: Partes = {
        lote: loteEndereco,
        decisao,
        arbitro: client.payer.address,
        intermediador: config.data.intermediador,
        blockhash: bloco.blockhash,
        ultimoBloco: bloco.lastValidBlockHeight,
    };
    const mensagem = await montarMensagem(partes, { arbitro: client.payer, intermediador: createNoopSigner(partes.intermediador) });
    const original = compileTransaction(mensagem).messageBytes;
    const assinada = await partiallySignTransactionMessageWithSigners(mensagem);
    if (!iguais(assinada.messageBytes, original)) throw new Error('carteiraAlterou');
    const assinatura = assinada.signatures[partes.arbitro];
    if (!assinatura) throw new Error('carteiraSemAssinatura');
    const campos = [
        loteEndereco,
        decisao.tipo === 'liberar' ? 'L' : 'R',
        decisao.tipo === 'liberar' ? decisao.valorLiberadoCentavos.toString() : '',
        decisao.tipo === 'liberar' && decisao.novoPesoG !== undefined ? decisao.novoPesoG.toString() : '',
        encodeURIComponent(decisao.referencia),
        partes.arbitro,
        partes.blockhash,
        partes.ultimoBloco.toString(),
        getBase58Decoder().decode(assinatura),
    ];
    return { codigo: PREFIXO + campos.join(':'), ultimoBloco: partes.ultimoBloco };
}

/** Motivos para recusar um código lido pelo intermediador (chaves em `arbitragem.codigo.*`). */
export class DecisaoInvalida extends Error {
    constructor(readonly motivo: 'formato' | 'outroIntermediador' | 'assinaturaInvalida' | 'semDisputa') {
        super(motivo);
    }
}

export type DecisaoLida = { tx: Transaction; lote: Address; dados: lote.Lote; decisao: DecisaoEscrow; arbitro: Address; ultimoBloco: bigint };

/** Lado do intermediador: remonta a transação e confere a assinatura do árbitro. Nada é assinado aqui. */
export async function lerDecisao(client: AppClient, texto: string): Promise<DecisaoLida> {
    const t = texto.trim();
    if (!t.startsWith(PREFIXO)) throw new DecisaoInvalida('formato');
    const c = t.slice(PREFIXO.length).split(':');
    if (c.length !== 9 || (c[1] !== 'L' && c[1] !== 'R')) throw new DecisaoInvalida('formato');
    let partes: Partes;
    let assinatura: SignatureBytes;
    try {
        const referencia = decodeURIComponent(c[4]);
        const decisao: DecisaoEscrow =
            c[1] === 'L'
                ? { tipo: 'liberar', valorLiberadoCentavos: BigInt(c[2]), novoPesoG: c[3] ? BigInt(c[3]) : undefined, referencia }
                : { tipo: 'reembolsar', referencia };
        partes = {
            lote: address(c[0]),
            decisao,
            arbitro: address(c[5]),
            intermediador: client.payer.address,
            blockhash: c[6] as Blockhash,
            ultimoBloco: BigInt(c[7]),
        };
        assinatura = getBase58Encoder().encode(c[8]) as SignatureBytes;
    } catch {
        throw new DecisaoInvalida('formato');
    }
    const [config, conta] = await Promise.all([
        lote.fetchGlobalConfig(client.rpc, await pLote.config()),
        lote.fetchLote(client.rpc, partes.lote),
    ]);
    if (config.data.intermediador !== client.payer.address) throw new DecisaoInvalida('outroIntermediador');
    if (config.data.arbitro !== partes.arbitro) throw new DecisaoInvalida('assinaturaInvalida');
    if (conta.data.estado.__kind !== 'EmDisputa') throw new DecisaoInvalida('semDisputa');
    const mensagem = await montarMensagem(partes, {
        arbitro: createNoopSigner(partes.arbitro),
        intermediador: createNoopSigner(partes.intermediador),
    });
    const tx = compileTransaction(mensagem);
    const chave = await getPublicKeyFromAddress(partes.arbitro);
    if (assinatura.length !== 64 || !(await verifySignature(chave, assinatura, tx.messageBytes))) {
        throw new DecisaoInvalida('assinaturaInvalida');
    }
    return {
        tx: { ...tx, signatures: { ...tx.signatures, [partes.arbitro]: assinatura } },
        lote: partes.lote,
        dados: conta.data,
        decisao: partes.decisao,
        arbitro: partes.arbitro,
        ultimoBloco: partes.ultimoBloco,
    };
}

/** Pede a assinatura do intermediador, confere que a mensagem não mudou e envia. */
export async function assinarEEnviarDecisao(client: AppClient, lida: DecisaoLida): Promise<string> {
    const signer = client.payer;
    if (!isTransactionModifyingSigner(signer)) throw new Error('carteiraSemAssinatura');
    const [assinada] = await signer.modifyAndSignTransactions([lida.tx]);
    if (!iguais(assinada.messageBytes, lida.tx.messageBytes)) throw new Error('carteiraAlterou');
    const sig = await client.rpc
        .sendTransaction(getBase64EncodedWireTransaction(assinada), { encoding: 'base64', preflightCommitment: 'confirmed' })
        .send();
    for (let i = 0; i < 30; i++) {
        const { value } = await client.rpc.getSignatureStatuses([sig]).send();
        const status = value[0];
        if (status?.err) throw new Error(JSON.stringify(status.err));
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return sig;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return sig;
}
