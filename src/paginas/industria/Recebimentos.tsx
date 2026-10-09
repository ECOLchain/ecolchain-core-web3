import { useClient } from '@solana/react';
import { PackageCheck, TriangleAlert } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { BotaoBalanca, DialogoBalanca, useBalancaDoParticipante } from '../../componentes/BalancaTeste';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { useAtor } from '../../solana/ator';
import { gramasParaKg, kgParaGramas, useLotesDaIndustria, useMateriais, useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

const SEM_CONTA = '11111111111111111111111111111111';
const BPS = 10_000n;

type Linha = ContaDecodificada<lote.Lote>;

/** Mesma conta do programa (`Lote::peso_diverge`): |recebido − saída| × 10.000 > saída × tolerância. */
const diverge = (saidaG: bigint, recebidoG: bigint, toleranciaBps: number) => {
    const diferenca = saidaG > recebidoG ? saidaG - recebidoG : recebidoG - saidaG;
    return diferenca * BPS > saidaG * BigInt(toleranciaBps);
};
/** Faixa aceita sem disputa, em gramas (limites inclusivos). */
const faixa = (saidaG: bigint, toleranciaBps: number) => {
    const folga = (saidaG * BigInt(toleranciaBps)) / BPS;
    return { min: saidaG - folga, max: saidaG + folga };
};

export function Recebimentos() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.recebimentos')} />
            <SoPapel papel="industria" aviso={t('vendas.soIndustria')}>
                <ConteudoRecebimentos />
            </SoPapel>
        </>
    );
}

