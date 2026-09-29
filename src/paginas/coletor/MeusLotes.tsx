import { type Address, address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Route } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { coletorRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { usePreferencias } from '../../preferencias/Preferencias';
import type { AppClient } from '../../solana/cliente';
import { type ContaDecodificada, listarContas } from '../../solana/contas';
import { useCadastro } from '../../solana/useCadastro';
import { gramasParaKg, useMateriais, useParticipantes } from '../../solana/useDados';
import { rotuloParticipante, SoPapel } from '../admin/comum';

/** Endereço "vazio" (Pubkey::default): lote de origem ainda sem lote de venda. */
const SEM_LOTE = '11111111111111111111111111111111';
/** `Entrega.origem_ref` (depois do discriminador, da cooperativa e do id). */
const OFFSET_ORIGEM_REF = 8 + 32 + 8;

type Linha = ContaDecodificada<lote.Entrega> & { venda?: lote.Lote };

export function MeusLotes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.meusLotes')} />
            <SoPapel papel="coletor" aviso={t('coletor.soColetor')}>
                <ConteudoMeusLotes />
            </SoPapel>
        </>
    );
}

/**
 * Lotes de origem do coletor: as entregas cujo `origem_ref` é o hash da carteira dele, em qualquer
 * cooperativa, com o lote de venda em que cada uma entrou.
 */
function useMeusLotes(carteira: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(async (): Promise<Linha[]> => {
        const entregas = await listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.ENTREGA_DISCRIMINATOR, lote.getEntregaDecoder(), undefined, [
            { offset: OFFSET_ORIGEM_REF, bytes: await coletorRef(carteira!) },
        ]);
        const doColetor = entregas.filter((e) => e.dados.origem === lote.OrigemEntrega.Coletor);
        const enderecos = [...new Set(doColetor.map((e) => e.dados.lote).filter((l) => l !== SEM_LOTE))];
        const vendas = new Map<string, lote.Lote>();
        // getMultipleAccounts aceita até 100 contas por chamada.
        for (let i = 0; i < enderecos.length; i += 100) {
            const contas = await lote.fetchAllMaybeLote(client.rpc, enderecos.slice(i, i + 100));
            for (const c of contas) if (c.exists) vendas.set(c.address, c.data);
        }
        return doColetor.map((e) => ({ ...e, venda: vendas.get(e.dados.lote) }));
    }, [client, carteira]);
    return useRequest(carteira ? fonte : null);
}

function ConteudoMeusLotes() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { carteira } = useCadastro();
    const meus = useMeusLotes(carteira ? address(carteira) : undefined);
    const materiais = useMateriais();
    const participantes = useParticipantes();
    const [filtroMaterial, setFiltroMaterial] = useState('');
    const [filtroSituacao, setFiltroSituacao] = useState('');

    const nomeMaterial = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])), [materiais.data]);
    const cadastro = useMemo(() => new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados])), [participantes.data]);
    /** "Aguardando lote de venda" ou o estado do lote de venda. */
    const situacao = useCallback(
        (l: Linha) => (l.venda ? t(`estadoLote.${l.venda.estado.__kind}`) : t('coletor.aguardando')),
        [t],
    );
    const situacoes = useMemo(() => [...new Set((meus.data ?? []).map(situacao))].sort(), [meus.data, situacao]);

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.entregaId, numerica: true, largura: 'w-16' },
            {
                id: 'data',
                titulo: t('cooperativa.data'),
                largura: 'w-40',
                valor: (l) => l.dados.tsPesagem,
                celula: (l) => (
                    <span className="text-texto-suave">
                        {new Date(Number(l.dados.tsPesagem) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                ),
            },
            {
                id: 'cooperativa',
                titulo: t('trilha.cooperativa'),
                valor: (l) => {
                    const c = cadastro.get(l.dados.cooperativa);
                    return c ? rotuloParticipante(c) : l.dados.cooperativa;
                },
                busca: (l) => l.dados.cooperativa,
            },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => nomeMaterial.get(l.dados.material) ?? String(l.dados.material) },
            {
                id: 'peso',
                titulo: t('cooperativa.pesoKg'),
                largura: 'w-28',
                valor: (l) => l.dados.pesoG,
                celula: (l) => gramasParaKg(l.dados.pesoG, idioma),
                numerica: true,
            },
            {
                id: 'venda',
                titulo: t('trilha.loteVenda'),
                largura: 'w-32',
                valor: (l) => l.venda?.loteId ?? -1n,
                celula: (l) => (l.venda ? `#${l.venda.loteId}` : '—'),
                numerica: true,
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-44',
                valor: situacao,
                celula: (l) => (
                    <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            l.venda ? 'bg-acento-suave text-acento' : 'bg-superficie-2 text-texto-suave'
                        }`}
                    >
                        {situacao(l)}
                    </span>
                ),
            },
            {
                id: 'trilha',
                titulo: '',
                largura: 'w-24',
                ordenavel: false,
                valor: () => '',
                celula: (l) => (
                    <Link
                        to={`/explorar?q=${l.endereco}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-acento underline-offset-4 hover:underline"
                    >
                        <Route className="size-3.5" aria-hidden="true" />
                        {t('coletor.trilha')}
                    </Link>
                ),
            },
        ],
        [t, idioma, cadastro, nomeMaterial, situacao],
    );
    const filtro = useMemo(
        () => (l: Linha) =>
            (filtroMaterial === '' || String(l.dados.material) === filtroMaterial) && (filtroSituacao === '' || situacao(l) === filtroSituacao),
        [filtroMaterial, filtroSituacao, situacao],
    );
    const grade = useGrade(meus.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'data', desc: true }, filtro });
    const totalG = (meus.data ?? []).reduce((s, l) => s + l.dados.pesoG, 0n);

    return (
        <div className="flex flex-col gap-4">
            {meus.data && meus.data.length > 0 && (
                <p className="text-sm text-texto-suave">
                    {t('coletor.resumo', { n: meus.data.length, kg: gramasParaKg(totalG, idioma) })}
                </p>
            )}
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
                            rotulo={t('admin.situacao')}
                            valor={filtroSituacao}
                            onChange={(v) => {
                                setFiltroSituacao(v);
                                grade.reiniciar();
                            }}
                            opcoes={[{ valor: '', texto: t('grade.todasSituacoes') }, ...situacoes.map((s) => ({ valor: s, texto: s }))]}
                        />
                    </>
                }
            >
                <Grade grade={grade} larguraMinima="min-w-[64rem]" vazio={t('coletor.vazio')} carregando={meus.status === 'fetching' && !meus.data} />
            </CartaoGrade>
        </div>
    );
}
