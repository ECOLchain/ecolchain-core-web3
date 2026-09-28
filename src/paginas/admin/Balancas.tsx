import { address, type Instruction, isAddress } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Botao, Campo, Carregando, Resultado, Secao, Selecao, Situacao, Tabela, Titulo } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { listarContas } from '../../solana/contas';
import { useEnviar } from '../../solana/useEnviar';
import { abreviar, SoAdministracao } from './comum';
import { useParticipantes } from '../../solana/useDados';
import { chavePapel } from './Participantes';

export function Balancas() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-6">
            <Titulo titulo={t('itens.balancas')} descricao={t('descricoes.balancas')} />
            <SoAdministracao>
                <ConteudoBalancas />
            </SoAdministracao>
        </div>
    );
}

function ConteudoBalancas() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () => listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.BALANCA_DISCRIMINATOR, lote.getBalancaDecoder()),
        [client],
    );
    const lista = useRequest(fonte);
    const participantes = useParticipantes();
    const envio = useEnviar();
    const [dono, setDono] = useState('');
    const [dispositivo, setDispositivo] = useState('');

    // Só cooperativas e indústrias ativas têm balança.
    const donos = useMemo(
        () =>
            (participantes.data ?? []).filter(
                (p) => p.dados.ativo && (p.dados.papel === lote.Papel.Cooperativa || p.dados.papel === lote.Papel.Industria),
            ),
        [participantes.data],
    );
    const papelDe = useMemo(
        () => new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados.papel])),
        [participantes.data],
    );
    const dispositivoValido = isAddress(dispositivo.trim());

    const enviar = async (montar: () => Promise<Instruction>) => {
        try {
            await envio.dispatchAsync([await montar()]);
            lista.refresh();
            return true;
        } catch {
            return false;
        }
    };

    const cadastrar = async (e: FormEvent) => {
        e.preventDefault();
        if (!dono || !dispositivoValido) return;
        const disp = address(dispositivo.trim());
        const ok = await enviar(async () =>
            lote.getOperadorRegisterBalancaInstructionAsync({
                payer: client.payer,
                operador: client.payer,
                donoPart: await pLote.participante(address(dono)),
                balanca: await pLote.balanca(disp),
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                dispositivo: disp,
            }),
        );
        if (ok) setDispositivo('');
    };

    return (
        <>
            <Secao titulo={t('admin.balancas.nova')}>
                {participantes.data && donos.length === 0 ? (
                    <p className="text-sm text-texto-suave">{t('admin.balancas.semDonos')}</p>
                ) : (
                    <form onSubmit={cadastrar} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                        <Selecao rotulo={t('admin.balancas.dono')} required value={dono} onChange={(e) => setDono(e.target.value)}>
                            <option value="" disabled>
                                {t('admin.balancas.escolherDono')}
                            </option>
                            {donos.map((p) => (
                                <option key={p.endereco} value={p.dados.carteira}>
                                    {abreviar(p.dados.carteira)} ({t(chavePapel(p.dados.papel))})
                                </option>
                            ))}
                        </Selecao>
                        <Campo
                            rotulo={t('admin.balancas.dispositivo')}
                            required
                            value={dispositivo}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(e) => setDispositivo(e.target.value)}
                            ajuda={
                                dispositivo !== '' && !dispositivoValido
                                    ? t('admin.participantes.carteiraInvalida')
                                    : t('admin.balancas.dispositivoAjuda')
                            }
                        />
                        <Botao type="submit" carregando={envio.isRunning} disabled={!dono || !dispositivoValido}>
                            {t('admin.balancas.cadastrar')}
                        </Botao>
                    </form>
                )}
            </Secao>

            <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />

            {lista.status === 'fetching' && !lista.data ? (
                <Carregando />
            ) : (
                <Tabela
                    colunas={[t('admin.balancas.dispositivo'), t('admin.balancas.dono'), t('admin.situacao'), '']}
                    vazio={(lista.data ?? []).length === 0 ? t('admin.balancas.vazio') : undefined}
                >
                    {(lista.data ?? []).map(({ endereco, dados }) => {
                        const papel = papelDe.get(dados.dono);
                        return (
                            <tr key={endereco}>
                                <td className="px-4 py-3 font-medium tabular-nums text-texto" title={dados.dispositivo}>
                                    {abreviar(dados.dispositivo)}
                                </td>
                                <td className="px-4 py-3 text-texto" title={dados.dono}>
                                    {abreviar(dados.dono)}
                                    {papel !== undefined && <span className="text-texto-suave"> ({t(chavePapel(papel))})</span>}
                                </td>
                                <td className="px-4 py-3">
                                    <Situacao ativo={dados.ativa} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Botao
                                        variante="secundario"
                                        disabled={envio.isRunning}
                                        onClick={() =>
                                            enviar(async () =>
                                                lote.getOperadorSetBalancaAtivaInstructionAsync({
                                                    operador: client.payer,
                                                    balanca: endereco,
                                                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                                    ativa: !dados.ativa,
                                                }),
                                            )
                                        }
                                    >
                                        {t(dados.ativa ? 'admin.desativar' : 'admin.ativar')}
                                    </Botao>
                                </td>
                            </tr>
                        );
                    })}
                </Tabela>
            )}
        </>
    );
}
