import type { Address, Instruction } from '@solana/kit';
import type { TFunction } from 'i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority } from '@clientes/pdas';
import { brl } from '../../solana/useDados';

/**
 * Venda direta (ADR 0012): o lote fica "à venda" por preço fixo (estado `Anunciado` com `vendaDireta`)
 * ou é marcado como vendido fora da plataforma (`VendidoFora`). O leilão segue no mesmo estado
 * `Anunciado`, sem a marca.
 */
export const aVenda = (l: lote.Lote) => l.estado.__kind === 'Anunciado' && l.vendaDireta;

/** Em leilão: os lances são feitos fora da plataforma e a Administração registra o vencedor. */
export const emLeilao = (l: lote.Lote) => l.estado.__kind === 'Anunciado' && !l.vendaDireta;

/** Fim do leilão (segundos Unix); zero na venda direta, que não tem prazo. */
export const prazoLeilao = (l: lote.Lote) => (l.estado.__kind === 'Anunciado' && !l.vendaDireta ? l.estado.prazoLeilao : 0n);

/** Nome da situação do lote, distinguindo a venda direta do leilão. */
export const rotuloEstado = (t: TFunction, l: lote.Lote) => (aVenda(l) ? t('venda.aVenda') : t(`estadoLote.${l.estado.__kind}`));

/** "Própria" / "Terceiro"; vazio nos lotes de leilão. */
export const rotuloModo = (t: TFunction, m: lote.ModoRetirada) =>
    m === lote.ModoRetirada.Propria ? t('venda.modo.propria') : m === lote.ModoRetirada.Terceiro ? t('venda.modo.terceiro') : '';

export const precoDe = (l: lote.Lote, idioma: string) => brl(l.precoMinimoCentavos, idioma);

/** Contas da cooperativa que assina (titular ou carteira vinculada) sobre um lote. */
export type ContasCoop = Pick<
    Parameters<typeof lote.getCooperativaListLoteInstructionAsync>[0],
    'cooperativa' | 'cooperativaAssinante' | 'cooperativaCarteira'
>;

/**
 * Instruções que levam o lote à situação escolhida. Para mudar o preço ou trocar entre "à venda" e
 * "vendido", primeiro volta-se a `SemLance` (retirar da venda ou desfazer a marca), tudo na mesma transação.
 */
export async function ixsSituacao(
    contas: ContasCoop,
    l: { endereco: Address; dados: lote.Lote },
    destino: { tipo: 'aVenda'; centavos: bigint } | { tipo: 'vendido' } | { tipo: 'retirar' },
): Promise<Instruction[]> {
    const base = {
        ...contas,
        lote: l.endereco,
        eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
    };
    const ixs: Instruction[] = [];
    const estado = l.dados.estado.__kind;
    if (estado === 'Anunciado') ixs.push(await lote.getCooperativaCancelAnuncioInstructionAsync(base));
    if (estado === 'VendidoFora') ixs.push(await lote.getCooperativaSetVendidoForaInstructionAsync({ ...base, vendido: false }));
    if (destino.tipo === 'aVenda') ixs.push(await lote.getCooperativaAnunciarVendaInstructionAsync({ ...base, precoCentavos: destino.centavos }));
    if (destino.tipo === 'vendido') ixs.push(await lote.getCooperativaSetVendidoForaInstructionAsync({ ...base, vendido: true }));
    return ixs;
}