function ConteudoRecebimentos() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { titular: industria, assinante, vinculo } = useAtor();
    const lotes = useLotesDaIndustria(industria);
    const estadoBalanca = useBalancaDoParticipante(industria);
    const participantes = useParticipantes();
    const materiais = useMateriais();
    const envio = useEnviar();
    const [popup, setPopup] = useState<{ tipo: 'receber'; linha: Linha } | { tipo: 'balanca' } | null>(null);
    const [filtro, setFiltro] = useState<'aguardando' | 'recebidos' | 'todos'>('aguardando');
    const [sucesso, setSucesso] = useState('');

    const r = useMemo(() => {
        const cadastro = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados]));
        const nomes = new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome]));
        return {
            nome: (c: string) => (c === SEM_CONTA ? '—' : cadastro.get(c) ? rotuloParticipante(cadastro.get(c)!) : c),
            material: (codigo: number) => nomes.get(codigo) ?? String(codigo),
            kg: (g: bigint) => gramasParaKg(g, idioma),
            data: (ts: bigint) => new Date(Number(ts) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' }),
            /** Em transporte ainda não chegou; os demais estados vêm da máquina de estados do lote. */
            situacao: (l: lote.Lote) =>
                l.estado.__kind === 'EmTransporte' ? t('recebimentos.aguardando') : t(`estadoLote.${l.estado.__kind}`),
        };
    }, [participantes.data, materiais.data, idioma, t]);

    // Só o que já saiu da cooperativa: em transporte ou recebido (com ou sem disputa).
    const linhas = useMemo(
        () => (lotes.data ?? []).filter((l) => !['Vendido', 'Anunciado', 'SemLance', 'Criado'].includes(l.dados.estado.__kind)),
        [lotes.data],
    );
    const agora = BigInt(Math.floor(Date.now() / 1000));
    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.loteId, numerica: true, largura: 'w-14' },
            { id: 'cooperativa', titulo: t('trilha.cooperativa'), valor: (l) => r.nome(l.dados.cooperativa), busca: (l) => l.dados.cooperativa },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => r.material(l.dados.material), largura: 'w-24' },
            { id: 'saida', titulo: t('recebimentos.pesoSaida'), valor: (l) => l.dados.pesoG, celula: (l) => r.kg(l.dados.pesoG), numerica: true, largura: 'w-28' },
            { id: 'transportador', titulo: t('papel.transportador'), valor: (l) => r.nome(l.dados.transportador), busca: (l) => l.dados.transportador },
            {
                id: 'prazo',
                titulo: t('retiradas.prazo'),
                largura: 'w-36',
                valor: (l) => l.dados.prazoEntrega,
                celula: (l) => {
                    const atrasado = l.dados.estado.__kind === 'EmTransporte' && agora > l.dados.prazoEntrega;
                    return <span className={atrasado ? 'font-semibold text-perigo' : 'text-texto-suave'}>{r.data(l.dados.prazoEntrega)}</span>;
                },
            },
            {
                id: 'recebido',
                titulo: t('recebimentos.pesoRecebido'),
                largura: 'w-32',
                valor: (l) => l.dados.pesoRecebidoG,
                numerica: true,
                celula: (l) =>
                    l.dados.pesoRecebidoG > 0n ? (
                        <span title={t(l.dados.recebimentoAtestado ? 'recebimentos.atestado' : 'recebimentos.informado')}>
                            {r.kg(l.dados.pesoRecebidoG)}
                            {l.dados.recebimentoAtestado && <span className="ml-1 text-acento">✓</span>}
                        </span>
                    ) : (
                        '—'
                    ),
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-40',
                valor: (l) => r.situacao(l.dados),
                celula: (l) => {
                    const k = l.dados.estado.__kind;
                    const cor = k === 'EmTransporte' ? 'bg-kraft/15 text-kraft' : k === 'EmDisputa' ? 'bg-perigo/10 text-perigo' : 'bg-acento-suave text-acento';
                    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>{r.situacao(l.dados)}</span>;
                },
            },
        ],
        [t, r, agora],
    );
    const filtrar = useMemo(
        () => (l: Linha) => filtro === 'todos' || (filtro === 'aguardando') === (l.dados.estado.__kind === 'EmTransporte'),
        [filtro],
    );
    const grade = useGrade(lotes.data ? linhas : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'prazo', desc: false }, filtro: filtrar });
    const sel = grade.selecionada;
    const podeReceber = sel?.dados.estado.__kind === 'EmTransporte';

    const receber = async (linha: Linha, pesoG: bigint, comBalanca: boolean) => {
        const ev = await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
        const balanca = estadoBalanca.balanca;
        const ts = BigInt(Math.floor(Date.now() / 1000));
        const confirmar = await lote.getIndustriaConfirmRecebimentoInstructionAsync({
            industria: industria!,
            industriaAssinante: assinante,
            industriaCarteira: vinculo,
            balanca: comBalanca && balanca ? await pLote.balanca(balanca.address) : undefined,
            lote: linha.endereco,
            payer: client.payer,
            asset: linha.dados.asset,
            eventAuthority: ev,
            program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
            pesoRecebidoG: pesoG,
            tsPesagem: comBalanca && balanca ? ts : null,
        });
        const instrucoes =
            comBalanca && balanca ? [await instrucaoPesagem(balanca, TipoPesagem.Recebimento, linha.endereco, pesoG, ts), confirmar] : [confirmar];
        try {
            await envio.dispatchAsync(instrucoes);
            const divergiu = diverge(linha.dados.pesoG, pesoG, linha.dados.toleranciaPesoBps);
            setSucesso(t(divergiu ? 'recebimentos.emDisputa' : 'recebimentos.registrado', { lote: linha.dados.loteId }));
            setPopup(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={sucesso} />}
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={filtro}
                            onChange={(v) => {
                                setFiltro(v as typeof filtro);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: 'aguardando', texto: t('recebimentos.aguardando') },
                                { valor: 'recebidos', texto: t('recebimentos.recebidos') },
                                { valor: 'todos', texto: t('grade.todasSituacoes') },
                            ]}
                        />
                        <AcoesGrade>
                            <BotaoBalanca pronta={estadoBalanca.pronta} onClick={() => setPopup({ tipo: 'balanca' })} />
                            <Botao
                                compacto
                                disabled={!podeReceber}
                                title={podeReceber ? undefined : t('recebimentos.selecione')}
                                onClick={() => {
                                    envio.reset();
                                    if (sel) setPopup({ tipo: 'receber', linha: sel });
                                }}
                            >
                                <PackageCheck className="size-4" /> {t('recebimentos.registrar')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    larguraMinima="min-w-[56rem]"
                    vazio={t('recebimentos.vazio')}
                    carregando={lotes.status === 'fetching' && !lotes.data}
                    onAbrir={(l) => l.dados.estado.__kind === 'EmTransporte' && setPopup({ tipo: 'receber', linha: l })}
                />
            </CartaoGrade>

            {popup?.tipo === 'balanca' && <DialogoBalanca estado={estadoBalanca} dono="industria" aoFechar={() => setPopup(null)} />}
            {popup?.tipo === 'receber' && (
                <DialogoRecebimento
                    linha={popup.linha}
                    rotulos={r}
                    balancaPronta={estadoBalanca.pronta}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoAbrirBalanca={() => setPopup({ tipo: 'balanca' })}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={(pesoG, comBalanca) => void receber(popup.linha, pesoG, comBalanca)}
                />
            )}
        </div>
    );
}

