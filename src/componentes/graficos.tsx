import { Table2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Gráficos do painel, em SVG/HTML próprios (sem biblioteca), seguindo a skill dataviz: marcas finas
 * (colunas ≤ 24px, ponta arredondada de 4px), grade em hairline, 2px de superfície entre barras
 * vizinhas, legenda sempre presente com 2+ séries, tooltip ao passar o mouse/focar e tabela equivalente.
 * Cores das séries: tokens `--serie-1..3` do index.css (ordem fixa, validada nos dois temas).
 */
export type Serie = { id: string; rotulo: string; cor: string; valores: number[] };

const COR_SERIE = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)'];
/** Cor fixa por posição da série (a cor segue a série, não o valor). */
export const corDaSerie = (i: number) => COR_SERIE[i] ?? 'var(--cor-texto-suave)';

/** Escala "limpa" para o eixo: 0, passo redondo (1/2/2,5/5 × 10^n), até cobrir o máximo. */
function ticks(maximo: number, alvo = 4) {
    if (maximo <= 0) return [0, 1];
    const bruto = maximo / alvo;
    const base = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * base).find((p) => p >= bruto) ?? base * 10;
    const lista: number[] = [];
    for (let v = 0; v <= maximo + passo * 0.001; v += passo) lista.push(v);
    if (lista[lista.length - 1] < maximo) lista.push(lista[lista.length - 1] + passo);
    return lista;
}

function useLargura<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [largura, setLargura] = useState(0);
    useEffect(() => {
        if (!ref.current) return;
        const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
        obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);
    return { ref, largura };
}

export function Legenda({ series }: { series: Pick<Serie, 'id' | 'rotulo' | 'cor'>[] }) {
    if (series.length < 2) return null;
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
            {series.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: s.cor }} aria-hidden="true" />
                    {s.rotulo}
                </li>
            ))}
        </ul>
    );
}

