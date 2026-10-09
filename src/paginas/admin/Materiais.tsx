import type { Instruction } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { ListPlus, Palette, Pencil, Plus, Power } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Situacao } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { type ContaDecodificada, listarContas } from '../../solana/contas';
import { useVariacoes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { CampoNome, filtroSituacao, type FiltroSituacao, nomeAceito, SoAdministracao, useOpcoesSituacao } from './comum';

/** Materiais conhecidos desde o início do projeto (a antiga lista fixa do programa), com códigos 1 a 6. */
const MATERIAIS_PADRAO = [
    { codigo: 1, chave: 'plastico' },
    { codigo: 2, chave: 'papel' },
    { codigo: 3, chave: 'vidro' },
    { codigo: 4, chave: 'aluminio' },
    { codigo: 5, chave: 'metal' },
    { codigo: 6, chave: 'outros' },
] as const;
const NOME_MAX = 32;
/** Vidro padrão (ADR 0011): cores separadas na reciclagem e contagem aproximada de garrafas. */
const VIDRO = 3;
const CORES_VIDRO = ['transparente', 'verde', 'marrom'] as const;

type Linha = ContaDecodificada<lote.Material>;
type Popup = { tipo: 'novo' } | { tipo: 'editar'; linha: Linha } | { tipo: 'variacoes'; linha: Linha };

export function Materiais() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.materiais')} />
            <SoAdministracao>
                <ConteudoMateriais />
            </SoAdministracao>
        </>
    );
}

