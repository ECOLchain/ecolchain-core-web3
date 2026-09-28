import type { Instruction } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { ListPlus, Pencil, Plus, Power } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Situacao } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { type ContaDecodificada, listarContas } from '../../solana/contas';
import { useEnviar } from '../../solana/useEnviar';
import { filtroSituacao, type FiltroSituacao, SoAdministracao, useOpcoesSituacao } from './comum';

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

type Linha = ContaDecodificada<lote.Material>;
type Popup = { tipo: 'novo' } | { tipo: 'editar'; linha: Linha };

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
    const envio = useEnviar();
    const [popup, setPopup] = useState<Popup | null>(null);
    const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
    const opcoesSituacao = useOpcoesSituacao();

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            { id: 'codigo', titulo: t('admin.materiais.codigo'), valor: (l) => l.dados.codigo, numerica: true, largura: 'w-28' },
            { id: 'nome', titulo: t('admin.materiais.nome'), valor: (l) => l.dados.nome },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-36',
                valor: (l) => t(l.dados.ativo ? 'admin.ativo' : 'admin.inativo'),
                celula: (l) => <Situacao ativo={l.dados.ativo} />,
            },
        ],
        [t],
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
            return Promise.all(
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

            {popup && (
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
