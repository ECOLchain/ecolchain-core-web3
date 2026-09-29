import { getCreateAccountWithSeedInstruction, getInitializeNonceAccountInstruction, getNonceSize, fetchMaybeNonce, SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
    type Address,
    address,
    appendTransactionMessageInstruction,
    compileTransaction,
    createAddressWithSeed,
    createNoopSigner,
    createTransactionMessage,
    getBase58Decoder,
    getBase58Encoder,
    getBase64EncodedWireTransaction,
    getPublicKeyFromAddress,
    type Nonce,
    partiallySignTransactionMessageWithSigners,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingDurableNonce,
    type SignatureBytes,
    type TransactionSigner,
    verifySignature,
} from '@solana/kit';
import * as lote from '@clientes/generated/ecol_lote';
import { normalizarReferencia } from '@clientes/coletor';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import type { AppClient } from './cliente';

/**
 * Venda do lote (`industria_accept_venda`): três assinaturas na mesma transação, em aparelhos
 * diferentes.
 *
 * 1. A **administração** (operador) registra o resultado do leilão: indústria vencedora, valor,
 *    referência do depósito no escrow e da ata do leilão. Assina e paga a taxa.
 * 2. O **intermediador** confere e assina (atesta o depósito).
 * 3. A **indústria** confere e assina. Quem completar as três assinaturas envia.
 *
 * Passar por três pessoas leva mais que o minuto de um blockhash, então a transação usa um **nonce
 * durável**: uma conta do operador (endereço derivado da carteira dele) cujo valor só muda quando
 * uma transação o usa. O código fica válido até ser enviado ou até outra venda usar o nonce.
 *
 * Cada aparelho remonta a transação a partir da blockchain e do código, confere as assinaturas já
 * feitas e acrescenta a sua. O código viaja por QR ou copiar e colar:
 * `ecolchain:venda:v1:<lote>:<indústria>:<valor>:<depósito>:<ata>:<nonce>:<papel>=<assinatura>,...`
 */
const PREFIXO = 'ecolchain:venda:v1:';
const SEMENTE_NONCE = 'ecolchain-venda';
const DOMINIO_ESCROW = 'ECOLCHAIN:ESCROW:v1';
const DOMINIO_LEILAO = 'ECOLCHAIN:LEILAO:v1';

export type PapelVenda = 'operador' | 'intermediador' | 'industria';
export const PAPEIS_VENDA: readonly PapelVenda[] = ['operador', 'intermediador', 'industria'];

export type DadosVenda = {
    lote: Address;
    industria: Address;
    valorCentavos: bigint;
    /** Referência do depósito no escrow (ex.: id do Pix), informada pelo intermediador. */
    deposito: string;
    /** Referência da apuração do leilão (ex.: número da ata). */
    ata: string;
    nonce: Nonce;
};
export type Assinaturas = Partial<Record<PapelVenda, SignatureBytes>>;

