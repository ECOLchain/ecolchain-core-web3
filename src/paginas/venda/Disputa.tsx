import { ShoppingCart } from 'lucide-react';
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
import type { ContaDecodificada } from '../../solana/contas';
import { useCadastro } from '../../solana/useCadastro';
import {
    brl,
    gramasParaKg,
    nomeVariacao,
    reaisParaCentavos,
    useMateriais,
    useParticipantes,
    useTodosLotes,
    useVariacoes,
} from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';
import { aVenda } from './comum';

type Linha = ContaDecodificada<lote.Lote>;

/**
 * Disputa (ADR 0012): os lotes à venda por preço fixo de todas as cooperativas e Clean Techs. A
 * indústria compra (quem paga primeiro leva); a cooperativa acompanha a concorrência e os próprios lotes.
 * Depois da compra o lote sai daqui e vai para Compras (indústria) e Vendas (cooperativa).
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
    const ehIndustria = !!cadastro?.papeis.includes('industria');
    const lotes = useTodosLotes();
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const participantes = useParticipantes();
    const [filtroMaterial, setFiltroMaterial] = useState('');
    const [compra, setCompra] = useState<Linha | null>(null);
    const [comprado, setComprado] = useState<string>();

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
    const linhas = useMemo(() => (lotes.data ?? []).filter((l) => aVenda(l.dados)), [lotes.data]);

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
                celula: (l) => <span className="font-semibold text-texto">{brl(l.dados.precoMinimoCentavos, idioma)}</span>,
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
                id: 'desde',
                titulo: t('venda.desde'),
                largura: 'w-32',
                valor: (l) => l.dados.atualizadoEm,
                celula: (l) => <span className="text-texto-suave">{new Date(Number(l.dados.atualizadoEm) * 1000).toLocaleDateString(idioma)}</span>,
            },
        ],
        [t, idioma, nomePart, ator, material],
    );
    const filtro = useMemo(() => (l: Linha) => filtroMaterial === '' || String(l.dados.material) === filtroMaterial, [filtroMaterial]);
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'desde', desc: true }, filtro });
    const sel = grade.selecionada;

    return (
        <div className="flex flex-col gap-4">
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
                        {ehIndustria && (
                            <AcoesGrade>
                                <Botao
                                    compacto
                                    disabled={!sel}
                                    title={sel ? undefined : t('venda.selecioneCompra')}
                                    onClick={() => {
                                        setComprado(undefined);
                                        if (sel) setCompra(sel);
                                    }}
                                >
                                    <ShoppingCart className="size-4" /> {t('venda.comprar')}
                                </Botao>
                            </AcoesGrade>
                        )}
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[60rem]"
                    vazio={t('venda.vazioDisputa')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={ehIndustria ? (l) => setCompra(l) : undefined}
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
