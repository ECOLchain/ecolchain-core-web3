import { type Address, address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Ban, FileBadge, Plus, Send } from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { origemRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { CamposMaterial, ESCOLHA_VAZIA, type EscolhaMaterial, lerEscolha } from '../../componentes/CamposMaterial';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useAtor } from '../../solana/ator';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import {
    gramasParaKg,
    kgParaGramas,
    nomeVariacao,
    useColetasImportador,
    useDistribuicoes,
    useMateriais,
    useParticipantes,
    useVariacoes,
} from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

type Distribuicao = ContaDecodificada<lote.Distribuicao>;
type Coleta = ContaDecodificada<lote.Coleta>;
const SEM_CONTA = '11111111111111111111111111111111';

/** Telas do importador só para ele (titular ou carteira vinculada). */
function SoImportador({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={titulo} />
            <SoPapel papel="importador" aviso={t('importador.soImportador')}>
                {children}
            </SoPapel>
        </>
    );
}

/** Contas de quem assina pelo importador (ADR 0011). */
function useContasImportador() {
    const { titular, assinante, vinculo } = useAtor();
    return {
        titular,
        assinante,
        contas: titular ? { importador: titular, importadorAssinante: assinante, importadorCarteira: vinculo } : null,
    };
}

/** Nome do material com a cor ("Vidro · Verde"). */
export function useRotuloMaterial() {
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const nomes = useMemo(() => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])), [materiais.data]);
    return useCallback(
        (material: number, variacao: number) =>
            [nomes.get(material) ?? String(material), nomeVariacao(variacoes.data, material, variacao)].filter(Boolean).join(' · '),
        [nomes, variacoes.data],
    );
}

const dataCurta = (unix: bigint, idioma: string) => new Date(Number(unix) * 1000).toLocaleDateString(idioma);
/** `yyyy-mm-dd` do campo de data → unix (meio-dia local, para não cair no dia anterior em UTC). */
const dataParaUnix = (texto: string) => BigInt(Math.floor(new Date(`${texto}T12:00:00`).getTime() / 1000));
const hojeIso = () => new Date().toISOString().slice(0, 10);

/** Situação da coleta com cor (texto sempre presente). */
export function SituacaoColeta({ estado }: { estado: lote.EstadoColeta }) {
    const { t } = useTranslation();
    const cor =
        estado === lote.EstadoColeta.Reciclada
            ? 'bg-acento-suave text-acento'
            : estado === lote.EstadoColeta.Entregue
              ? 'bg-superficie-2 text-texto'
              : estado === lote.EstadoColeta.EmEntrega
                ? 'bg-kraft/15 text-kraft'
                : 'bg-superficie-2 text-texto-suave';
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>
            {t(`estadoColeta.${lote.EstadoColeta[estado]}`)}
        </span>
    );
}

/* ───────────────────────── Lotes de distribuição ───────────────────────── */

export function DistribuicoesImportador() {
    const { t } = useTranslation();
    return (
        <SoImportador titulo={t('itens.distribuicoesImportador')}>
            <ConteudoDistribuicoes />
        </SoImportador>
    );
}

