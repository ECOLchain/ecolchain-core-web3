import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import {
    BarrasHorizontais,
    CartaoGrafico,
    ColunasAgrupadas,
    corDaSerie,
    Indicador,
    type Serie,
    TabelaGrafico,
} from '../../componentes/graficos';
import { TituloPagina } from '../../componentes/pagina';
import { Carregando } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useCadastro } from '../../solana/useCadastro';
import { useColetasImportador, useDistribuicoes } from '../../solana/useDados';
import { SoPapel } from '../admin/comum';
import { useRotuloMaterial } from './Operacoes';

/** Meses mostrados no gráfico mensal (o atual e os anteriores). */
const MESES = 6;

export function PainelImportador() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.painelImportador')} />
            <SoPapel papel="importador" aviso={t('importador.soImportador')}>
                <ConteudoPainel />
            </SoPapel>
        </>
    );
}

const chaveMes = (unix: bigint) => {
    const d = new Date(Number(unix) * 1000);
    return d.getFullYear() * 12 + d.getMonth();
};

function ConteudoPainel() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { ator } = useCadastro();
    const distribuicoes = useDistribuicoes(ator);
    const coletas = useColetasImportador(ator);
    const rotuloMaterial = useRotuloMaterial();

    const numero = useMemo(() => new Intl.NumberFormat(idioma), [idioma]);
    const compacto = useMemo(() => new Intl.NumberFormat(idioma, { notation: 'compact', maximumFractionDigits: 1 }), [idioma]);
    const pct = (parte: number, todo: number) =>
        todo > 0 ? (parte / todo).toLocaleString(idioma, { style: 'percent', maximumFractionDigits: 1 }) : '—';

    const dados = useMemo(() => {
        const ds = distribuicoes.data ?? [];
        const cs = coletas.data ?? [];
        const soma = (lista: { dados: { qtdGarrafas: number } }[]) => lista.reduce((a, x) => a + x.dados.qtdGarrafas, 0);
        const entregues = cs.filter((c) => c.dados.estado === lote.EstadoColeta.Entregue || c.dados.estado === lote.EstadoColeta.Reciclada);
        const recicladas = cs.filter((c) => c.dados.estado === lote.EstadoColeta.Reciclada);
        const aguardandoEnvio = cs.filter((c) => c.dados.estado === lote.EstadoColeta.Coletada).length;
        const emEntrega = cs.filter((c) => c.dados.estado === lote.EstadoColeta.EmEntrega).length;
        const aguardandoNf = cs.filter((c) => c.dados.estado === lote.EstadoColeta.Entregue).length;

        // Últimos meses: distribuídas pela data da NF/DI; coletadas e recicladas pela data da coleta.
        const agora = new Date();
        const ultimo = agora.getFullYear() * 12 + agora.getMonth();
        const meses = Array.from({ length: MESES }, (_, i) => ultimo - (MESES - 1 - i));
        const porMes = (lista: { dados: { qtdGarrafas: number } }[], data: (x: never) => bigint) =>
            meses.map((m) => lista.filter((x) => chaveMes(data(x as never)) === m).reduce((a, x) => a + x.dados.qtdGarrafas, 0));
        const nomesMeses = meses.map((m) =>
            new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString(idioma, { month: 'short', year: '2-digit' }),
        );

        // Por material e cor (a cor segue a categoria; as séries são as etapas).
        const chaves = [...new Set([...ds, ...cs].map((x) => `${x.dados.material}:${x.dados.variacao}`))].sort();
        const porCor = (lista: { dados: { material: number; variacao: number; qtdGarrafas: number } }[]) =>
            chaves.map((k) => lista.filter((x) => `${x.dados.material}:${x.dados.variacao}` === k).reduce((a, x) => a + x.dados.qtdGarrafas, 0));

        return {
            distribuidas: soma(ds),
            coletadas: soma(cs),
            entregues: soma(entregues),
            recicladas: soma(recicladas),
            aguardandoEnvio,
            emEntrega,
            aguardandoNf,
            nomesMeses,
            mensal: {
                distribuidas: porMes(ds, (x: (typeof ds)[number]) => x.dados.emitidoEm),
                coletadas: porMes(cs, (x: (typeof cs)[number]) => x.dados.coletadoEm),
                recicladas: porMes(recicladas, (x: (typeof cs)[number]) => x.dados.coletadoEm),
            },
            cores: chaves.map((k) => {
                const [m, v] = k.split(':').map(Number);
                return rotuloMaterial(m, v);
            }),
            porCor: { distribuidas: porCor(ds), coletadas: porCor(cs), recicladas: porCor(recicladas) },
        };
    }, [distribuicoes.data, coletas.data, idioma, rotuloMaterial]);

    if ((!distribuicoes.data || !coletas.data) && (distribuicoes.status === 'fetching' || coletas.status === 'fetching')) return <Carregando />;

    const rotulos = {
        distribuidas: t('importador.painel.distribuidas'),
        coletadas: t('importador.painel.coletadas'),
        entregues: t('importador.painel.entregues'),
        recicladas: t('importador.painel.recicladas'),
    };
    const seriesEtapas = (valores: { distribuidas: number[]; coletadas: number[]; recicladas: number[] }): Serie[] => [
        { id: 'distribuidas', rotulo: rotulos.distribuidas, cor: corDaSerie(0), valores: valores.distribuidas },
        { id: 'coletadas', rotulo: rotulos.coletadas, cor: corDaSerie(1), valores: valores.coletadas },
        { id: 'recicladas', rotulo: rotulos.recicladas, cor: corDaSerie(2), valores: valores.recicladas },
    ];
    const mensal = seriesEtapas(dados.mensal);
    const porCor = seriesEtapas(dados.porCor);
    const funil = [dados.distribuidas, dados.coletadas, dados.entregues, dados.recicladas];
    const nomesFunil = [rotulos.distribuidas, rotulos.coletadas, rotulos.entregues, rotulos.recicladas];
    const tabelaSeries = (categorias: string[], series: Serie[]) => (
        <TabelaGrafico
            cabecalho={['', ...series.map((s) => s.rotulo)]}
            linhas={categorias.map((c, i) => [c, ...series.map((s) => numero.format(s.valores[i] ?? 0))])}
        />
    );

    if (dados.distribuidas === 0 && dados.coletadas === 0) {
        return <p className="max-w-2xl rounded-xl border border-dashed border-linha p-6 text-texto-suave">{t('importador.painel.vazio')}</p>;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="sm:col-span-2 lg:col-span-1 lg:row-span-1">
                    <Indicador
                        destaque
                        rotulo={t('importador.painel.taxa')}
                        valor={pct(dados.recicladas, dados.distribuidas)}
                        contexto={t('importador.painel.taxaContexto')}
                    />
                </div>
                <Indicador rotulo={rotulos.distribuidas} valor={compacto.format(dados.distribuidas)} contexto={t('importador.painel.garrafas')} />
                <Indicador
                    rotulo={rotulos.coletadas}
                    valor={compacto.format(dados.coletadas)}
                    contexto={t('importador.painel.doDistribuido', { pct: pct(dados.coletadas, dados.distribuidas) })}
                />
                <Indicador
                    rotulo={rotulos.entregues}
                    valor={compacto.format(dados.entregues)}
                    contexto={t('importador.painel.pendentes', { envio: dados.aguardandoEnvio, caminho: dados.emEntrega })}
                />
                <Indicador
                    rotulo={rotulos.recicladas}
                    valor={compacto.format(dados.recicladas)}
                    contexto={t('importador.painel.aguardandoNf', { n: dados.aguardandoNf })}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
                <CartaoGrafico
                    titulo={t('importador.painel.porMes')}
                    subtitulo={t('importador.painel.porMesAjuda')}
                    series={mensal}
                    tabela={tabelaSeries(dados.nomesMeses, mensal)}
                >
                    <ColunasAgrupadas categorias={dados.nomesMeses} series={mensal} formatar={(v) => compacto.format(v)} />
                </CartaoGrafico>
                <CartaoGrafico
                    titulo={t('importador.painel.funil')}
                    subtitulo={t('importador.painel.funilAjuda')}
                    tabela={
                        <TabelaGrafico
                            cabecalho={['', t('material.garrafasCurto'), t('importador.painel.doDistribuidoCurto')]}
                            linhas={nomesFunil.map((n, i) => [n, numero.format(funil[i]), pct(funil[i], dados.distribuidas)])}
                        />
                    }
                >
                    <BarrasHorizontais
                        categorias={nomesFunil}
                        series={[{ id: 'funil', rotulo: t('material.garrafasCurto'), cor: corDaSerie(0), valores: funil }]}
                        formatar={(v) => numero.format(v)}
                        rotuloExtra={(_, i) => (i > 0 ? pct(funil[i], dados.distribuidas) : undefined)}
                    />
                </CartaoGrafico>
            </div>

            <CartaoGrafico
                titulo={t('importador.painel.porCor')}
                subtitulo={t('importador.painel.porCorAjuda')}
                series={porCor}
                tabela={tabelaSeries(dados.cores, porCor)}
            >
                <BarrasHorizontais
                    categorias={dados.cores}
                    series={porCor}
                    formatar={(v) => numero.format(v)}
                    rotuloExtra={(s, i) => (s === 2 ? pct(dados.porCor.recicladas[i], dados.porCor.distribuidas[i]) : undefined)}
                />
            </CartaoGrafico>
        </div>
    );
}
