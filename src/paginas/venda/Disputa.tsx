import { useClient } from '@solana/react';
import { Crown, Gavel, ListOrdered, ShoppingCart } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useAtor } from '../../solana/ator';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { useCadastro } from '../../solana/useCadastro';
import {
    brl,
    gramasParaKg,
    nomeVariacao,
    reaisParaCentavos,
    useMateriais,
    useParticipantes,
    useLancesDoLote,
    useTodosLotes,
    useVariacoes,
} from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';
import { aVenda, emLeilao, prazoLeilao } from './comum';

type Linha = ContaDecodificada<lote.Lote>;

/**
 * Disputa (ADR 0012 e 0013): os lotes à venda de todas as cooperativas e Clean Techs, por preço fixo
 * ou em leilão. Na venda direta a indústria compra (quem paga primeiro leva); no leilão ela dá lances
 * na blockchain até o prazo, e a Administração registra a venda ao maior lance (três assinaturas). A
 * cooperativa acompanha a concorrência e os próprios lotes, e vê os lances dados nos seus leilões. Depois da venda o lote sai daqui e vai
 * para Compras (indústria) e Vendas (cooperativa).
 */
export function Disputa() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.marketplace')} />
            <SoPapel papel={['industria', 'cooperativa', 'cleantech']} aviso={t('venda.soParticipante')}>
                <ConteudoDisputa />
            </SoPapel>
        </>
    );
}