function ConteudoDistribuicoes() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const { titular, assinante, contas } = useContasImportador();
    const lista = useDistribuicoes(titular);
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const rotulo = useRotuloMaterial();
    const envio = useEnviar();
    const [aberto, setAberto] = useState(false);
    const [filtroCor, setFiltroCor] = useState('');

    const colunas = useMemo<Coluna<Distribuicao>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.distribId, numerica: true, largura: 'w-20' },
            { id: 'emissao', titulo: t('importador.emissao'), largura: 'w-32', valor: (l) => l.dados.emitidoEm, celula: (l) => dataCurta(l.dados.emitidoEm, idioma) },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => rotulo(l.dados.material, l.dados.variacao) },
            {
                id: 'garrafas',
                titulo: t('material.garrafasCurto'),
                largura: 'w-32',
                numerica: true,
                valor: (l) => l.dados.qtdGarrafas,
                celula: (l) => l.dados.qtdGarrafas.toLocaleString(idioma),
            },
            {
                id: 'peso',
                titulo: t('importador.pesoEstimado'),
                largura: 'w-36',
                numerica: true,
                valor: (l) => l.dados.pesoEstimadoG,
                celula: (l) => (l.dados.pesoEstimadoG > 0n ? gramasParaKg(l.dados.pesoEstimadoG, idioma) : '—'),
            },
            { id: 'registro', titulo: t('importador.registradoEm'), largura: 'w-32', valor: (l) => l.dados.criadoEm, celula: (l) => dataCurta(l.dados.criadoEm, idioma) },
        ],
        [t, idioma, rotulo],
    );
    const cores = useMemo(
        () => [...new Set((lista.data ?? []).map((d) => `${d.dados.material}:${d.dados.variacao}`))],
        [lista.data],
    );
    const filtro = useMemo(() => (l: Distribuicao) => filtroCor === '' || `${l.dados.material}:${l.dados.variacao}` === filtroCor, [filtroCor]);
    const grade = useGrade(lista.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'emissao', desc: true }, filtro });

    const registrar = async (n: NovoRegistro) => {
        if (!titular || !contas) return;
        const id = (lista.data ?? []).reduce((m, x) => (x.dados.distribId > m ? x.dados.distribId : m), 0n) + 1n;
        try {
            await envio.dispatchAsync([
                await lote.getImportadorCreateDistribuicaoInstructionAsync({
                    payer: assinante,
                    ...contas,
                    importadorPart: await pLote.participante(titular),
                    materialCadastro: await pLote.material(n.material),
                    variacaoCadastro: n.variacao ? await pLote.variacao(n.material, n.variacao) : undefined,
                    distribuicao: await pLote.distribuicao(titular, id),
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    distribId: id,
                    material: n.material,
                    variacao: n.variacao,
                    qtdGarrafas: n.garrafas,
                    pesoEstimadoG: n.pesoG,
                    // Só o hash do documento vai on-chain; a trilha acha pelo mesmo texto.
                    docHash: await origemRef(n.referencia),
                    emitidoEm: n.data,
                }),
            ]);
            setAberto(false);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!aberto && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('importador.distribuicaoRegistrada')} />}
            <p className="max-w-3xl text-sm text-texto-suave">{t('importador.distribuicoesAjuda')}</p>
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('cooperativa.material')}
                            valor={filtroCor}
                            onChange={(v) => {
                                setFiltroCor(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('grade.todosMateriais') },
                                ...cores.map((c) => {
                                    const [m, v] = c.split(':').map(Number);
                                    return { valor: c, texto: rotulo(m, v) };
                                }),
                            ]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                onClick={() => {
                                    envio.reset();
                                    setAberto(true);
                                }}
                            >
                                <Plus className="size-4" /> {t('importador.novaDistribuicao')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade grade={grade} vazio={t('importador.semDistribuicoes')} carregando={lista.status === 'fetching' && !lista.data} />
            </CartaoGrade>
            {aberto && (
                <DialogoRegistro
                    tipo="distribuicao"
                    materiais={(materiais.data ?? []).filter((m) => m.dados.ativo && m.dados.contaGarrafas)}
                    variacoes={variacoes.data}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setAberto(false)}
                    aoSalvar={registrar}
                />
            )}
        </div>
    );
}

type NovoRegistro = { material: number; variacao: number; garrafas: number; pesoG: bigint; referencia: string; data: bigint };

