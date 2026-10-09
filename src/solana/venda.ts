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
    partiallySignTransactionMessageWithSigners,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    type SignatureBytes,
    type TransactionSigner,
    verifySignature,
} from '@solana/kit';
import * as lote from '@clientes/generated/ecol_lote';
import { normalizarReferencia } from '@clientes/coletor';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { vinculoDe } from './ator';
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
 * A transação usa um blockhash comum, então o código vale por cerca de um minuto: as três
 * assinaturas precisam acontecer nesse intervalo (depois, a administração gera outro código).
 * A primeira versão usava um nonce durável, sem prazo, mas a Solflare não reconhece a rede de uma
 * transação com nonce (o valor do nonce não é um blockhash recente) e bloqueia a assinatura.
 *
 * Cada aparelho remonta a transação a partir da blockchain e do código, confere as assinaturas já
 * feitas e acrescenta a sua. O código viaja por QR ou copiar e colar:
 * `ecolchain:venda:v3:<lote>:<indústria>:<assinante da indústria>:<valor>:<depósito>:<ata>:<blockhash>:<último bloco>:<papel>=<assinatura>,...`
 * O assinante da indústria fica vazio quando é a própria carteira titular; senão, é uma carteira
 * vinculada a ela (ADR 0011), escolhida pelo operador ao registrar a venda.
 */
const PREFIXO = 'ecolchain:venda:v3:';
const DOMINIO_ESCROW = 'ECOLCHAIN:ESCROW:v1';
const DOMINIO_LEILAO = 'ECOLCHAIN:LEILAO:v1';

export type PapelVenda = 'operador' | 'intermediador' | 'industria';
export const PAPEIS_VENDA: readonly PapelVenda[] = ['operador', 'intermediador', 'industria'];

export type DadosVenda = {
    lote: Address;
    /** Titular da indústria compradora (vai para `Lote.industria`). */
    industria: Address;
    /** Carteira que assina pela indústria: a titular ou uma vinculada a ela. */
    industriaAssinante: Address;
    valorCentavos: bigint;
    /** Referência do depósito no escrow (ex.: id do Pix), informada pelo intermediador. */
    deposito: string;
    /** Referência da apuração do leilão (ex.: número da ata). */
    ata: string;
    blockhash: Blockhash;
    /** Última altura de bloco em que o blockhash ainda vale. */
    ultimoBloco: bigint;
};
export type Assinaturas = Partial<Record<PapelVenda, SignatureBytes>>;

async function hashReferencia(dominio: string, texto: string) {
    const bytes = new TextEncoder().encode(dominio + normalizarReferencia(texto));
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
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
        industria: d.industriaAssinante,
    };
    const signer = (p: PapelVenda) => (local?.papel === p ? local.signer : createNoopSigner(enderecos[p]));
    if (local && local.signer.address !== enderecos[local.papel]) throw new Error('carteiraOutroPapel');

    const ix = await lote.getIndustriaAcceptVendaInstructionAsync({
        industria: d.industria,
        industriaAssinante: signer('industria'),
        industriaCarteira: await vinculoDe(d.industria, d.industriaAssinante),
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
        // O operador paga a taxa.
        (m) => setTransactionMessageFeePayerSigner(signer('operador'), m),
        (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: d.blockhash, lastValidBlockHeight: d.ultimoBloco }, m),
        (m) => appendTransactionMessageInstruction(ix, m),
    );
    return { mensagem, enderecos, lote: conta.data };
}

const iguais = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export function codificar(d: DadosVenda, assinaturas: Assinaturas): string {
    const assin = PAPEIS_VENDA.filter((p) => assinaturas[p])
        .map((p) => `${p}=${getBase58Decoder().decode(assinaturas[p]!)}`)
        .join(',');
    return (
        PREFIXO +
        [
            d.lote,
            d.industria,
            d.industriaAssinante === d.industria ? '' : d.industriaAssinante,
            d.valorCentavos,
            encodeURIComponent(d.deposito),
            encodeURIComponent(d.ata),
            d.blockhash,
            d.ultimoBloco,
            assin,
        ].join(':')
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
    if (campos.length !== 9) throw new CodigoVendaInvalido('formato');
    try {
        const assinaturas: Assinaturas = {};
        for (const par of campos[8].split(',').filter(Boolean)) {
            const [papel, sig] = par.split('=');
            if (!PAPEIS_VENDA.includes(papel as PapelVenda)) throw new Error();
            assinaturas[papel as PapelVenda] = getBase58Encoder().encode(sig) as SignatureBytes;
        }
        return {
            dados: {
                lote: address(campos[0]),
                industria: address(campos[1]),
                industriaAssinante: address(campos[2] || campos[1]),
                valorCentavos: BigInt(campos[3]),
                deposito: decodeURIComponent(campos[4]),
                ata: decodeURIComponent(campos[5]),
                blockhash: campos[6] as Blockhash,
                ultimoBloco: BigInt(campos[7]),
            },
            assinaturas,
        };
    } catch {
        throw new CodigoVendaInvalido('formato');
    }
}

export type Conferida = { dados: DadosVenda; assinaturas: Assinaturas; lote: lote.Lote; enderecos: Record<PapelVenda, Address> };

/**
 * Remonta a transação do código e confere: lote ainda anunciado, código no prazo e cada
 * assinatura presente feita pela carteira certa sobre exatamente esta transação.
 */
export async function conferir(client: AppClient, texto: string): Promise<Conferida> {
    const { dados, assinaturas } = decodificar(texto);
    const { mensagem, enderecos, lote: conta } = await montar(client, dados);
    if (conta.estado.__kind !== 'Anunciado') throw new CodigoVendaInvalido('naoAnunciado');
    await conferirPrazo(client, dados);
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
    d: Omit<DadosVenda, 'blockhash' | 'ultimoBloco'>,
): Promise<{ codigo: string; dados: DadosVenda }> {
    const { value: bloco } = await client.rpc.getLatestBlockhash().send();
    const dados: DadosVenda = { ...d, blockhash: bloco.blockhash, ultimoBloco: bloco.lastValidBlockHeight };
    const assinaturas = await assinarComCarteira(client, dados, 'operador', {});
    return { codigo: codificar(dados, assinaturas), dados };
}

/** O blockhash vale até `ultimoBloco`; depois disso a transação não entra mais na blockchain. */
export async function codigoVencido(client: AppClient, d: Pick<DadosVenda, 'ultimoBloco'>) {
    return (await client.rpc.getBlockHeight().send()) > d.ultimoBloco;
}

async function conferirPrazo(client: AppClient, d: DadosVenda) {
    if (await codigoVencido(client, d)) throw new CodigoVendaInvalido('vencido');
}

async function assinarComCarteira(client: AppClient, d: DadosVenda, papel: PapelVenda, anteriores: Assinaturas) {
    // Sem isso, a carteira assinaria uma transação que já não pode ser enviada.
    await conferirPrazo(client, d);
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