function ConteudoDisputa() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { cadastro, ator } = useCadastro();
    const [aviso, setAviso] = useState<string>();
    const ehIndustria = !!cadastro?.papeis.includes('industria');
    const ehVendedor = !!cadastro?.papeis.some((p) => p === 'cooperativa' || p === 'cleantech');
    const lotes = useTodosLotes();
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const participantes = useParticipantes();
    const [filtroMaterial, setFiltroMaterial] = useState('');
    const [filtroTipo, setFiltroTipo] = useState<'' | 'direta' | 'leilao'>('');
    const [compra, setCompra] = useState<Linha | null>(null);
    const [lance, setLance] = useState<Linha | null>(null);
    const [comprado, setComprado] = useState<string>();
    const [verLances, setVerLances] = useState<Linha | null>(null);

    const nomeMaterial = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])), [materiais.data]);
    const nomePart = useMemo(() => {
        const mapa = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, rotuloParticipante(p.dados)]));
        return (carteira: string) => mapa.get(carteira) ?? carteira;
    }, [participantes.data]);
    const material = useCallback(
        (l: lote.Lote) =>
            [nomeMaterial.get(l.material) ?? String(l.material), nomeVariacao(variacoes.data, l.material, l.variacao)].filter(Boolean).join(' · '),
        [nomeMaterial, variacoes.data],
    );
    const linhas = useMemo(() => (lotes.data ?? []).filter((l) => aVenda(l.dados) || emLeilao(l.dados)), [lotes.data]);
    const agora = BigInt(Math.floor(Date.now() / 1000));
    const encerrado = (l: lote.Lote) => emLeilao(l) && prazoLeilao(l) <= agora;
    const dataHora = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' });
    // Venda direta compra; leilão abre a orientação do lance.
    const abrir = (l: Linha) => {
        setComprado(undefined);
        setAviso(undefined);
        if (emLeilao(l.dados)) setLance(l);
        else setCompra(l);
    };
    // A cooperativa (ou Clean Tech) vê os lances dos próprios leilões.
    const meuLeilao = (l: Linha) => ehVendedor && l.dados.cooperativa === ator && emLeilao(l.dados);

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
            {
                id: 'vendedor',
                titulo: t('venda.vendedor'),
                valor: (l) => nomePart(l.dados.cooperativa),
                busca: (l) => l.dados.cooperativa,
                celula: (l) => (
                    <span className="flex flex-wrap items-center gap-2">
                        {nomePart(l.dados.cooperativa)}
                        {l.dados.cooperativa === ator && (
                            <span className="rounded-full bg-acento-suave px-2 py-0.5 text-xs font-semibold text-acento">{t('venda.seuLote')}</span>
                        )}
                    </span>
                ),
            },
            {
                id: 'tipo',
                titulo: t('venda.tipo'),
                largura: 'w-40',
                valor: (l) => (emLeilao(l.dados) ? t('venda.leilao') : t('venda.vendaDireta')),
                celula: (l) =>
                    emLeilao(l.dados) ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-kraft-suave px-2 py-0.5 text-xs font-semibold text-kraft">
                            <Gavel className="size-3.5" aria-hidden /> {t('venda.leilao')}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-acento-suave px-2 py-0.5 text-xs font-semibold text-acento">
                            <ShoppingCart className="size-3.5" aria-hidden /> {t('venda.vendaDireta')}
                        </span>
                    ),
            },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => material(l.dados) },
            {
                id: 'garrafas',
                titulo: t('material.garrafasCurto'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => l.dados.qtdGarrafas,
                celula: (l) => (l.dados.qtdGarrafas ? l.dados.qtdGarrafas.toLocaleString(idioma) : <span className="text-texto-suave">—</span>),
            },
            { id: 'peso', titulo: t('cooperativa.pesoKg'), largura: 'w-28', numerica: true, valor: (l) => l.dados.pesoG, celula: (l) => gramasParaKg(l.dados.pesoG, idioma) },
            {
                id: 'preco',
                titulo: t('venda.valor'),
                largura: 'w-32',
                numerica: true,
                valor: (l) => l.dados.precoMinimoCentavos,
                celula: (l) => (
                    <span className="flex flex-col">
                        <span className="font-semibold text-texto">{brl(l.dados.precoMinimoCentavos, idioma)}</span>
                        {emLeilao(l.dados) && <span className="text-xs text-texto-suave">{t('venda.lanceMinimo')}</span>}
                    </span>
                ),
            },
            {
                id: 'maiorLance',
                titulo: t('venda.maiorLance'),
                largura: 'w-40',
                numerica: true,
                valor: (l) => l.dados.maiorLanceCentavos,
                celula: (l) =>
                    !emLeilao(l.dados) ? (
                        <span className="text-texto-suave">—</span>
                    ) : l.dados.qtdLances === 0 ? (
                        <span className="text-texto-suave">{t('venda.semLances')}</span>
                    ) : (
                        <span className="flex flex-col items-end">
                            <span className="font-semibold text-texto">{brl(l.dados.maiorLanceCentavos, idioma)}</span>
                            {l.dados.lanceLider === ator ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-acento">
                                    <Crown className="size-3.5" aria-hidden /> {t('venda.voceLidera')}
                                </span>
                            ) : (
                                <span className="text-xs text-texto-suave">{t('venda.qtdLances', { count: l.dados.qtdLances })}</span>
                            )}
                        </span>
                    ),
            },
            {
                id: 'porKg',
                titulo: t('venda.porKg'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => (l.dados.pesoG > 0n ? Number(l.dados.precoMinimoCentavos) / Number(l.dados.pesoG) : 0),
                celula: (l) =>
                    l.dados.pesoG > 0n ? (
                        <span className="text-texto-suave">{brl((l.dados.precoMinimoCentavos * 1000n) / l.dados.pesoG, idioma)}</span>
                    ) : (
                        '—'
                    ),
            },
            {
                id: 'prazo',
                titulo: t('venda.prazoLeilao'),
                largura: 'w-36',
                valor: (l) => prazoLeilao(l.dados),
                celula: (l) =>
                    !emLeilao(l.dados) ? (
                        <span className="text-texto-suave">—</span>
                    ) : encerrado(l.dados) ? (
                        <span className="text-texto-suave">{t('venda.leilaoEncerrado')}</span>
                    ) : (
                        <span className="text-texto">{dataHora(prazoLeilao(l.dados))}</span>
                    ),
            },
            {
                id: 'desde',
                titulo: t('venda.desde'),
                largura: 'w-32',
                valor: (l) => l.dados.atualizadoEm,
                celula: (l) => <span className="text-texto-suave">{new Date(Number(l.dados.atualizadoEm) * 1000).toLocaleDateString(idioma)}</span>,
            },
        ],
        [t, idioma, nomePart, ator, material],
    );
    const filtro = useMemo(
        () => (l: Linha) =>
            (filtroMaterial === '' || String(l.dados.material) === filtroMaterial) &&
            (filtroTipo === '' || (filtroTipo === 'leilao') === emLeilao(l.dados)),
        [filtroMaterial, filtroTipo],
    );
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'desde', desc: true }, filtro });
    const sel = grade.selecionada;

    return (
        <div className="flex flex-col gap-4">
            {aviso && !lance && (
                <p role="status" className="rounded-lg bg-acento-suave p-3 text-sm text-acento">
                    {aviso}
                </p>
            )}
            {comprado && !compra && (
                <p role="status" className="rounded-lg bg-acento-suave p-3 text-sm text-acento">
                    {comprado}{' '}
                    <Link to="/compras" className="font-semibold underline underline-offset-4">
                        {t('venda.verCompras')}
                    </Link>
                </p>
            )}
            <p className="max-w-3xl text-sm text-texto-suave">{t(ehIndustria ? 'venda.disputaIndustria' : 'venda.disputaCooperativa')}</p>
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('cooperativa.material')}
                            valor={filtroMaterial}
                            onChange={(v) => {
                                setFiltroMaterial(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('grade.todosMateriais') },
                                ...(materiais.data ?? []).map((m) => ({ valor: String(m.dados.codigo), texto: m.dados.nome })),
                            ]}
                        />
                        <FiltroGrade
                            rotulo={t('venda.tipo')}
                            valor={filtroTipo}
                            onChange={(v) => {
                                setFiltroTipo(v as typeof filtroTipo);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('venda.todosTipos') },
                                { valor: 'direta', texto: t('venda.vendaDireta') },
                                { valor: 'leilao', texto: t('venda.leilao') },
                            ]}
                        />
                        {ehVendedor && !ehIndustria && (
                            <AcoesGrade>
                                <Botao
                                    compacto
                                    disabled={!sel || !meuLeilao(sel)}
                                    title={sel && meuLeilao(sel) ? undefined : t('venda.selecioneLeilaoProprio')}
                                    onClick={() => sel && setVerLances(sel)}
                                >
                                    <ListOrdered className="size-4" /> {t('venda.verLances')}
                                </Botao>
                            </AcoesGrade>
                        )}
                        {ehIndustria && (
                            <AcoesGrade>
                                {sel && emLeilao(sel.dados) ? (
                                    <Botao compacto onClick={() => abrir(sel)}>
                                        <Gavel className="size-4" /> {t('venda.darLance')}
                                    </Botao>
                                ) : (
                                    <Botao compacto disabled={!sel} title={sel ? undefined : t('venda.selecioneCompra')} onClick={() => sel && abrir(sel)}>
                                        <ShoppingCart className="size-4" /> {t('venda.comprar')}
                                    </Botao>
                                )}
                            </AcoesGrade>
                        )}
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[86rem]"
                    vazio={t('venda.vazioDisputa')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={ehIndustria ? abrir : ehVendedor ? (l) => meuLeilao(l) && setVerLances(l) : undefined}
                />
            </CartaoGrade>

            {compra && (
                <DialogoCompra
                    linha={compra}
                    descricao={`${material(compra.dados)} | ${gramasParaKg(compra.dados.pesoG, idioma)} kg | ${nomePart(compra.dados.cooperativa)}`}
                    aoFechar={() => setCompra(null)}
                    aoConcluir={() => {
                        setComprado(t('venda.comprado', { id: compra.dados.loteId.toString() }));
                        setCompra(null);
                        lotes.refresh();
                    }}
                />
            )}

            {verLances && (
                <DialogoLances
                    linha={verLances}
                    descricao={`${material(verLances.dados)} | ${gramasParaKg(verLances.dados.pesoG, idioma)} kg`}
                    nomePart={nomePart}
                    aoFechar={() => setVerLances(null)}
                />
            )}

            {lance && (
                <DialogoLance
                    linha={lance}
                    descricao={`${material(lance.dados)} | ${gramasParaKg(lance.dados.pesoG, idioma)} kg | ${nomePart(lance.dados.cooperativa)}`}
                    lider={lance.dados.qtdLances > 0 ? nomePart(lance.dados.lanceLider) : undefined}
                    podeDar={ehIndustria}
                    aoFechar={() => setLance(null)}
                    aoConcluir={(valor) => {
                        setAviso(t('venda.lanceRegistrado', { id: lance.dados.loteId.toString(), valor: brl(valor, idioma) }));
                        setLance(null);
                        lotes.refresh();
                    }}
                />
            )}
        </div>
    );
}