/** Formulário comum a distribuição (NF/DI) e coleta (ponto de coleta). */
function DialogoRegistro({
    tipo,
    materiais,
    variacoes,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    tipo: 'distribuicao' | 'coleta';
    materiais: ContaDecodificada<lote.Material>[];
    variacoes: Map<number, ContaDecodificada<lote.MaterialVariacao>[]> | undefined;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (n: NovoRegistro) => void;
}) {
    const { t } = useTranslation();
    const [escolha, setEscolha] = useState<EscolhaMaterial>(
        materiais.length === 1 ? { ...ESCOLHA_VAZIA, material: String(materiais[0].dados.codigo) } : ESCOLHA_VAZIA,
    );
    const [peso, setPeso] = useState('');
    const [referencia, setReferencia] = useState('');
    const [data, setData] = useState(hojeIso());
    const lido = lerEscolha(escolha, materiais, true);
    const pesoG = peso.trim() === '' ? 0n : kgParaGramas(peso);
    const dataOk = data !== '' && data <= hojeIso();
    const pronto = !!lido && pesoG !== null && referencia.trim() !== '' && dataOk;
    const prefixo = tipo === 'distribuicao' ? 'importador.form.distribuicao' : 'importador.form.coleta';

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pronto && lido && pesoG !== null)
            aoSalvar({ ...lido, pesoG, referencia: referencia.trim(), data: dataParaUnix(data) });
    };

    return (
        <Dialogo
            titulo={t(`${prefixo}.titulo`)}
            formId="form-importador"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('importador.registrar')}
            aoFechar={aoFechar}
        >
            <form id="form-importador" onSubmit={enviar} className="flex flex-col gap-4">
                <Resultado erro={erro} sucesso="" />
                {materiais.length === 0 ? (
                    <p className="text-sm text-kraft">{t('importador.semMaterialGarrafas')}</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <CamposMaterial valor={escolha} onChange={setEscolha} materiais={materiais} variacoes={variacoes} garrafasObrigatorias />
                        <Campo
                            rotulo={t('importador.pesoEstimado')}
                            inputMode="decimal"
                            value={peso}
                            placeholder="0,000"
                            onChange={(e) => setPeso(e.target.value)}
                            ajuda={t('importador.pesoEstimadoAjuda')}
                        />
                    </div>
                )}
                <Campo
                    rotulo={t(`${prefixo}.referencia`)}
                    required
                    autoComplete="off"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    ajuda={t(`${prefixo}.referenciaAjuda`)}
                />
                <Campo
                    rotulo={t(`${prefixo}.data`)}
                    type="date"
                    required
                    max={hojeIso()}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    aria-invalid={!dataOk}
                    ajuda={dataOk ? undefined : t('importador.dataFutura')}
                />
            </form>
        </Dialogo>
    );
}

/* ─────────────────────────────── Coletas ─────────────────────────────── */

/** Colunas comuns às grades de coleta do importador. */
function useColunasColeta(extra: Coluna<Coleta>[] = []) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const rotulo = useRotuloMaterial();
    const participantes = useParticipantes();
    const nome = useMemo(() => {
        const mapa = new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados]));
        return (c: string) => (c === SEM_CONTA ? '—' : mapa.get(c) ? rotuloParticipante(mapa.get(c)!) : c);
    }, [participantes.data]);
    const colunas = useMemo<Coluna<Coleta>[]>(
        () => [
            { id: 'id', titulo: '#', valor: (l) => l.dados.coletaId, numerica: true, largura: 'w-20' },
            { id: 'data', titulo: t('importador.dataColeta'), largura: 'w-32', valor: (l) => l.dados.coletadoEm, celula: (l) => dataCurta(l.dados.coletadoEm, idioma) },
            { id: 'material', titulo: t('cooperativa.material'), valor: (l) => rotulo(l.dados.material, l.dados.variacao) },
            {
                id: 'garrafas',
                titulo: t('material.garrafasCurto'),
                largura: 'w-28',
                numerica: true,
                valor: (l) => l.dados.qtdGarrafas,
                celula: (l) => l.dados.qtdGarrafas.toLocaleString(idioma),
            },
            { id: 'destino', titulo: t('importador.destino'), valor: (l) => nome(l.dados.destino), busca: (l) => l.dados.destino },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-40',
                valor: (l) => t(`estadoColeta.${lote.EstadoColeta[l.dados.estado]}`),
                celula: (l) => <SituacaoColeta estado={l.dados.estado} />,
            },
            ...extra,
        ],
        [t, idioma, rotulo, nome, extra],
    );
    return { colunas, nome, participantes };
}

