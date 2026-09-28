import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Registros por página em todas as grades. */
export const POR_PAGINA = 7;

export type Coluna<T> = {
    id: string;
    titulo: string;
    /** Valor usado para ordenar e para a busca. */
    valor: (linha: T) => string | number | bigint | boolean;
    /** Conteúdo da célula; sem ele, mostra o `valor`. */
    celula?: (linha: T) => ReactNode;
    /** Texto extra que a busca também encontra (ex.: a carteira completa). */
    busca?: (linha: T) => string;
    numerica?: boolean;
    ordenavel?: boolean;
    /** Largura fixa (classe Tailwind, ex.: 'w-24'); sem ela, a coluna divide o espaço que sobra. */
    largura?: string;
};

type Ordem = { id: string; desc: boolean };

/** Minúsculas e sem acentos: "São" encontra "sao". */
const normalizar = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

const comparar = (a: unknown, b: unknown) => {
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    if (a === b) return 0;
    return (a as number) < (b as number) ? -1 : 1;
};

/**
 * Estado de uma grade: busca, ordenação, página e linha selecionada. Os dados vêm inteiros da
 * blockchain (getProgramAccounts), então filtro, ordem e paginação acontecem aqui, no navegador.
 */
export function useGrade<T>(
    linhas: readonly T[] | undefined,
    colunas: Coluna<T>[],
    opcoes: { chave: (l: T) => string; ordem?: Ordem; filtro?: (l: T) => boolean },
) {
    const { chave, filtro } = opcoes;
    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState<Ordem | null>(opcoes.ordem ?? null);
    const [pagina, setPagina] = useState(1);
    const [selecionadaId, setSelecionadaId] = useState<string | null>(null);

    const filtradas = useMemo(() => {
        const termo = normalizar(busca.trim());
        let r = (linhas ?? []).filter((l) => !filtro || filtro(l));
        if (termo) {
            r = r.filter((l) =>
                colunas.some((c) => normalizar(`${String(c.valor(l))} ${c.busca?.(l) ?? ''}`).includes(termo)),
            );
        }
        const col = ordem && colunas.find((c) => c.id === ordem.id);
        if (col) {
            r = [...r].sort((a, b) => comparar(col.valor(a), col.valor(b)) * (ordem.desc ? -1 : 1));
        }
        return r;
    }, [linhas, colunas, busca, ordem, filtro]);

    const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
    // Busca ou filtro novos podem encolher o conjunto: a página atual nunca passa da última.
    const paginaAtual = Math.min(pagina, totalPaginas);
    const visiveis = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
    // A seleção é pela chave: depois de recarregar, a linha selecionada traz os dados novos.
    const selecionada = (linhas ?? []).find((l) => chave(l) === selecionadaId) ?? null;

    return {
        colunas,
        chave,
        busca,
        buscar: (texto: string) => {
            setBusca(texto);
            setPagina(1);
        },
        ordem,
        ordenar: (id: string) => setOrdem((o) => (o?.id === id ? { id, desc: !o.desc } : { id, desc: false })),
        pagina: paginaAtual,
        irPara: (p: number) => setPagina(Math.min(Math.max(1, p), totalPaginas)),
        totalPaginas,
        total: filtradas.length,
        visiveis,
        selecionada,
        selecionar: (l: T | null) => setSelecionadaId(l ? chave(l) : null),
        /** Volta à primeira página (ao trocar um filtro externo). */
        reiniciar: () => setPagina(1),
    };
}

export type EstadoGrade<T> = ReturnType<typeof useGrade<T>>;

/** Card da listagem: régua de busca, filtros e ações acima da grade. */
export function CartaoGrade({ barra, children }: { barra: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-linha bg-superficie p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">{barra}</div>
            {children}
        </section>
    );
}

export function CampoBusca({ grade, rotulo }: { grade: { busca: string; buscar: (texto: string) => void }; rotulo: string }) {
    return (
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">{rotulo}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-suave" aria-hidden="true" />
            <input
                type="search"
                value={grade.busca}
                placeholder={rotulo}
                onChange={(e) => grade.buscar(e.target.value)}
                className="h-9 w-full rounded-lg border border-linha bg-fundo pr-3 pl-9 text-sm text-texto placeholder:text-texto-suave/80 focus:border-acento"
            />
        </label>
    );
}

/** Filtro de lista (papel, situação…) ao lado da busca. */
export function FiltroGrade({
    rotulo,
    valor,
    onChange,
    opcoes,
}: {
    rotulo: string;
    valor: string;
    onChange: (v: string) => void;
    opcoes: { valor: string; texto: string }[];
}) {
    return (
        <select
            aria-label={rotulo}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 rounded-lg border border-linha bg-fundo px-2.5 text-sm text-texto focus:border-acento"
        >
            {opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                    {o.texto}
                </option>
            ))}
        </select>
    );
}

/** Ações que agem sobre a linha selecionada, alinhadas à direita da régua. */
export function AcoesGrade({ children }: { children: ReactNode }) {
    return <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>;
}