function ConteudoMateriais() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () => listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.MATERIAL_DISCRIMINATOR, lote.getMaterialDecoder()),
        [client],
    );
    const lista = useRequest(fonte);
    const variacoes = useVariacoes();
    const envio = useEnviar();
    const [popup, setPopup] = useState<Popup | null>(null);
    const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
    const opcoesSituacao = useOpcoesSituacao();

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'codigo', titulo: t('admin.materiais.codigo'), valor: (l) => l.dados.codigo, numerica: true, largura: 'w-28' },
            { id: 'nome', titulo: t('admin.materiais.nome'), valor: (l) => l.dados.nome },
            {
                id: 'variacoes',
                titulo: t('admin.materiais.variacoes'),
                valor: (l) =>
                    (variacoes.data?.get(l.dados.codigo) ?? [])
                        .filter((v) => v.dados.ativa)
                        .map((v) => lerNomeFixo(v.dados.nome))
                        .join(', '),
                celula: (l) => {
                    const nomes = (variacoes.data?.get(l.dados.codigo) ?? []).filter((v) => v.dados.ativa).map((v) => lerNomeFixo(v.dados.nome));
                    return nomes.length ? nomes.join(', ') : <span className="text-texto-suave">—</span>;
                },
            },
            {
                id: 'garrafas',
                titulo: t('material.garrafasCurto'),
                largura: 'w-28',
                valor: (l) => t(l.dados.contaGarrafas ? 'admin.materiais.sim' : 'admin.materiais.nao'),
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-36',
                valor: (l) => t(l.dados.ativo ? 'admin.ativo' : 'admin.inativo'),
                celula: (l) => <Situacao ativo={l.dados.ativo} />,
            },
        ],
        [t, variacoes.data],
    );
    const filtro = useMemo(() => {
        const f = filtroSituacao(situacao);
        return (l: Linha) => f(l.dados.ativo);
    }, [situacao]);
    const grade = useGrade(lista.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'codigo', desc: false }, filtro });
    const sel = grade.selecionada;
    const materiais = lista.data ?? [];
    const proximoCodigo = materiais.reduce((m, x) => Math.max(m, x.dados.codigo), 0) + 1;
    const faltando = lista.data ? MATERIAIS_PADRAO.filter((m) => !materiais.some((x) => x.dados.codigo === m.codigo)) : [];

    const enviar = async (instrucoes: () => Promise<Instruction[]>) => {
        try {
            await envio.dispatchAsync(await instrucoes());
            lista.refresh();
            variacoes.refresh();
            return true;
        } catch {
            return false; // o erro fica em envio.error
        }
    };

    const atualizar = (l: Linha, nome: string, ativo: boolean) =>
        enviar(async () => [
            await lote.getOperadorUpdateMaterialInstructionAsync({
                operador: client.payer,
                material: l.endereco,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                nome,
                ativo,
            }),
        ]);

    // Padrões ainda não cadastrados (por código): todos numa transação só, uma assinatura.
    const cadastrarPadrao = () =>
        enviar(async () => {
            const ev = await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
            const criar = await Promise.all(
                faltando.map(async (m) =>
                    lote.getOperadorCreateMaterialInstructionAsync({
                        payer: client.payer,
                        operador: client.payer,
                        material: await pLote.material(m.codigo),
                        eventAuthority: ev,
                        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                        codigo: m.codigo,
                        nome: t(`admin.materiais.padrao.${m.chave}`),
                    }),
                ),
            );
            // Vidro novo já sai com as três cores e com garrafas (as instruções rodam em ordem na transação).
            if (!faltando.some((m) => m.codigo === VIDRO)) return criar;
            const material = await pLote.material(VIDRO);
            const cores = await Promise.all(
                CORES_VIDRO.map(async (cor, i) =>
                    lote.getOperadorCreateVariacaoInstructionAsync({
                        payer: client.payer,
                        operador: client.payer,
                        material,
                        variacao: await pLote.variacao(VIDRO, i + 1),
                        eventAuthority: ev,
                        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                        nome: t(`admin.materiais.cores.${cor}`),
                    }),
                ),
            );
            const garrafas = await lote.getOperadorSetMaterialGarrafasInstructionAsync({
                operador: client.payer,
                material,
                eventAuthority: ev,
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                contaGarrafas: true,
            });
            return [...criar, ...cores, garrafas];
        });

    const abrir = (p: Popup) => {
        envio.reset();
        setPopup(p);
    };

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />}

            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={situacao}
                            onChange={(v) => {
                                setSituacao(v as FiltroSituacao);
                                grade.reiniciar();
                            }}
                            opcoes={opcoesSituacao}
                        />
                        <AcoesGrade>
                            {faltando.length > 0 && (
                                <Botao
                                    compacto
                                    variante="secundario"
                                    disabled={envio.isRunning}
                                    title={faltando.map((m) => `${m.codigo} ${t(`admin.materiais.padrao.${m.chave}`)}`).join(', ')}
                                    onClick={cadastrarPadrao}
                                >
                                    <ListPlus className="size-4" /> {t('admin.materiais.padraoBotao', { n: faltando.length })}
                                </Botao>
                            )}
                            <Botao compacto variante="secundario" disabled={!sel} onClick={() => sel && abrir({ tipo: 'editar', linha: sel })}>
                                <Pencil className="size-4" /> {t('admin.editar')}
                            </Botao>
                            <Botao compacto variante="secundario" disabled={!sel} onClick={() => sel && abrir({ tipo: 'variacoes', linha: sel })}>
                                <Palette className="size-4" /> {t('admin.materiais.variacoes')}
                            </Botao>
                            <Botao
                                compacto
                                variante="secundario"
                                disabled={!sel}
                                carregando={envio.isRunning && !popup}
                                onClick={() => sel && atualizar(sel, sel.dados.nome, !sel.dados.ativo)}
                            >
                                <Power className="size-4" /> {t(sel && !sel.dados.ativo ? 'admin.ativar' : 'admin.desativar')}
                            </Botao>
                            <Botao compacto onClick={() => abrir({ tipo: 'novo' })}>
                                <Plus className="size-4" /> {t('admin.novo')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    vazio={t('admin.materiais.vazio')}
                    carregando={lista.status === 'fetching' && !lista.data}
                    onAbrir={(l) => abrir({ tipo: 'editar', linha: l })}
                />
            </CartaoGrade>

            {popup?.tipo === 'variacoes' && (
                <DialogoVariacoes
                    material={lista.data?.find((m) => m.endereco === popup.linha.endereco) ?? popup.linha}
                    variacoes={variacoes.data?.get(popup.linha.dados.codigo) ?? []}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    enviar={enviar}
                />
            )}
            {popup && popup.tipo !== 'variacoes' && (
                <DialogoMaterial
                    linha={popup.tipo === 'editar' ? popup.linha : null}
                    proximoCodigo={proximoCodigo}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={async (codigo, nome) => {
                        const ok =
                            popup.tipo === 'editar'
                                ? await atualizar(popup.linha, nome, popup.linha.dados.ativo)
                                : await enviar(async () => [
                                      await lote.getOperadorCreateMaterialInstructionAsync({
                                          payer: client.payer,
                                          operador: client.payer,
                                          material: await pLote.material(codigo),
                                          eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                          program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                          codigo,
                                          nome,
                                      }),
                                  ]);
                        if (ok) setPopup(null);
                    }}
                />
            )}
        </div>
    );
}

