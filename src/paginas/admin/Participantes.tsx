import { address, type Instruction, isAddress } from '@solana/kit';
import { useClient } from '@solana/react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Botao, Campo, Carregando, Resultado, Secao, Selecao, Situacao, Tabela, Titulo } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { abreviar, sha256, SoAdministracao } from './comum';

/** Papéis de participante, na ordem do fluxo físico, com a chave de tradução. */
export const PAPEIS = [
    { valor: lote.Papel.Coletor, chave: 'papel.coletor' },
    { valor: lote.Papel.Cooperativa, chave: 'papel.cooperativa' },
    { valor: lote.Papel.Transportador, chave: 'papel.transportador' },
    { valor: lote.Papel.Industria, chave: 'papel.industria' },
] as const;
export const chavePapel = (p: lote.Papel) => PAPEIS.find((x) => x.valor === p)?.chave ?? '';

export function Participantes() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-6">
            <Titulo titulo={t('itens.participantes')} descricao={t('descricoes.participantes')} />
            <SoAdministracao>
                <ConteudoParticipantes />
            </SoAdministracao>
        </div>
    );
}

function ConteudoParticipantes() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const lista = useParticipantes();
    const envio = useEnviar();
    const [carteira, setCarteira] = useState('');
    const [papel, setPapel] = useState<lote.Papel>(lote.Papel.Cooperativa);
    const [referencia, setReferencia] = useState('');
    const participantes = useMemo(
        () => [...(lista.data ?? [])].sort((a, b) => a.dados.papel - b.dados.papel || a.endereco.localeCompare(b.endereco)),
        [lista.data],
    );
    const carteiraValida = isAddress(carteira.trim());

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
        if (!carteiraValida) return;
        const alvo = address(carteira.trim());
        const ok = await enviar(async () =>
            lote.getOperadorRegisterParticipanteInstructionAsync({
                payer: client.payer,
                operador: client.payer,
                participante: await pLote.participante(alvo),
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                carteira: alvo,
                papel,
                // On-chain vai só o hash da referência do cadastro (LGPD).
                kycHash: await sha256(referencia.trim() || `cadastro:${alvo}`),
            }),
        );
        if (ok) {
            setCarteira('');
            setReferencia('');
        }
    };

    return (
        <>
            <Secao titulo={t('admin.participantes.novo')}>
                <form onSubmit={cadastrar} className="grid gap-4 lg:grid-cols-[1fr_12rem] lg:items-end">
                    <Campo
                        rotulo={t('admin.participantes.carteira')}
                        required
                        value={carteira}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={t('admin.participantes.carteiraExemplo')}
                        onChange={(e) => setCarteira(e.target.value)}
                        aria-invalid={carteira !== '' && !carteiraValida}
                        ajuda={carteira !== '' && !carteiraValida ? t('admin.participantes.carteiraInvalida') : undefined}
                    />
                    <Selecao
                        rotulo={t('admin.participantes.papel')}
                        value={papel}
                        onChange={(e) => setPapel(Number(e.target.value) as lote.Papel)}
                    >
                        {PAPEIS.map((p) => (
                            <option key={p.valor} value={p.valor}>
                                {t(p.chave)}
                            </option>
                        ))}
                    </Selecao>
                    <Campo
                        rotulo={t('admin.participantes.referencia')}
                        value={referencia}
                        ajuda={t('admin.participantes.referenciaAjuda')}
                        onChange={(e) => setReferencia(e.target.value)}
                    />
                    <Botao type="submit" carregando={envio.isRunning} disabled={!carteiraValida}>
                        {t('admin.participantes.cadastrar')}
                    </Botao>
                </form>
                <p className="mt-4 text-sm text-texto-suave">{t('admin.participantes.umPapel')}</p>
            </Secao>

            <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />

            {lista.status === 'fetching' && !lista.data ? (
                <Carregando />
            ) : (
                <Tabela
                    colunas={[t('admin.participantes.carteira'), t('admin.participantes.papel'), t('admin.situacao'), '']}
                    vazio={participantes.length === 0 ? t('admin.participantes.vazio') : undefined}
                >
                    {participantes.map(({ endereco, dados }) => (
                        <tr key={endereco}>
                            <td className="px-4 py-3 font-medium tabular-nums text-texto" title={dados.carteira}>
                                {abreviar(dados.carteira)}
                            </td>
                            <td className="px-4 py-3 text-texto">{t(chavePapel(dados.papel))}</td>
                            <td className="px-4 py-3">
                                <Situacao ativo={dados.ativo} />
                            </td>
                            <td className="px-4 py-3 text-right">
                                <Botao
                                    variante="secundario"
                                    disabled={envio.isRunning}
                                    onClick={() =>
                                        enviar(async () =>
                                            lote.getOperadorSetParticipanteAtivoInstructionAsync({
                                                operador: client.payer,
                                                participante: endereco,
                                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                                ativo: !dados.ativo,
                                            }),
                                        )
                                    }
                                >
                                    {t(dados.ativo ? 'admin.desativar' : 'admin.ativar')}
                                </Botao>
                            </td>
                        </tr>
                    ))}
                </Tabela>
            )}
        </>
    );
}
