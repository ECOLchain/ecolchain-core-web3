import { HandCoins } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { origemRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useAtor } from '../../solana/ator';
import type { ContaDecodificada } from '../../solana/contas';
import { brl, gramasParaKg, nomeVariacao, useLotes, useMateriais, useParticipantes, useVariacoes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';
import { rotuloEstado, rotuloModo } from './comum';

const SEM_CONTA = '11111111111111111111111111111111';

type Linha = ContaDecodificada<lote.Lote>;
type Filtro = 'todas' | 'retirada' | 'transporte' | 'pagamento' | 'concluidas';

/** Em que ponto da venda o lote está, para o filtro e o destaque da situação. */
function etapa(l: lote.Lote): Exclude<Filtro, 'todas'> {
    switch (l.estado.__kind) {
        case 'Vendido':
            return 'retirada';
        case 'EmTransporte':
            return 'transporte';
        case 'Recebido':
            return 'pagamento';
        default:
            return 'concluidas';
    }
}

/** Vendas da cooperativa (ADR 0012): lotes comprados por indústrias e lotes vendidos fora da plataforma. */
export function VendasCooperativa() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.vendas')} />
            <SoPapel papel={['cooperativa', 'cleantech']} aviso={t('cooperativa.soCooperativa')}>
                <ConteudoVendas />
            </SoPapel>
        </>
    );
}