/** Inclusão (código + nome) ou alteração (só o nome: o código não muda). */
function DialogoMaterial({
    linha,
    proximoCodigo,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha | null;
    proximoCodigo: number;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (codigo: number, nome: string) => void;
}) {
    const { t } = useTranslation();
    const [codigo, setCodigo] = useState('');
    const [nome, setNome] = useState(linha?.dados.nome ?? '');
    const cod = linha ? linha.dados.codigo : Number(codigo || proximoCodigo);
    const pronto = nome.trim() !== '' && Number.isInteger(cod) && cod >= 1 && cod <= 65535;

    return (
        <Dialogo
            titulo={t(linha ? 'admin.materiais.editar' : 'admin.materiais.novo')}
            subtitulo={linha ? `${t('admin.materiais.codigo')} ${linha.dados.codigo}` : undefined}
            formId="form-material"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={linha ? undefined : t('admin.materiais.cadastrar')}
            aoFechar={aoFechar}
        >
            <form
                id="form-material"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pronto) aoSalvar(cod, nome.trim());
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                {!linha && (
                    <Campo
                        rotulo={t('admin.materiais.codigo')}
                        type="number"
                        min={1}
                        max={65535}
                        value={codigo}
                        placeholder={String(proximoCodigo)}
                        onChange={(e) => setCodigo(e.target.value)}
                        className="max-w-32"
                    />
                )}
                <Campo
                    rotulo={t('admin.materiais.nome')}
                    required
                    autoFocus
                    maxLength={NOME_MAX}
                    value={nome}
                    placeholder={t('admin.materiais.exemplo')}
                    onChange={(e) => setNome(e.target.value)}
                />
            </form>
        </Dialogo>
    );
}

/**
 * Variações do material (cores do vidro) e a contagem de garrafas. Com alguma variação, todo lote novo
 * do material informa a cor e o lote de venda não mistura cores. Variação não se apaga: desativa.
 */