/** Cartão de gráfico: título, subtítulo, legenda e a alternância gráfico ↔ tabela. */
export function CartaoGrafico({
    titulo,
    subtitulo,
    series,
    tabela,
    children,
}: {
    titulo: string;
    subtitulo?: string;
    series?: Pick<Serie, 'id' | 'rotulo' | 'cor'>[];
    tabela: ReactNode;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const [verTabela, setVerTabela] = useState(false);
    return (
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-linha bg-superficie p-4 shadow-sm sm:p-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-texto">{titulo}</h2>
                    {subtitulo && <p className="text-sm text-texto-suave">{subtitulo}</p>}
                </div>
                <button
                    type="button"
                    onClick={() => setVerTabela((v) => !v)}
                    aria-pressed={verTabela}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-linha px-2.5 py-1 text-xs font-medium text-texto-suave hover:border-texto-suave"
                >
                    <Table2 className="size-3.5" /> {t(verTabela ? 'graficos.verGrafico' : 'graficos.verTabela')}
                </button>
            </header>
            {series && <Legenda series={series} />}
            {verTabela ? <div className="overflow-x-auto">{tabela}</div> : children}
        </section>
    );
}

/** Tabela equivalente ao gráfico (acessível; também mostra os valores exatos). */
export function TabelaGrafico({
    cabecalho,
    linhas,
}: {
    cabecalho: string[];
    linhas: (string | number)[][];
}) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b border-linha text-left text-texto-suave">
                    {cabecalho.map((c, i) => (
                        <th key={c} className={`py-1.5 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                            {c}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {linhas.map((l) => (
                    <tr key={String(l[0])} className="border-b border-linha/60 last:border-0">
                        {l.map((v, i) => (
                            <td key={i} className={`py-1.5 pr-3 ${i > 0 ? 'text-right tabular-nums' : 'text-texto'}`}>
                                {v}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/**
 * Colunas agrupadas por categoria (ex.: meses) com eixo Y único. Tooltip por grupo; a área de toque é a
 * faixa inteira da categoria.
 */
export function ColunasAgrupadas({
    categorias,
    series,
    formatar,
    altura = 220,
}: {
    categorias: string[];
    series: Serie[];
    formatar: (v: number) => string;
    altura?: number;
}) {
    const { ref, largura } = useLargura<HTMLDivElement>();
    const [ativo, setAtivo] = useState<number | null>(null);
    const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
    const marcas = ticks(maximo);
    const topo = marcas[marcas.length - 1] || 1;
    const margem = { esq: 52, dir: 8, cima: 8, baixo: 26 };
    const areaL = Math.max(0, largura - margem.esq - margem.dir);
    const areaA = altura - margem.cima - margem.baixo;
    const faixa = categorias.length ? areaL / categorias.length : 0;
    const GAP = 2;
    const barra = Math.max(4, Math.min(24, (faixa * 0.7 - GAP * (series.length - 1)) / Math.max(1, series.length)));
    const grupo = barra * series.length + GAP * (series.length - 1);
    const y = (v: number) => margem.cima + areaA - (v / topo) * areaA;

    return (
        <div ref={ref} className="relative w-full" style={{ height: altura }}>
            {largura > 0 && (
                <svg width={largura} height={altura} role="img" aria-label={series.map((s) => s.rotulo).join(', ')}>
                    {marcas.map((m) => (
                        <g key={m}>
                            <line x1={margem.esq} x2={largura - margem.dir} y1={y(m)} y2={y(m)} stroke="var(--grafico-grade)" strokeWidth={1} />
                            <text x={margem.esq - 8} y={y(m)} dy="0.32em" textAnchor="end" className="fill-texto-suave text-[11px] tabular-nums">
                                {formatar(m)}
                            </text>
                        </g>
                    ))}
                    {categorias.map((c, i) => {
                        const x0 = margem.esq + faixa * i + (faixa - grupo) / 2;
                        return (
                            <g key={c} opacity={ativo === null || ativo === i ? 1 : 0.45}>
                                {series.map((s, j) => {
                                    const v = s.valores[i] ?? 0;
                                    const h = Math.max(0, y(0) - y(v));
                                    const r = Math.min(4, h, barra / 2);
                                    const x = x0 + j * (barra + GAP);
                                    const top = y(v);
                                    // Ponta arredondada (4px) em cima, base reta na linha zero.
                                    const d =
                                        h <= 0
                                            ? ''
                                            : `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${y(0)} Z`;
                                    return d ? <path key={s.id} d={d} fill={s.cor} /> : null;
                                })}
                                <text x={margem.esq + faixa * i + faixa / 2} y={altura - 8} textAnchor="middle" className="fill-texto-suave text-[11px]">
                                    {c}
                                </text>
                                <rect
                                    x={margem.esq + faixa * i}
                                    y={margem.cima}
                                    width={faixa}
                                    height={areaA}
                                    fill="transparent"
                                    tabIndex={0}
                                    aria-label={`${c}: ${series.map((s) => `${s.rotulo} ${formatar(s.valores[i] ?? 0)}`).join(', ')}`}
                                    onMouseEnter={() => setAtivo(i)}
                                    onMouseLeave={() => setAtivo(null)}
                                    onFocus={() => setAtivo(i)}
                                    onBlur={() => setAtivo(null)}
                                    className="outline-none"
                                />
                            </g>
                        );
                    })}
                    <line x1={margem.esq} x2={largura - margem.dir} y1={y(0)} y2={y(0)} stroke="var(--cor-texto-suave)" strokeOpacity={0.5} strokeWidth={1} />
                </svg>
            )}
            {ativo !== null && largura > 0 && (
                <Dica
                    x={Math.min(largura - 180, Math.max(0, margem.esq + faixa * ativo + faixa / 2 - 90))}
                    titulo={categorias[ativo]}
                    itens={series.map((s) => ({ cor: s.cor, rotulo: s.rotulo, valor: formatar(s.valores[ativo] ?? 0) }))}
                />
            )}
        </div>
    );
}

function Dica({ x, titulo, itens }: { x: number; titulo: string; itens: { cor: string; rotulo: string; valor: string }[] }) {
    return (
        <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-linha bg-superficie px-3 py-2 text-xs shadow-lg"
            style={{ left: x }}
        >
            <p className="mb-1 font-semibold text-texto">{titulo}</p>
            {itens.map((i) => (
                <p key={i.rotulo} className="flex items-center gap-1.5 text-texto-suave">
                    <span className="size-2 rounded-sm" style={{ background: i.cor }} aria-hidden="true" />
                    <span className="flex-1">{i.rotulo}</span>
                    <span className="font-medium text-texto tabular-nums">{i.valor}</span>
                </p>
            ))}
        </div>
    );
}

/**
 * Barras horizontais agrupadas por categoria (ex.: cores do vidro, ou etapas do funil com uma série).
 * Valor na ponta de cada barra; tooltip por categoria.
 */
export function BarrasHorizontais({
    categorias,
    series,
    formatar,
    rotuloExtra,
}: {
    categorias: string[];
    series: Serie[];
    formatar: (v: number) => string;
    /** Texto auxiliar por categoria e série, ao lado do valor (ex.: "62%"). */
    rotuloExtra?: (serie: number, categoria: number) => string | undefined;
}) {
    const maximo = Math.max(1, ...series.flatMap((s) => s.valores));
    const [ativo, setAtivo] = useState<number | null>(null);
    return (
        <ul className="flex flex-col gap-3">
            {categorias.map((c, i) => (
                <li
                    key={c}
                    tabIndex={0}
                    onMouseEnter={() => setAtivo(i)}
                    onMouseLeave={() => setAtivo(null)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                    className={`grid grid-cols-[minmax(5.5rem,8rem)_1fr] items-center gap-3 rounded-md outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-acento ${
                        ativo !== null && ativo !== i ? 'opacity-50' : ''
                    }`}
                    aria-label={`${c}: ${series.map((s) => `${s.rotulo} ${formatar(s.valores[i] ?? 0)}`).join(', ')}`}
                >
                    <span className="truncate text-sm text-texto">{c}</span>
                    <span className="flex flex-col gap-[2px]">
                        {series.map((s, j) => {
                            const v = s.valores[i] ?? 0;
                            const extra = rotuloExtra?.(j, i);
                            return (
                                <span key={s.id} className="flex items-center gap-2">
                                    <span
                                        className="h-3.5 rounded-r-[4px]"
                                        style={{ width: `max(${v > 0 ? 2 : 0}px, calc((100% - 7rem) * ${v / maximo}))`, background: s.cor }}
                                        aria-hidden="true"
                                    />
                                    <span className="shrink-0 text-xs text-texto-suave tabular-nums">
                                        {formatar(v)}
                                        {extra && <span className="ml-1 text-texto">{extra}</span>}
                                    </span>
                                </span>
                            );
                        })}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** Indicador (stat tile): rótulo, valor e uma linha de contexto. */
export function Indicador({ rotulo, valor, contexto, destaque }: { rotulo: string; valor: string; contexto?: string; destaque?: boolean }) {
    return (
        <div className={`flex min-w-0 flex-col gap-1 rounded-xl border p-4 shadow-sm ${destaque ? 'border-acento/40 bg-acento-suave' : 'border-linha bg-superficie'}`}>
            <span className="text-sm text-texto-suave">{rotulo}</span>
            <span className={`font-semibold text-texto ${destaque ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}>{valor}</span>
            {contexto && <span className="text-xs text-texto-suave">{contexto}</span>}
        </div>
    );
}
