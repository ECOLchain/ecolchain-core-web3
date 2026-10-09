import { useTranslation } from 'react-i18next';
import type * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import type { ContaDecodificada } from '../solana/contas';
import { textoParaGarrafas } from '../solana/useDados';
import { Campo, Selecao } from './ui';

/** Material escolhido num formulário: código, variação (0 = sem) e garrafas (texto do campo). */
export type EscolhaMaterial = { material: string; variacao: string; garrafas: string };
export const ESCOLHA_VAZIA: EscolhaMaterial = { material: '', variacao: '', garrafas: '' };

type Variacoes = Map<number, ContaDecodificada<lote.MaterialVariacao>[]> | undefined;

/**
 * Valores para a instrução, ou `null` se falta algo: material com variações exige uma; garrafas só em
 * material que conta garrafas (e, com `garrafasObrigatorias`, maiores que zero).
 */
export function lerEscolha(
    e: EscolhaMaterial,
    materiais: ContaDecodificada<lote.Material>[],
    garrafasObrigatorias = false,
): { material: number; variacao: number; garrafas: number } | null {
    const m = materiais.find((x) => String(x.dados.codigo) === e.material);
    if (!m) return null;
    const variacao = m.dados.qtdVariacoes > 0 ? Number(e.variacao) : 0;
    if (m.dados.qtdVariacoes > 0 && !variacao) return null;
    const garrafas = m.dados.contaGarrafas ? textoParaGarrafas(e.garrafas) : 0;
    if (garrafas === null || (garrafasObrigatorias && m.dados.contaGarrafas && garrafas === 0)) return null;
    if (garrafasObrigatorias && !m.dados.contaGarrafas) return null;
    return { material: m.dados.codigo, variacao, garrafas };
}

/** Material, cor (quando o material tem variações) e garrafas aproximadas (quando conta garrafas). */
export function CamposMaterial({
    valor,
    onChange,
    materiais,
    variacoes,
    garrafasObrigatorias = false,
    bloqueado = false,
}: {
    valor: EscolhaMaterial;
    onChange: (v: EscolhaMaterial) => void;
    /** Só os materiais ativos que podem ser escolhidos. */
    materiais: ContaDecodificada<lote.Material>[];
    variacoes: Variacoes;
    garrafasObrigatorias?: boolean;
    /** Material e cor vêm de outro lugar (coleta do importador): só as garrafas ficam editáveis. */
    bloqueado?: boolean;
}) {
    const { t } = useTranslation();
    const m = materiais.find((x) => String(x.dados.codigo) === valor.material);
    const cores = (m && variacoes?.get(m.dados.codigo)) ?? [];
    const garrafasInvalidas = valor.garrafas !== '' && textoParaGarrafas(valor.garrafas) === null;
    return (
        <>
            <Selecao
                rotulo={t('cooperativa.material')}
                required
                disabled={bloqueado}
                value={valor.material}
                onChange={(e) => onChange({ material: e.target.value, variacao: '', garrafas: valor.garrafas })}
            >
                <option value="" disabled>
                    {t('cooperativa.escolherMaterial')}
                </option>
                {materiais.map((x) => (
                    <option key={x.endereco} value={x.dados.codigo}>
                        {x.dados.nome}
                    </option>
                ))}
            </Selecao>
            {m && m.dados.qtdVariacoes > 0 && (
                <Selecao
                    rotulo={t('material.variacao')}
                    required
                    disabled={bloqueado}
                    value={valor.variacao}
                    onChange={(e) => onChange({ ...valor, variacao: e.target.value })}
                >
                    <option value="" disabled>
                        {t('material.escolherVariacao')}
                    </option>
                    {cores
                        .filter((v) => v.dados.ativa || String(v.dados.indice) === valor.variacao)
                        .map((v) => (
                            <option key={v.endereco} value={v.dados.indice}>
                                {lerNomeFixo(v.dados.nome)}
                            </option>
                        ))}
                </Selecao>
            )}
            {m?.dados.contaGarrafas && (
                <Campo
                    rotulo={t('material.garrafas')}
                    inputMode="numeric"
                    required={garrafasObrigatorias}
                    value={valor.garrafas}
                    placeholder="0"
                    onChange={(e) => onChange({ ...valor, garrafas: e.target.value })}
                    aria-invalid={garrafasInvalidas}
                    ajuda={garrafasInvalidas ? t('material.garrafasInvalidas') : t('material.garrafasAjuda')}
                />
            )}
        </>
    );
}