function DialogoVariacoes({
    material,
    variacoes,
    salvando,
    erro,
    aoFechar,
    enviar,
}: {
    material: Linha;
    variacoes: ContaDecodificada<lote.MaterialVariacao>[];
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    enviar: (instrucoes: () => Promise<Instruction[]>) => Promise<boolean>;
}) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const [nova, setNova] = useState('');
    const [editando, setEditando] = useState<{ indice: number; nome: string } | null>(null);
    const ev = () => eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
    const codigo = material.dados.codigo;

    const incluir = async () => {
        if (!nomeAceito(nova)) return;
        const ok = await enviar(async () => [
            await lote.getOperadorCreateVariacaoInstructionAsync({
                payer: client.payer,
                operador: client.payer,
                material: material.endereco,
                variacao: await pLote.variacao(codigo, material.dados.qtdVariacoes + 1),
                eventAuthority: await ev(),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                nome: nova.trim(),
            }),
        ]);
        if (ok) setNova('');
    };
    const atualizar = (v: ContaDecodificada<lote.MaterialVariacao>, nome: string, ativa: boolean) =>
        enviar(async () => [
            await lote.getOperadorUpdateVariacaoInstructionAsync({
                operador: client.payer,
                variacao: v.endereco,
                eventAuthority: await ev(),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                nome,
                ativa,
            }),
        ]).then((ok) => ok && setEditando(null));
    const alternarGarrafas = () =>
        enviar(async () => [
            await lote.getOperadorSetMaterialGarrafasInstructionAsync({
                operador: client.payer,
                material: material.endereco,
                eventAuthority: await ev(),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                contaGarrafas: !material.dados.contaGarrafas,
            }),
        ]);

    return (
        <Dialogo titulo={t('admin.materiais.variacoesTitulo', { nome: material.dados.nome })} salvando={salvando} aoFechar={aoFechar} largura="lg">
            <div className="flex flex-col gap-4">
                <Resultado erro={erro} sucesso="" />
                <p className="text-sm text-texto-suave">{t('admin.materiais.variacoesAjuda')}</p>
                <ul className="divide-y divide-linha rounded-lg border border-linha">
                    {variacoes.length === 0 && <li className="px-3 py-2.5 text-sm text-texto-suave">{t('admin.materiais.semVariacoes')}</li>}
                    {variacoes.map((v) => (
                        <li key={v.endereco} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                            <span className="w-8 text-texto-suave tabular-nums">#{v.dados.indice}</span>
                            {editando?.indice === v.dados.indice ? (
                                <form
                                    className="flex flex-1 flex-wrap items-end gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (nomeAceito(editando.nome)) void atualizar(v, editando.nome.trim(), v.dados.ativa);
                                    }}
                                >
                                    <div className="min-w-48 flex-1">
                                        <CampoNome
                                            valor={editando.nome}
                                            onChange={(nome) => setEditando({ ...editando, nome })}
                                            rotulo={t('admin.materiais.nome')}
                                            exemplo=""
                                            ajuda=""
                                        />
                                    </div>
                                    <Botao type="submit" compacto carregando={salvando} disabled={!nomeAceito(editando.nome)}>
                                        {t('admin.salvar')}
                                    </Botao>
                                </form>
                            ) : (
                                <>
                                    <span className="flex-1 font-medium text-texto">{lerNomeFixo(v.dados.nome)}</span>
                                    <Situacao ativo={v.dados.ativa} />
                                    <Botao
                                        compacto
                                        variante="secundario"
                                        onClick={() => setEditando({ indice: v.dados.indice, nome: lerNomeFixo(v.dados.nome) })}
                                    >
                                        <Pencil className="size-4" /> {t('admin.editar')}
                                    </Botao>
                                    <Botao compacto variante="secundario" onClick={() => void atualizar(v, lerNomeFixo(v.dados.nome), !v.dados.ativa)}>
                                        <Power className="size-4" /> {t(v.dados.ativa ? 'admin.desativar' : 'admin.ativar')}
                                    </Botao>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void incluir();
                    }}
                >
                    <div className="min-w-48 flex-1">
                        <Campo
                            rotulo={t('admin.materiais.novaVariacao')}
                            value={nova}
                            autoComplete="off"
                            placeholder={t('admin.materiais.novaVariacaoExemplo')}
                            onChange={(e) => setNova(e.target.value)}
                        />
                    </div>
                    <Botao type="submit" compacto carregando={salvando} disabled={!nomeAceito(nova)}>
                        <Plus className="size-4" /> {t('admin.materiais.incluirVariacao')}
                    </Botao>
                </form>
                <label className="flex items-center gap-3 rounded-lg border border-linha p-3 text-sm">
                    <input
                        type="checkbox"
                        checked={material.dados.contaGarrafas}
                        disabled={salvando}
                        onChange={() => void alternarGarrafas()}
                        className="accent-[var(--cor-acento)]"
                    />
                    <span className="flex flex-col">
                        <span className="font-medium text-texto">{t('admin.materiais.contaGarrafas')}</span>
                        <span className="text-texto-suave">{t('admin.materiais.contaGarrafasAjuda')}</span>
                    </span>
                </label>
            </div>
        </Dialogo>
    );
}
