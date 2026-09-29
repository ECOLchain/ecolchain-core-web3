import * as errosLote from '@clientes/generated/ecol_lote/errors';

// Nome do erro (ex.: `MaterialInativo`) a partir do código numérico do `ecol_lote`.
const NOMES_LOTE = new Map<number, string>(
    Object.entries(errosLote)
        .filter(([nome, valor]) => nome.startsWith('ECOL_LOTE_ERROR__') && typeof valor === 'number')
        .map(([nome, valor]) => [
            valor as number,
            nome
                .replace('ECOL_LOTE_ERROR__', '')
                .toLowerCase()
                .replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase()),
        ]),
);

/**
 * Traduz um erro de envio numa chave de `erros.*`. Percorre a cadeia de causas do SolanaError
 * procurando o código do programa; sem código, identifica recusa na carteira e conta já existente.
 */
export function chaveDoErro(erro: unknown): string {
    const textos: string[] = [];
    let atual: unknown = erro;
    for (let i = 0; atual && i < 8; i++) {
        const e = atual as { context?: { code?: unknown; logs?: unknown }; message?: string; cause?: unknown };
        if (typeof e.context?.code === 'number' && NOMES_LOTE.has(e.context.code)) {
            return `erros.${NOMES_LOTE.get(e.context.code)}`;
        }
        if (Array.isArray(e.context?.logs)) textos.push(...(e.context.logs as string[]));
        if (e.message) textos.push(e.message);
        atual = e.cause;
    }
    const tudo = textos.join('\n');
    if (tudo.includes('carteiraAlterou')) return 'erros.carteiraAlterou';
    if (tudo.includes('carteiraSemAssinatura')) return 'erros.carteiraSemAssinatura';
    if (tudo.includes('carteiraOutroPapel')) return 'erros.carteiraOutroPapel';
    if (tudo.includes('semNonce')) return 'erros.semNonce';
    if (/blockhash not found|block height exceeded/i.test(tudo)) return 'erros.codigoExpirado';
    if (/already in use/i.test(tudo)) return 'erros.jaExiste';
    if (/reject|denied|cancel/i.test(tudo)) return 'erros.recusado';
    if (/insufficient (lamports|funds)|debit an account but found no record/i.test(tudo)) return 'erros.semSaldo';
    return 'erros.generico';
}