export function ColetasImportador() {
    const { t } = useTranslation();
    return (
        <SoImportador titulo={t('itens.coletasImportador')}>
            <ConteudoColetas />
        </SoImportador>
    );
}

function ConteudoColetas() {
    const { t } = useTranslation();
    const { titular, assinante, contas } = useContasImportador();
    const lista = useColetasImportador(titular);
    const materiais = useMateriais();
    const variacoes = useVariacoes();
    const envio = useEnviar();
    const [aberto, setAberto] = useState(false);
    const [situacao, setSituacao] = useState('');
    const { colunas } = useColunasColeta();
    const filtro = useMemo(() => (l: Coleta) => situacao === '' || String(l.dados.estado) === situacao, [situacao]);
    const grade = useGrade(lista.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });

    const registrar = async (n: NovoRegistro) => {
        if (!titular || !contas) return;
        const id = (lista.data ?? []).reduce((m, x) => (x.dados.coletaId > m ? x.dados.coletaId : m), 0n) + 1n;
        try {
            await envio.dispatchAsync([
                await lote.getImportadorRegisterColetaInstructionAsync({
                    payer: assinante,
                    ...contas,
                    importadorPart: await pLote.participante(titular),
                    materialCadastro: await pLote.material(n.material),
                    variacaoCadastro: n.variacao ? await pLote.variacao(n.material, n.variacao) : undefined,
                    coleta: await pLote.coleta(titular, id),
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    coletaId: id,
                    material: n.material,
                    variacao: n.variacao,
                    qtdGarrafas: n.garrafas,
                    pesoEstimadoG: n.pesoG,
                    // LGPD: o ponto de coleta (endereço, loja, condomínio) vai só como hash.
                    localRef: await origemRef(n.referencia),
                    coletadoEm: n.data,
                }),
            ]);
            setAberto(false);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!aberto && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('importador.coletaRegistrada')} />}
            <p className="max-w-3xl text-sm text-texto-suave">{t('importador.coletasAjuda')}</p>
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroSituacaoColeta valor={situacao} onChange={(v) => (setSituacao(v), grade.reiniciar())} />
                        <AcoesGrade>
                            <Botao
                                compacto
                                onClick={() => {
                                    envio.reset();
                                    setAberto(true);
                                }}
                            >
                                <Plus className="size-4" /> {t('importador.novaColeta')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade grade={grade} vazio={t('importador.semColetas')} carregando={lista.status === 'fetching' && !lista.data} />
            </CartaoGrade>
            {aberto && (
                <DialogoRegistro
                    tipo="coleta"
                    materiais={(materiais.data ?? []).filter((m) => m.dados.ativo && m.dados.contaGarrafas)}
                    variacoes={variacoes.data}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setAberto(false)}
                    aoSalvar={registrar}
                />
            )}
        </div>
    );
}

function FiltroSituacaoColeta({ valor, onChange, so }: { valor: string; onChange: (v: string) => void; so?: lote.EstadoColeta[] }) {
    const { t } = useTranslation();
    const estados = so ?? [lote.EstadoColeta.Coletada, lote.EstadoColeta.EmEntrega, lote.EstadoColeta.Entregue, lote.EstadoColeta.Reciclada];
    return (
        <FiltroGrade
            rotulo={t('admin.situacao')}
            valor={valor}
            onChange={onChange}
            opcoes={[
                { valor: '', texto: t('grade.todasSituacoes') },
                ...estados.map((e) => ({ valor: String(e), texto: t(`estadoColeta.${lote.EstadoColeta[e]}`) })),
            ]}
        />
    );
}