async function hashReferencia(dominio: string, texto: string) {
    const bytes = new TextEncoder().encode(dominio + normalizarReferencia(texto));
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** Conta de nonce da venda: derivada da carteira do operador, sem chave própria para guardar. */
export const enderecoNonce = (operador: Address) =>
    createAddressWithSeed({ baseAddress: operador, seed: SEMENTE_NONCE, programAddress: SYSTEM_PROGRAM_ADDRESS });

/** Operador: cria a conta de nonce na primeira venda (≈ 0,0015 SOL de rent, recuperável). */
export async function garantirNonce(client: AppClient): Promise<Address> {
    const operador = client.payer.address;
    const conta = await enderecoNonce(operador);
    if ((await fetchMaybeNonce(client.rpc, conta)).exists) return conta;
    const espaco = BigInt(getNonceSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(espaco).send();
    await client.sendTransaction([
        getCreateAccountWithSeedInstruction({
            payer: client.payer,
            newAccount: conta,
            base: operador,
            seed: SEMENTE_NONCE,
            amount: rent,
            space: espaco,
            programAddress: SYSTEM_PROGRAM_ADDRESS,
        }),
        getInitializeNonceAccountInstruction({ nonceAccount: conta, nonceAuthority: operador }),
    ]);
    return conta;
}

/** Valor atual do nonce do operador (muda a cada venda enviada). */
export async function nonceAtual(client: AppClient, operador: Address): Promise<Nonce> {
    const conta = await fetchMaybeNonce(client.rpc, await enderecoNonce(operador));
    if (!conta.exists) throw new Error('semNonce');
    return conta.data.blockhash as unknown as Nonce;
}

/**
 * A mesma transação, byte a byte, em qualquer aparelho. `local` é a carteira conectada, que ocupa o
 * lugar do seu papel; os outros papéis entram só como endereço.
 */
async function montar(client: AppClient, d: DadosVenda, local?: { papel: PapelVenda; signer: TransactionSigner }) {
    const [config, conta] = await Promise.all([
        lote.fetchGlobalConfig(client.rpc, await pLote.config()),
        lote.fetchLote(client.rpc, d.lote),
    ]);
    const enderecos: Record<PapelVenda, Address> = {
        operador: config.data.operador,
        intermediador: config.data.intermediador,
        industria: d.industria,
    };
    const signer = (p: PapelVenda) => (local?.papel === p ? local.signer : createNoopSigner(enderecos[p]));
    if (local && local.signer.address !== enderecos[local.papel]) throw new Error('carteiraOutroPapel');

    const ix = await lote.getIndustriaAcceptVendaInstructionAsync({
        industria: signer('industria'),
        cooperativaPart: await pLote.participante(conta.data.cooperativa),
        operador: signer('operador'),
        intermediador: signer('intermediador'),
        lote: d.lote,
        eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
        valorCentavos: d.valorCentavos,
        escrowRefHash: await hashReferencia(DOMINIO_ESCROW, d.deposito),
        lancesRoot: await hashReferencia(DOMINIO_LEILAO, d.ata),
    });
    const mensagem = pipe(
        createTransactionMessage({ version: 0 }),
        // O operador paga a taxa e é a autoridade do nonce.
        (m) => setTransactionMessageFeePayerSigner(signer('operador'), m),
        (m) =>
            setTransactionMessageLifetimeUsingDurableNonce(
                { nonce: d.nonce, nonceAccountAddress: enderecoNonceCache.get(enderecos.operador)!, nonceAuthorityAddress: enderecos.operador },
                m,
            ),
        (m) => appendTransactionMessageInstruction(ix, m),
    );
    return { mensagem, enderecos, lote: conta.data };
}

// `montar` é síncrono no pipe: o endereço do nonce é resolvido antes e guardado aqui.
const enderecoNonceCache = new Map<Address, Address>();
async function prepararNonce(client: AppClient) {
    const config = await lote.fetchGlobalConfig(client.rpc, await pLote.config());
    const operador = config.data.operador;
    if (!enderecoNonceCache.has(operador)) enderecoNonceCache.set(operador, await enderecoNonce(operador));
    return operador;
}

const iguais = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export function codificar(d: DadosVenda, assinaturas: Assinaturas): string {
    const assin = PAPEIS_VENDA.filter((p) => assinaturas[p])
        .map((p) => `${p}=${getBase58Decoder().decode(assinaturas[p]!)}`)
        .join(',');
    return (
        PREFIXO +
        [d.lote, d.industria, d.valorCentavos, encodeURIComponent(d.deposito), encodeURIComponent(d.ata), d.nonce, assin].join(':')
    );
}

export class CodigoVendaInvalido extends Error {
    constructor(readonly motivo: 'formato' | 'assinaturaInvalida' | 'vencido' | 'naoAnunciado' | 'jaAssinado') {
        super(motivo);
    }
}

export function decodificar(texto: string): { dados: DadosVenda; assinaturas: Assinaturas } {
    const limpo = texto.trim();
    if (!limpo.startsWith(PREFIXO)) throw new CodigoVendaInvalido('formato');
    const campos = limpo.slice(PREFIXO.length).split(':');
    if (campos.length !== 7) throw new CodigoVendaInvalido('formato');
    try {
        const assinaturas: Assinaturas = {};
        for (const par of campos[6].split(',').filter(Boolean)) {
            const [papel, sig] = par.split('=');
            if (!PAPEIS_VENDA.includes(papel as PapelVenda)) throw new Error();
            assinaturas[papel as PapelVenda] = getBase58Encoder().encode(sig) as SignatureBytes;
        }
        return {
            dados: {
                lote: address(campos[0]),
                industria: address(campos[1]),
                valorCentavos: BigInt(campos[2]),
                deposito: decodeURIComponent(campos[3]),
                ata: decodeURIComponent(campos[4]),
                nonce: campos[5] as Nonce,
            },
            assinaturas,
        };
    } catch {
        throw new CodigoVendaInvalido('formato');
    }
}

export type Conferida = { dados: DadosVenda; assinaturas: Assinaturas; lote: lote.Lote; enderecos: Record<PapelVenda, Address> };

/**
 * Remonta a transação do código e confere: lote ainda anunciado, nonce ainda válido e cada
 * assinatura presente feita pela carteira certa sobre exatamente esta transação.
 */
export async function conferir(client: AppClient, texto: string): Promise<Conferida> {
    const { dados, assinaturas } = decodificar(texto);
    const operador = await prepararNonce(client);
    const { mensagem, enderecos, lote: conta } = await montar(client, dados);
    if (conta.estado.__kind !== 'Anunciado') throw new CodigoVendaInvalido('naoAnunciado');
    if ((await nonceAtual(client, operador)) !== dados.nonce) throw new CodigoVendaInvalido('vencido');
    const bytes = compileTransaction(mensagem).messageBytes;
    for (const p of PAPEIS_VENDA) {
        const sig = assinaturas[p];
        if (!sig) continue;
        const ok = sig.length === 64 && (await verifySignature(await getPublicKeyFromAddress(enderecos[p]), sig, bytes));
        if (!ok) throw new CodigoVendaInvalido('assinaturaInvalida');
    }
    return { dados, assinaturas, lote: conta, enderecos };
}

/** Operador: começa a venda com os dados do leilão. Devolve o código para o próximo assinar. */
export async function iniciarVenda(
    client: AppClient,
    d: Omit<DadosVenda, 'nonce'>,
): Promise<{ codigo: string; dados: DadosVenda }> {
    await garantirNonce(client);
    const operador = await prepararNonce(client);
    const dados: DadosVenda = { ...d, nonce: await nonceAtual(client, operador) };
    const assinaturas = await assinarComCarteira(client, dados, 'operador', {});
    return { codigo: codificar(dados, assinaturas), dados };
}

async function assinarComCarteira(client: AppClient, d: DadosVenda, papel: PapelVenda, anteriores: Assinaturas) {
    await prepararNonce(client);
    const { mensagem } = await montar(client, d, { papel, signer: client.payer });
    const original = compileTransaction(mensagem).messageBytes;
    const assinada = await partiallySignTransactionMessageWithSigners(mensagem);
    if (!iguais(assinada.messageBytes, original)) throw new Error('carteiraAlterou');
    const sig = assinada.signatures[client.payer.address];
    if (!sig) throw new Error('carteiraSemAssinatura');
    return { ...anteriores, [papel]: sig };
}

/**
 * Intermediador ou indústria: acrescenta a assinatura da carteira conectada. Com as três, envia e
 * devolve a assinatura da transação; senão, devolve o código para o próximo.
 */
export async function assinarVenda(
    client: AppClient,
    c: Conferida,
    papel: PapelVenda,
): Promise<{ enviada: string } | { codigo: string }> {
    if (c.assinaturas[papel]) throw new CodigoVendaInvalido('jaAssinado');
    const assinaturas = await assinarComCarteira(client, c.dados, papel, c.assinaturas);
    if (PAPEIS_VENDA.some((p) => !assinaturas[p])) return { codigo: codificar(c.dados, assinaturas) };

    const { mensagem } = await montar(client, c.dados);
    const tx = compileTransaction(mensagem);
    const completa = { ...tx, signatures: { ...tx.signatures } };
    for (const p of PAPEIS_VENDA) (completa.signatures as Record<string, SignatureBytes>)[c.enderecos[p]] = assinaturas[p]!;
    const assinatura = await client.rpc
        .sendTransaction(getBase64EncodedWireTransaction(completa), { encoding: 'base64', preflightCommitment: 'confirmed' })
        .send();
    for (let i = 0; i < 30; i++) {
        const { value } = await client.rpc.getSignatureStatuses([assinatura]).send();
        const status = value[0];
        if (status?.err) throw new Error(JSON.stringify(status.err));
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return { enviada: assinatura };
}

/** Quem ainda falta assinar, na ordem sugerida. */
export const faltam = (a: Assinaturas) => PAPEIS_VENDA.filter((p) => !a[p]);
