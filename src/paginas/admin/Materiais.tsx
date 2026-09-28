import type { Instruction } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Check, Pencil, X } from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Botao, Campo, Carregando, Resultado, Secao, Situacao, Tabela, Titulo } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { listarContas } from '../../solana/contas';
import { useEnviar } from '../../solana/useEnviar';
import { SoAdministracao } from './comum';

/** Materiais conhecidos desde o início do projeto (a antiga lista fixa do programa), com códigos 1 a 6. */
const MATERIAIS_PADRAO = [
    { codigo: 1, chave: 'plastico' },
    { codigo: 2, chave: 'papel' },
    { codigo: 3, chave: 'vidro' },
    { codigo: 4, chave: 'aluminio' },
    { codigo: 5, chave: 'metal' },
    { codigo: 6, chave: 'outros' },
] as const;

export function Materiais() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-6">
            <Titulo titulo={t('itens.materiais')} descricao={t('descricoes.materiais')} />
            <SoAdministracao>
                <ConteudoMateriais />
            </SoAdministracao>
        </div>
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
    const materiais = useMemo(
        () => [...(lista.data ?? [])].sort((a, b) => a.dados.codigo - b.dados.codigo),
        [lista.data],
    );
    const proximoCodigo = materiais.reduce((m, x) => Math.max(m, x.dados.codigo), 0) + 1;
    const envio = useEnviar();
    const [nome, setNome] = useState('');
    const [codigo, setCodigo] = useState('');
    const [editando, setEditando] = useState<{ codigo: number; nome: string } | null>(null);

    const enviar = async (montar: () => Promise<Instruction>) => {
        try {
            await envio.dispatchAsync([await montar()]);
            lista.refresh();
            return true;
        } catch {
            return false; // o erro fica em envio.error
        }
    };

    // Padrões ainda não cadastrados (por código): todos numa transação só, uma assinatura.
    const faltando = MATERIAIS_PADRAO.filter((m) => !materiais.some((x) => x.dados.codigo === m.codigo));
    const cadastrarPadrao = async () => {
        try {
            const ev = await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
            const instrucoes = await Promise.all(
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
            await envio.dispatchAsync(instrucoes);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    const criar = async (e: FormEvent) => {
        e.preventDefault();
        const cod = Number(codigo || proximoCodigo);
        const ok = await enviar(async () =>
            lote.getOperadorCreateMaterialInstructionAsync({
                    payer: client.payer,
                    operador: client.payer,
                    material: await pLote.material(cod),
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    codigo: cod,
                    nome: nome.trim(),
                }),
        );
        if (ok) {
            setNome('');
            setCodigo('');
        }
    };

    const atualizar = (cod: number, novoNome: string, ativo: boolean) =>
        enviar(async () =>
            lote.getOperadorUpdateMaterialInstructionAsync({
                    operador: client.payer,
                    material: await pLote.material(cod),
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    nome: novoNome.trim(),
                    ativo,
                }),
        );

    return (
        <>
            {lista.data && faltando.length > 0 && (
                <Secao titulo={t('admin.materiais.padraoTitulo')}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <ul className="flex flex-wrap gap-2">
                            {faltando.map((m) => (
                                <li key={m.codigo} className="rounded-full bg-superficie-2 px-3 py-1 text-sm text-texto">
                                    <span className="font-semibold tabular-nums text-kraft">{m.codigo}</span>{' '}
                                    {t(`admin.materiais.padrao.${m.chave}`)}
                                </li>
                            ))}
                        </ul>
                        <Botao carregando={envio.isRunning} onClick={cadastrarPadrao}>
                            {t('admin.materiais.padraoBotao', { n: faltando.length })}
                        </Botao>
                    </div>
                </Secao>
            )}
            <Secao titulo={t('admin.materiais.novo')}>
                <form onSubmit={criar} className="grid gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                    <Campo
                        rotulo={t('admin.materiais.codigo')}
                        type="number"
                        min={1}
                        max={65535}
                        value={codigo}
                        placeholder={String(proximoCodigo)}
                        onChange={(e) => setCodigo(e.target.value)}
                    />
                    <Campo
                        rotulo={t('admin.materiais.nome')}
                        required
                        maxLength={32}
                        value={nome}
                        placeholder={t('admin.materiais.exemplo')}
                        onChange={(e) => setNome(e.target.value)}
                    />
                    <Botao type="submit" carregando={envio.isRunning} disabled={!nome.trim()}>
                        {t('admin.materiais.cadastrar')}
                    </Botao>
                </form>
            </Secao>

            <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />

            {lista.status === 'fetching' && !lista.data ? (
                <Carregando />
            ) : (
                <Tabela
                    colunas={[t('admin.materiais.codigo'), t('admin.materiais.nome'), t('admin.situacao'), '']}
                    vazio={materiais.length === 0 ? t('admin.materiais.vazio') : undefined}
                >
                    {materiais.map(({ endereco, dados }) => (
                        <tr key={endereco}>
                            <td className="px-4 py-3 font-semibold tabular-nums text-texto">{dados.codigo}</td>
                            <td className="px-4 py-3 text-texto">
                                {editando?.codigo === dados.codigo ? (
                                    <input
                                        autoFocus
                                        maxLength={32}
                                        value={editando.nome}
                                        aria-label={t('admin.materiais.nome')}
                                        onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                                        className="h-9 w-full rounded-lg border border-acento bg-fundo px-2 text-sm"
                                    />
                                ) : (
                                    dados.nome
                                )}
                            </td>
                            <td className="px-4 py-3">
                                <Situacao ativo={dados.ativo} />
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                    {editando?.codigo === dados.codigo ? (
                                        <>
                                            <Botao
                                                variante="secundario"
                                                aria-label={t('admin.salvar')}
                                                disabled={!editando.nome.trim() || envio.isRunning}
                                                onClick={async () => {
                                                    if (await atualizar(dados.codigo, editando.nome, dados.ativo)) setEditando(null);
                                                }}
                                            >
                                                <Check className="size-4" /> {t('admin.salvar')}
                                            </Botao>
                                            <Botao variante="secundario" aria-label={t('admin.cancelar')} onClick={() => setEditando(null)}>
                                                <X className="size-4" />
                                            </Botao>
                                        </>
                                    ) : (
                                        <>
                                            <Botao
                                                variante="secundario"
                                                disabled={envio.isRunning}
                                                onClick={() => setEditando({ codigo: dados.codigo, nome: dados.nome })}
                                            >
                                                <Pencil className="size-4" /> {t('admin.renomear')}
                                            </Botao>
                                            <Botao
                                                variante="secundario"
                                                disabled={envio.isRunning}
                                                onClick={() => atualizar(dados.codigo, dados.nome, !dados.ativo)}
                                            >
                                                {t(dados.ativo ? 'admin.desativar' : 'admin.ativar')}
                                            </Botao>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </Tabela>
            )}
        </>
    );
}