/* ─────────────────────────────── Entregas ─────────────────────────────── */

export function EntregasImportador() {
    const { t } = useTranslation();
    return (
        <SoImportador titulo={t('itens.entregasImportador')}>
            <ConteudoEntregas />
        </SoImportador>
    );
}

function ConteudoEntregas() {
    const { t } = useTranslation();
    const { titular, contas } = useContasImportador();
    const lista = useColetasImportador(titular);
    const envio = useEnviar();
    const [enviando, setEnviando] = useState<Coleta | null>(null);
    const [situacao, setSituacao] = useState('');
    const { colunas, participantes } = useColunasColeta();
    const pendentes = useMemo(
        () => (lista.data ?? []).filter((c) => c.dados.estado === lote.EstadoColeta.Coletada || c.dados.estado === lote.EstadoColeta.EmEntrega),
        [lista.data],
    );
    const filtro = useMemo(() => (l: Coleta) => situacao === '' || String(l.dados.estado) === situacao, [situacao]);
    const grade = useGrade(lista.data ? pendentes : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });
    const sel = grade.selecionada;
    const destinos = useMemo(
        () =>
            (participantes.data ?? [])
                .filter((p) => p.dados.ativo && (p.dados.papel === lote.Papel.Cooperativa || p.dados.papel === lote.Papel.CleanTech))
                .sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [participantes.data],
    );

    const executar = async (ix: () => Promise<Parameters<typeof envio.dispatchAsync>[0][number]>) => {
        try {
            await envio.dispatchAsync([await ix()]);
            setEnviando(null);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };
    const enviarPara = (c: Coleta, destino: Address) =>
        contas &&
        executar(async () =>
            lote.getImportadorEntregarColetaInstructionAsync({
                ...contas,
                importadorPart: await pLote.participante(contas.importador),
                coleta: c.endereco,
                destinoPart: await pLote.participante(destino),
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
            }),
        );
    const cancelar = (c: Coleta) =>
        contas &&
        executar(async () =>
            lote.getImportadorCancelarEntregaInstructionAsync({
                ...contas,
                coleta: c.endereco,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
            }),
        );

    return (
        <div className="flex flex-col gap-4">
            {!enviando && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />}
            <p className="max-w-3xl text-sm text-texto-suave">{t('importador.entregasAjuda')}</p>
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroSituacaoColeta
                            valor={situacao}
                            onChange={(v) => (setSituacao(v), grade.reiniciar())}
                            so={[lote.EstadoColeta.Coletada, lote.EstadoColeta.EmEntrega]}
                        />
                        <AcoesGrade>
                            {sel?.dados.estado === lote.EstadoColeta.EmEntrega ? (
                                <Botao compacto variante="secundario" carregando={envio.isRunning} onClick={() => void cancelar(sel)}>
                                    <Ban className="size-4" /> {t('importador.cancelarEnvio')}
                                </Botao>
                            ) : (
                                <Botao
                                    compacto
                                    disabled={!sel}
                                    onClick={() => {
                                        envio.reset();
                                        setEnviando(sel ?? null);
                                    }}
                                >
                                    <Send className="size-4" /> {t('importador.enviar')}
                                </Botao>
                            )}
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    vazio={t('importador.semPendentes')}
                    carregando={lista.status === 'fetching' && !lista.data}
                    onAbrir={(c) => c.dados.estado === lote.EstadoColeta.Coletada && (envio.reset(), setEnviando(c))}
                />
            </CartaoGrade>
            {enviando && (
                <DialogoEnviar
                    coleta={enviando}
                    destinos={destinos}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setEnviando(null)}
                    aoSalvar={(d) => void enviarPara(enviando, d)}
                />
            )}
        </div>
    );
}