/** Valor (o preço pedido ou mais) e quem retira: um transportador cadastrado ou a própria indústria. */
function DialogoCompra({
    linha,
    descricao,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    descricao: string;
    aoFechar: () => void;
    aoConcluir: () => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { titular, assinante, vinculo } = useAtor();
    const envio = useEnviar();
    const preco = linha.dados.precoMinimoCentavos;
    const [valor, setValor] = useState((Number(preco) / 100).toLocaleString(idioma, { minimumFractionDigits: 2 }));
    const [modo, setModo] = useState<lote.ModoRetirada | null>(null);
    const centavos = reaisParaCentavos(valor);
    const abaixo = centavos !== null && centavos < preco;
    const pronto = centavos !== null && !abaixo && modo !== null && !!titular;

    const comprar = async () => {
        if (!pronto || !titular || modo === null || centavos === null) return;
        try {
            await envio.dispatchAsync([
                await lote.getIndustriaComprarLoteInstructionAsync({
                    industria: titular,
                    industriaAssinante: assinante,
                    industriaCarteira: vinculo,
                    industriaPart: await pLote.participante(titular),
                    cooperativaPart: await pLote.participante(linha.dados.cooperativa),
                    lote: linha.endereco,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    valorCentavos: centavos,
                    modoRetirada: modo,
                }),
            ]);
            aoConcluir();
        } catch {
            // o erro fica em envio.error
        }
    };

    const opcao = (valorModo: lote.ModoRetirada, titulo: string, ajuda: string) => (
        <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                modo === valorModo ? 'border-acento bg-acento-suave/40' : 'border-linha'
            }`}
        >
            <input type="radio" name="modo-retirada" className="mt-1 size-4 accent-acento" checked={modo === valorModo} onChange={() => setModo(valorModo)} />
            <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-texto">{titulo}</span>
                <span className="text-sm text-texto-suave">{ajuda}</span>
            </span>
        </label>
    );

    return (
        <Dialogo
            titulo={t('venda.comprarTitulo', { id: linha.dados.loteId.toString() })}
            subtitulo={descricao}
            formId="form-compra"
            salvando={envio.isRunning}
            podeSalvar={pronto}
            rotuloSalvar={t('venda.confirmarCompra')}
            iconeSalvar={ShoppingCart}
            aoFechar={aoFechar}
        >
            <form
                id="form-compra"
                onSubmit={(e) => {
                    e.preventDefault();
                    void comprar();
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={envio.error} sucesso="" />
                <Campo
                    rotulo={t('venda.valorCompra')}
                    inputMode="decimal"
                    required
                    autoFocus
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    aria-invalid={abaixo || (valor !== '' && centavos === null)}
                    ajuda={abaixo ? t('venda.abaixoDoPreco', { preco: brl(preco, idioma) }) : t('venda.valorCompraAjuda', { preco: brl(preco, idioma) })}
                />
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-semibold text-texto">{t('venda.modoRetirada')}</legend>
                    {opcao(lote.ModoRetirada.Terceiro, t('venda.modo.terceiro'), t('venda.modo.terceiroAjuda'))}
                    {opcao(lote.ModoRetirada.Propria, t('venda.modo.propria'), t('venda.modo.propriaAjuda'))}
                </fieldset>
                <p className="text-sm text-texto-suave">{t('venda.efeitoCompra')}</p>
            </form>
        </Dialogo>
    );
}

/**
 * Lances de um leilão da cooperativa (ADR 0013): uma conta `Lance` por indústria na rodada atual, do maior
 * para o menor. Só leitura: a venda ao líder é registrada pela Administração depois do prazo.
 */
function DialogoLances({
    linha,
    descricao,
    nomePart,
    aoFechar,
}: {
    linha: Linha;
    descricao: string;
    nomePart: (carteira: string) => string;
    aoFechar: () => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const l = linha.dados;
    const prazo = prazoLeilao(l);
    const lances = useLancesDoLote(linha.endereco, prazo);
    const encerrado = prazo <= BigInt(Math.floor(Date.now() / 1000));
    const dataHora = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' });
    const lista = lances.data ?? [];

    return (
        <Dialogo titulo={t('venda.lancesTitulo', { id: l.loteId.toString() })} subtitulo={descricao} largura="lg" aoFechar={aoFechar}>
            <div className="flex flex-col gap-4 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-texto-suave">{t('venda.lanceMinimo')}</dt>
                    <dd className="text-texto">{brl(l.precoMinimoCentavos, idioma)}</dd>
                    <dt className="text-texto-suave">{t('venda.prazoLeilao')}</dt>
                    <dd className="text-texto">{encerrado ? t('venda.leilaoEncerrado') : dataHora(prazo)}</dd>
                </dl>
                <p className="text-texto-suave">{t('venda.lancesAjuda')}</p>
                <Resultado erro={lances.error} sucesso="" />
                {!lances.data && !lances.error ? (
                    <p className="text-texto-suave">{t('venda.lancesCarregando')}</p>
                ) : lista.length === 0 ? (
                    <p className="rounded-lg bg-superficie-2 p-3 text-texto-suave">{t('venda.lancesVazio')}</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-linha">
                        <table className="w-full min-w-[32rem] text-left">
                            <thead className="bg-superficie-2 text-xs uppercase tracking-wide text-texto-suave">
                                <tr>
                                    <th className="px-3 py-2 text-right">{t('venda.posicao')}</th>
                                    <th className="px-3 py-2">{t('venda.industria')}</th>
                                    <th className="px-3 py-2 text-right">{t('venda.valorLance')}</th>
                                    <th className="px-3 py-2">{t('venda.ultimoLance')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map((c, i) => {
                                    const lider = c.dados.industria === l.lanceLider;
                                    return (
                                        <tr key={c.endereco} className="border-t border-linha">
                                            <td className="px-3 py-2 text-right tabular-nums text-texto-suave">{i + 1}º</td>
                                            <td className="px-3 py-2 text-texto">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    {nomePart(c.dados.industria)}
                                                    {lider && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-acento">
                                                            <Crown className="size-3.5" aria-hidden /> {t('venda.lider')}
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-texto">{brl(c.dados.valorCentavos, idioma)}</td>
                                            <td className="px-3 py-2 text-texto-suave">{dataHora(c.dados.atualizadoEm)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Dialogo>
    );
}

/**
 * Lance no leilão (ADR 0013): a indústria informa o valor (o mínimo ou mais, e acima do maior lance) e
 * assina. A primeira vez cria a conta do lance; depois, aumenta o mesmo lance.
 */
function DialogoLance({
    linha,
    descricao,
    lider,
    podeDar,
    aoFechar,
    aoConcluir,
}: {
    linha: Linha;
    descricao: string;
    /** Nome da indústria que lidera; ausente sem lances. */
    lider?: string;
    podeDar: boolean;
    aoFechar: () => void;
    aoConcluir: (valor: bigint) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { titular, assinante, vinculo } = useAtor();
    const envio = useEnviar();
    const l = linha.dados;
    const prazo = prazoLeilao(l);
    const encerrado = prazo <= BigInt(Math.floor(Date.now() / 1000));
    const lidero = l.qtdLances > 0 && l.lanceLider === titular;
    // Menor lance aceito: o mínimo, ou um real acima do maior lance.
    const piso = l.qtdLances > 0 ? l.maiorLanceCentavos + 100n : l.precoMinimoCentavos;
    const [valor, setValor] = useState((Number(piso) / 100).toLocaleString(idioma, { minimumFractionDigits: 2 }));
    const centavos = reaisParaCentavos(valor);
    const abaixoMinimo = centavos !== null && centavos < l.precoMinimoCentavos;
    const naoSupera = centavos !== null && l.qtdLances > 0 && centavos <= l.maiorLanceCentavos;
    const pronto = podeDar && !encerrado && centavos !== null && !abaixoMinimo && !naoSupera && !!titular;
    const dataHora = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' });

    const darLance = async () => {
        if (!pronto || !titular || centavos === null) return;
        try {
            const contaLance = await pLote.lance(linha.endereco, titular);
            const comum = {
                industria: titular,
                industriaAssinante: assinante,
                industriaCarteira: vinculo,
                industriaPart: await pLote.participante(titular),
                lote: linha.endereco,
                lance: contaLance,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                valorCentavos: centavos,
            };
            // A conta do lance fica de rodadas anteriores até ser fechada: aí o lance é "aumentado".
            const existe = (await lote.fetchMaybeLance(client.rpc, contaLance)).exists;
            await envio.dispatchAsync([
                existe
                    ? await lote.getIndustriaAumentarLanceInstructionAsync(comum)
                    : await lote.getIndustriaDarLanceInstructionAsync({ ...comum, payer: client.payer }),
            ]);
            aoConcluir(centavos);
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <Dialogo
            titulo={t('venda.lanceTitulo', { id: l.loteId.toString() })}
            subtitulo={descricao}
            formId={podeDar && !encerrado ? 'form-lance' : undefined}
            salvando={envio.isRunning}
            podeSalvar={pronto}
            rotuloSalvar={t('venda.assinarLance')}
            iconeSalvar={Gavel}
            aoFechar={aoFechar}
        >
            <div className="flex flex-col gap-4 text-sm">
                <Resultado erro={envio.error} sucesso="" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="text-texto-suave">{t('venda.lanceMinimo')}</dt>
                    <dd className="text-texto">{brl(l.precoMinimoCentavos, idioma)}</dd>
                    <dt className="text-texto-suave">{t('venda.maiorLance')}</dt>
                    <dd className="font-semibold text-texto">
                        {l.qtdLances === 0 ? t('venda.semLances') : `${brl(l.maiorLanceCentavos, idioma)} — ${lidero ? t('venda.voce') : lider}`}
                    </dd>
                    <dt className="text-texto-suave">{t('venda.prazoLeilao')}</dt>
                    <dd className="text-texto">{encerrado ? t('venda.leilaoEncerrado') : dataHora(prazo)}</dd>
                </dl>
                {encerrado ? (
                    <p className="rounded-lg bg-superficie-2 p-3 text-texto-suave">
                        {lidero ? t('venda.lanceVenceu') : l.qtdLances > 0 ? t('venda.lanceEncerrado') : t('venda.lanceEncerradoSemLances')}
                    </p>
                ) : !podeDar ? (
                    <p className="text-texto-suave">{t('venda.lanceSoIndustria')}</p>
                ) : (
                    <form
                        id="form-lance"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void darLance();
                        }}
                        className="flex flex-col gap-3"
                    >
                        {lidero && <p className="font-semibold text-acento">{t('venda.voceLideraAjuda')}</p>}
                        <Campo
                            rotulo={t('venda.seuLance')}
                            inputMode="decimal"
                            required
                            autoFocus
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            aria-invalid={abaixoMinimo || naoSupera || (valor !== '' && centavos === null)}
                            ajuda={
                                abaixoMinimo
                                    ? t('venda.abaixoDoMinimoLance', { minimo: brl(l.precoMinimoCentavos, idioma) })
                                    : naoSupera
                                      ? t('venda.lanceNaoSupera', { maior: brl(l.maiorLanceCentavos, idioma) })
                                      : t('venda.lanceAjuda')
                            }
                        />
                        <p className="text-texto-suave">{t('venda.lanceDepois')}</p>
                    </form>
                )}
            </div>
        </Dialogo>
    );
}