function DialogoRecebimento({
    linha,
    rotulos: r,
    balancaPronta,
    salvando,
    erro,
    aoAbrirBalanca,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    rotulos: { nome: (c: string) => string; material: (c: number) => string; kg: (g: bigint) => string };
    balancaPronta: boolean;
    salvando: boolean;
    erro: unknown;
    aoAbrirBalanca: () => void;
    aoFechar: () => void;
    aoSalvar: (pesoG: bigint, comBalanca: boolean) => void;
}) {
    const { t } = useTranslation();
    const [peso, setPeso] = useState('');
    const [comBalanca, setComBalanca] = useState(balancaPronta);
    const pesoG = kgParaGramas(peso);
    const tol = linha.dados.toleranciaPesoBps;
    const { min, max } = faixa(linha.dados.pesoG, tol);
    const divergente = pesoG !== null && diverge(linha.dados.pesoG, pesoG, tol);

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pesoG) aoSalvar(pesoG, comBalanca && balancaPronta);
    };

    return (
        <Dialogo
            titulo={t('recebimentos.registrar')}
            subtitulo={t('retiradas.resumo', { lote: linha.dados.loteId, material: r.material(linha.dados.material), kg: r.kg(linha.dados.pesoG) })}
            formId="form-recebimento"
            salvando={salvando}
            podeSalvar={!!pesoG}
            rotuloSalvar={t(divergente ? 'recebimentos.registrarDisputa' : 'recebimentos.registrar')}
            aoFechar={aoFechar}
        >
            <form id="form-recebimento" onSubmit={enviar} className="flex flex-col gap-4">
                <Resultado erro={erro} sucesso="" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-linha p-3 text-sm">
                    <dt className="text-texto-suave">{t('trilha.cooperativa')}</dt>
                    <dd className="text-texto">{r.nome(linha.dados.cooperativa)}</dd>
                    <dt className="text-texto-suave">{t('papel.transportador')}</dt>
                    <dd className="text-texto">{r.nome(linha.dados.transportador)}</dd>
                    <dt className="text-texto-suave">{t('recebimentos.pesoSaida')}</dt>
                    <dd className="text-texto tabular-nums">{t('trilha.peso', { kg: r.kg(linha.dados.pesoG) })}</dd>
                    <dt className="text-texto-suave">{t('recebimentos.faixa')}</dt>
                    <dd className="text-texto tabular-nums">
                        {t('recebimentos.faixaValor', { min: r.kg(min), max: r.kg(max), tol: (tol / 100).toLocaleString() })}
                    </dd>
                </dl>
                <Campo
                    rotulo={t('recebimentos.pesoNaBalanca')}
                    inputMode="decimal"
                    required
                    autoFocus
                    placeholder="0,000"
                    value={peso}
                    onChange={(e) => setPeso(e.target.value)}
                />
                {divergente && (
                    <p role="alert" className="flex items-start gap-2 rounded-lg bg-perigo/10 p-3 text-sm text-perigo">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {t('recebimentos.divergente')}
                    </p>
                )}
                {balancaPronta ? (
                    <label className="flex items-start gap-2 text-sm text-texto">
                        <input type="checkbox" checked={comBalanca} onChange={(e) => setComBalanca(e.target.checked)} className="mt-0.5 size-4 accent-acento" />
                        <span>
                            {t('recebimentos.comBalanca')}
                            <span className="block text-texto-suave">{t('recebimentos.comBalancaAjuda')}</span>
                        </span>
                    </label>
                ) : (
                    <p className="text-sm text-kraft">
                        {t('recebimentos.semBalanca')}{' '}
                        <button type="button" onClick={aoAbrirBalanca} className="font-semibold underline underline-offset-4">
                            {t('recebimentos.configurarBalanca')}
                        </button>
                    </p>
                )}
            </form>
        </Dialogo>
    );
}