function DialogoEnviar({
    coleta,
    destinos,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    coleta: Coleta;
    destinos: ContaDecodificada<lote.Participante>[];
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (destino: Address) => void;
}) {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const rotulo = useRotuloMaterial();
    const [destino, setDestino] = useState('');
    return (
        <Dialogo
            titulo={t('importador.enviarTitulo', { id: coleta.dados.coletaId.toString() })}
            subtitulo={`${rotulo(coleta.dados.material, coleta.dados.variacao)} | ${t('material.garrafasN', {
                n: coleta.dados.qtdGarrafas.toLocaleString(idioma),
            })}`}
            formId="form-enviar"
            salvando={salvando}
            podeSalvar={!!destino}
            rotuloSalvar={t('importador.enviar')}
            iconeSalvar={Send}
            aoFechar={aoFechar}
        >
            <form
                id="form-enviar"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (destino) aoSalvar(address(destino));
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                {destinos.length === 0 ? (
                    <p className="text-sm text-kraft">{t('importador.semDestinos')}</p>
                ) : (
                    <Selecao rotulo={t('importador.destino')} required autoFocus value={destino} onChange={(e) => setDestino(e.target.value)}>
                        <option value="" disabled>
                            {t('importador.escolherDestino')}
                        </option>
                        {destinos.map((p) => (
                            <option key={p.endereco} value={p.dados.carteira}>
                                {`${rotuloParticipante(p.dados)} (${t(p.dados.papel === lote.Papel.CleanTech ? 'papel.cleantech' : 'papel.cooperativa')})`}
                            </option>
                        ))}
                    </Selecao>
                )}
                <p className="text-sm text-texto-suave">{t('importador.enviarEfeito')}</p>
            </form>
        </Dialogo>
    );
}

/* ────────────────────────────── Reciclagem ────────────────────────────── */

/** Para cada coleta entregue: o lote de origem (entrega) e o lote de venda em que ele entrou. */
export function useLotesDasColetas(coletas: Coleta[] | undefined) {
    const client = useClient<AppClient>();
    const entregues = useMemo(() => (coletas ?? []).filter((c) => c.dados.entrega !== SEM_CONTA), [coletas]);
    const chave = entregues.map((c) => c.endereco).join(',');
    const fonte = useCallback(async () => {
        const mapa = new Map<Address, { entrega: Address; lote?: Address; estado?: string }>();
        const entregas = await lote.fetchAllMaybeEntrega(
            client.rpc,
            entregues.map((c) => c.dados.entrega),
        );
        const lotesEnd = [...new Set(entregas.flatMap((e) => (e.exists && e.data.lote !== SEM_CONTA ? [e.data.lote] : [])))];
        const lotes = lotesEnd.length ? await lote.fetchAllMaybeLote(client.rpc, lotesEnd) : [];
        const estados = new Map(lotes.flatMap((l) => (l.exists ? [[l.address, l.data.estado.__kind] as const] : [])));
        entregues.forEach((c, i) => {
            const e = entregas[i];
            const l = e.exists && e.data.lote !== SEM_CONTA ? e.data.lote : undefined;
            mapa.set(c.endereco, { entrega: c.dados.entrega, lote: l, estado: l ? estados.get(l) : undefined });
        });
        return mapa;
    }, [client, chave]);
    return useRequest(entregues.length ? fonte : null);
}

export function ReciclagemImportador() {
    const { t } = useTranslation();
    return (
        <SoImportador titulo={t('itens.reciclagemImportador')}>
            <ConteudoReciclagem />
        </SoImportador>
    );
}