function ConteudoVendas() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { titular, assinante, vinculo } = useAtor();
    const lotes = useLotes(titular);
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const participantes = useParticipantes();
    const envio = useEnviar();
    const [filtro, setFiltro] = useState<Filtro>('todas');
    const [pagamento, setPagamento] = useState<Linha | null>(null);

    const nomeMaterial = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])), [materiais.data]);
    const nomePart = useMemo(() => {
        const mapa = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, rotuloParticipante(p.dados)]));
        return (carteira: string) => mapa.get(carteira) ?? carteira;
    }, [participantes.data]);

    // Vendido = tem comprador registrado (venda direta ou leilão) ou foi marcado como vendido fora.
    const linhas = useMemo(
        () => (lotes.data ?? []).filter((l) => l.dados.industria !== SEM_CONTA || l.dados.estado.__kind === 'VendidoFora'),
        [lotes.data],
    );
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-16' },
            {
                id: 'material',
                titulo: t('cooperativa.material'),
                valor: (l) =>
                    [nomeMaterial.get(l.dados.material) ?? String(l.dados.material), nomeVariacao(variacoes.data, l.dados.material, l.dados.variacao)]
                        .filter(Boolean)
                        .join(' · '),
            },
            { id: 'peso', titulo: t('cooperativa.pesoKg'), largura: 'w-28', numerica: true, valor: (l) => l.dados.pesoG, celula: (l) => gramasParaKg(l.dados.pesoG, idioma) },
            {
                id: 'comprador',
                titulo: t('venda.comprador'),
                valor: (l) => (l.dados.industria === SEM_CONTA ? t('venda.foraDaPlataforma') : nomePart(l.dados.industria)),
                busca: (l) => l.dados.industria,
                celula: (l) =>
                    l.dados.industria === SEM_CONTA ? <span className="text-texto-suave">{t('venda.foraDaPlataforma')}</span> : nomePart(l.dados.industria),
            },
            {
                id: 'valor',
                titulo: t('venda.valor'),
                largura: 'w-32',
                numerica: true,
                valor: (l) => l.dados.valorCentavos,
                celula: (l) => (l.dados.valorCentavos > 0n ? brl(l.dados.valorCentavos, idioma) : <span className="text-texto-suave">—</span>),
            },
            {
                id: 'retirada',
                titulo: t('venda.retirada'),
                largura: 'w-48',
                valor: (l) => (l.dados.vendaDireta ? rotuloModo(t, l.dados.modoRetirada) : l.dados.industria === SEM_CONTA ? '' : t('venda.leilao')),
                celula: (l) => (
                    <span className="text-texto-suave">
                        {l.dados.vendaDireta ? rotuloModo(t, l.dados.modoRetirada) : l.dados.industria === SEM_CONTA ? '—' : t('venda.leilao')}
                    </span>
                ),
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-52',
                valor: (l) => rotuloEstado(t, l.dados),
                celula: (l) => {
                    const pendente = etapa(l.dados) !== 'concluidas';
                    const texto =
                        l.dados.estado.__kind === 'Recebido' && l.dados.vendaDireta
                            ? t('venda.aguardandoPagamento')
                            : l.dados.estado.__kind === 'Vendido'
                              ? t('venda.etapa.retirada')
                              : rotuloEstado(t, l.dados);
                    return (
                        <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                pendente ? 'bg-kraft/15 text-kraft' : 'bg-acento-suave text-acento'
                            }`}
                        >
                            {texto}
                        </span>
                    );
                },
            },
            {
                id: 'data',
                titulo: t('venda.atualizado'),
                largura: 'w-32',
                valor: (l) => l.dados.atualizadoEm,
                celula: (l) => <span className="text-texto-suave">{new Date(Number(l.dados.atualizadoEm) * 1000).toLocaleDateString(idioma)}</span>,
            },
        ],
        [t, idioma, nomeMaterial, variacoes.data, nomePart],
    );
    const filtrar = useMemo(() => (l: Linha) => filtro === 'todas' || etapa(l.dados) === filtro, [filtro]);
    const grade = useGrade(linhas, colunas, { chave: (l) => l.endereco, ordem: { id: 'data', desc: true }, filtro: filtrar });
    const sel = grade.selecionada;
    const podeConfirmar = (l: Linha | null) => !!l && l.dados.vendaDireta && l.dados.estado.__kind === 'Recebido';

    const confirmar = async (l: Linha, comprovante: string) => {
        if (!titular) return;
        try {
            await envio.dispatchAsync([
                await lote.getCooperativaConfirmarPagamentoInstructionAsync({
                    cooperativa: titular,
                    cooperativaAssinante: assinante,
                    cooperativaCarteira: vinculo,
                    lote: l.endereco,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    comprovanteHash: await origemRef(comprovante),
                }),
            ]);
            setPagamento(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!pagamento && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('venda.pagamentoConfirmado')} />}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={filtro}
                            onChange={(v) => {
                                setFiltro(v as Filtro);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'todas', texto: t('grade.todasSituacoes') },
                                { valor: 'retirada', texto: t('venda.etapa.retirada') },
                                { valor: 'transporte', texto: t('venda.etapa.transporte') },
                                { valor: 'pagamento', texto: t('venda.etapa.pagamento') },
                                { valor: 'concluidas', texto: t('venda.etapa.concluidas') },
                            ]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                disabled={!podeConfirmar(sel)}
                                title={podeConfirmar(sel) ? undefined : t('venda.selecionePagamento')}
                                onClick={() => {
                                    envio.reset();
                                    if (sel) setPagamento(sel);
                                }}
                            >
                                <HandCoins className="size-4" /> {t('venda.confirmarPagamento')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[76rem]"
                    vazio={t('venda.vazioVendas')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => {
                        if (!podeConfirmar(l)) return;
                        envio.reset();
                        setPagamento(l);
                    }}
                />
            </CartaoGrade>
            {pagamento && (
                <DialogoPagamento
                    linha={pagamento}
                    comprador={nomePart(pagamento.dados.industria)}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPagamento(null)}
                    aoSalvar={(texto) => void confirmar(pagamento, texto)}
                />
            )}
        </div>
    );
}

/** A cooperativa confirma que recebeu o pagamento (Pix, TED, boleto): o lote vai a Reciclado. */
function DialogoPagamento({
    linha,
    comprador,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    comprador: string;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (comprovante: string) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const [comprovante, setComprovante] = useState('');
    const pronto = comprovante.trim().length > 0;
    return (
        <Dialogo
            titulo={t('venda.pagamentoTitulo', { id: linha.dados.loteId.toString() })}
            subtitulo={`${comprador} | ${brl(linha.dados.valorCentavos, idioma)}`}
            formId="form-pagamento"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('venda.confirmarPagamento')}
            iconeSalvar={HandCoins}
            aoFechar={aoFechar}
        >
            <form
                id="form-pagamento"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pronto) aoSalvar(comprovante);
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                <Campo
                    rotulo={t('venda.comprovante')}
                    required
                    autoFocus
                    value={comprovante}
                    onChange={(e) => setComprovante(e.target.value)}
                    ajuda={t('venda.comprovanteAjuda')}
                />
                <p className="text-sm text-texto-suave">{t('venda.efeitoPagamento')}</p>
            </form>
        </Dialogo>
    );
}