export function Grade<T>({
    grade,
    vazio,
    carregando,
    onAbrir,
}: {
    grade: EstadoGrade<T>;
    vazio: string;
    carregando?: boolean;
    /** Enter na linha focada abre o registro (ex.: o popup de edição). */
    onAbrir?: (linha: T) => void;
}) {
    const { t } = useTranslation();
    const { colunas, visiveis, selecionada, chave, ordem } = grade;
    const selecionadaId = selecionada ? chave(selecionada) : null;

    // A linha selecionada sumiu da página (busca, filtro, troca de página): a seleção sai junto,
    // para as ações da régua não agirem sobre algo que a pessoa não está vendo.
    useEffect(() => {
        if (selecionadaId && !visiveis.some((l) => chave(l) === selecionadaId)) grade.selecionar(null);
    });

    if (carregando) {
        return (
            <p className="flex items-center justify-center gap-2 py-16 text-texto-suave">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t('admin.carregando')}
            </p>
        );
    }

    return (
        <>
            <div className="overflow-hidden rounded-lg border border-linha">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-sm">
                        <thead className="bg-barra text-barra-texto">
                            <tr>
                                {colunas.map((c) => {
                                    const ativa = ordem?.id === c.id;
                                    const ordenavel = c.ordenavel !== false;
                                    return (
                                        <th
                                            key={c.id}
                                            scope="col"
                                            aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : undefined}
                                            className={`px-3 py-2 font-medium ${c.numerica ? 'text-right' : ''} ${c.largura ?? ''}`}
                                        >
                                            {ordenavel ? (
                                                <button
                                                    type="button"
                                                    onClick={() => grade.ordenar(c.id)}
                                                    className="inline-flex items-center gap-1 rounded hover:underline focus-visible:outline-barra-texto"
                                                >
                                                    {c.titulo}
                                                    <span aria-hidden="true" className={ativa ? '' : 'opacity-0'}>
                                                        {ativa && ordem.desc ? '▼' : '▲'}
                                                    </span>
                                                </button>
                                            ) : (
                                                c.titulo
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {visiveis.length === 0 && (
                                <tr>
                                    <td colSpan={colunas.length} className="bg-superficie py-14 text-center text-texto-suave">
                                        {grade.busca ? t('grade.semResultado') : vazio}
                                    </td>
                                </tr>
                            )}
                            {visiveis.map((l, i) => {
                                const id = chave(l);
                                const ativa = id === selecionadaId;
                                return (
                                    <tr
                                        key={id}
                                        tabIndex={0}
                                        aria-selected={ativa}
                                        onClick={() => grade.selecionar(l)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                grade.selecionar(l);
                                                onAbrir?.(l);
                                            } else if (e.key === ' ') {
                                                e.preventDefault();
                                                grade.selecionar(l);
                                            }
                                        }}
                                        className={`cursor-pointer border-l-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acento ${
                                            ativa
                                                ? 'border-l-kraft bg-linha-sel'
                                                : `border-l-transparent hover:bg-linha-sel/50 ${i % 2 === 1 ? 'bg-linha-alt' : 'bg-superficie'}`
                                        }`}
                                    >
                                        {colunas.map((c) => (
                                            <td
                                                key={c.id}
                                                className={`truncate border-t border-linha px-3 py-2 text-texto ${c.numerica ? 'text-right tabular-nums' : ''}`}
                                            >
                                                {c.celula ? c.celula(l) : String(c.valor(l))}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <Paginacao grade={grade} />
        </>
    );
}

function Paginacao<T>({ grade }: { grade: EstadoGrade<T> }) {
    const { t } = useTranslation();
    const { pagina, totalPaginas, total } = grade;
    const botao =
        'flex size-8 items-center justify-center rounded-lg border border-linha bg-superficie text-texto transition-colors hover:border-texto-suave disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-linha';
    return (
        <nav aria-label={t('grade.paginacao')} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-texto-suave">
            <p>
                {t('grade.pagina', { atual: pagina, total: totalPaginas })}
                <span className="mx-2 text-linha" aria-hidden="true">
                    |
                </span>
                {t('grade.registros', { count: total })}
            </p>
            <div className="flex gap-1.5">
                <button type="button" className={botao} disabled={pagina <= 1} onClick={() => grade.irPara(1)} aria-label={t('grade.primeira')} title={t('grade.primeira')}>
                    <ChevronFirst className="size-4" />
                </button>
                <button type="button" className={botao} disabled={pagina <= 1} onClick={() => grade.irPara(pagina - 1)} aria-label={t('grade.anterior')} title={t('grade.anterior')}>
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" className={botao} disabled={pagina >= totalPaginas} onClick={() => grade.irPara(pagina + 1)} aria-label={t('grade.proxima')} title={t('grade.proxima')}>
                    <ChevronRight className="size-4" />
                </button>
                <button type="button" className={botao} disabled={pagina >= totalPaginas} onClick={() => grade.irPara(totalPaginas)} aria-label={t('grade.ultima')} title={t('grade.ultima')}>
                    <ChevronLast className="size-4" />
                </button>
            </div>
        </nav>
    );
}