function ConteudoReciclagem() {
    const { t } = useTranslation();
    const { titular, contas } = useContasImportador();
    const lista = useColetasImportador(titular);
    const envio = useEnviar();
    const [informando, setInformando] = useState<Coleta | null>(null);
    const [situacao, setSituacao] = useState('');
    const doDestino = useMemo(
        () => (lista.data ?? []).filter((c) => c.dados.estado === lote.EstadoColeta.Entregue || c.dados.estado === lote.EstadoColeta.Reciclada),
        [lista.data],
    );
    const vinculos = useLotesDasColetas(doDestino);
    const reciclado = (c: Coleta) => ['Reciclado', 'Agregado'].includes(vinculos.data?.get(c.endereco)?.estado ?? '');
    const extra = useMemo<Coluna<Coleta>[]>(
        () => [
            {
                id: 'lote',
                titulo: t('importador.loteVenda'),
                largura: 'w-44',
                valor: (l) => vinculos.data?.get(l.endereco)?.estado ?? '',
                celula: (l) => {
                    const v = vinculos.data?.get(l.endereco);
                    if (!v?.lote) return <span className="text-texto-suave">{t('importador.aguardandoLote')}</span>;
                    return <span className="text-texto-suave">{t(`estadoLote.${v.estado}`)}</span>;
                },
            },
        ],
        [t, vinculos.data],
    );
    const { colunas } = useColunasColeta(extra);
    const filtro = useMemo(() => (l: Coleta) => situacao === '' || String(l.dados.estado) === situacao, [situacao]);
    const grade = useGrade(lista.data ? doDestino : undefined, colunas, { chave: (l) => l.endereco, ordem: { id: 'id', desc: true }, filtro });
    const sel = grade.selecionada;
    const pode = !!sel && sel.dados.estado === lote.EstadoColeta.Entregue && reciclado(sel);

    const informar = async (c: Coleta, nf: string) => {
        const v = vinculos.data?.get(c.endereco);
        if (!contas || !v?.lote) return;
        try {
            await envio.dispatchAsync([
                await lote.getImportadorInformarReciclagemInstructionAsync({
                    ...contas,
                    coleta: c.endereco,
                    entrega: v.entrega,
                    lote: v.lote,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    nfReciclagemHash: await origemRef(nf),
                }),
            ]);
            setInformando(null);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {!informando && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('importador.nfRegistrada')} />}
            <p className="max-w-3xl text-sm text-texto-suave">{t('importador.reciclagemAjuda')}</p>
            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroSituacaoColeta
                            valor={situacao}
                            onChange={(v) => (setSituacao(v), grade.reiniciar())}
                            so={[lote.EstadoColeta.Entregue, lote.EstadoColeta.Reciclada]}
                        />
                        <AcoesGrade>
                            <Botao
                                compacto
                                disabled={!pode}
                                title={sel && !pode ? t('importador.nfSoReciclado') : undefined}
                                onClick={() => {
                                    envio.reset();
                                    setInformando(sel ?? null);
                                }}
                            >
                                <FileBadge className="size-4" /> {t('importador.informarNf')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade grade={grade} vazio={t('importador.semEntregues')} carregando={lista.status === 'fetching' && !lista.data} />
            </CartaoGrade>
            {informando && (
                <DialogoNf coleta={informando} salvando={envio.isRunning} erro={envio.error} aoFechar={() => setInformando(null)} aoSalvar={(nf) => void informar(informando, nf)} />
            )}
        </div>
    );
}

function DialogoNf({
    coleta,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    coleta: Coleta;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (nf: string) => void;
}) {
    const { t } = useTranslation();
    const [nf, setNf] = useState('');
    return (
        <Dialogo
            titulo={t('importador.nfTitulo', { id: coleta.dados.coletaId.toString() })}
            formId="form-nf"
            salvando={salvando}
            podeSalvar={nf.trim() !== ''}
            rotuloSalvar={t('importador.registrar')}
            iconeSalvar={FileBadge}
            aoFechar={aoFechar}
        >
            <form
                id="form-nf"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (nf.trim()) aoSalvar(nf.trim());
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                <Campo
                    rotulo={t('importador.nf')}
                    required
                    autoFocus
                    autoComplete="off"
                    value={nf}
                    onChange={(e) => setNf(e.target.value)}
                    ajuda={t('importador.nfAjuda')}
                />
            </form>
        </Dialogo>
    );
}
