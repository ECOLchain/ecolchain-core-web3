import { address, type Instruction, isAddress } from '@solana/kit';
import { useClient } from '@solana/react';
import { type FormEvent, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { bytesDoNome, lerNomeParticipante, PARTICIPANTE_NOME_MAX } from '@clientes/participante';
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
    const [nome, setNome] = useState('');
    const [referencia, setReferencia] = useState('');
    const [editando, setEditando] = useState<string | null>(null);
    const [novoNome, setNovoNome] = useState('');
    const participantes = useMemo(
        () => [...(lista.data ?? [])].sort((a, b) => a.dados.papel - b.dados.papel || a.endereco.localeCompare(b.endereco)),
        [lista.data],
    );
    const carteiraValida = isAddress(carteira.trim());
    const nomeValido = nomeAceito(nome);

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
        if (!carteiraValida || !nomeValido) return;
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
                nome: nome.trim(),
            }),
        );
        if (ok) {
            setCarteira('');
            setNome('');
            setReferencia('');
        }
    };

    return (
        <>
            <Secao titulo={t('admin.participantes.novo')}>
                <form onSubmit={cadastrar} className="grid gap-4 lg:grid-cols-[1fr_1fr_12rem] lg:items-end">
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
                    <CampoNome valor={nome} onChange={setNome} />
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
                    <div className="lg:col-span-2">
                        <Campo
                            rotulo={t('admin.participantes.referencia')}
                            value={referencia}
                            ajuda={t('admin.participantes.referenciaAjuda')}
                            onChange={(e) => setReferencia(e.target.value)}
                        />
                    </div>
                    <Botao type="submit" carregando={envio.isRunning} disabled={!carteiraValida || !nomeValido}>
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
                    colunas={[t('admin.participantes.nome'), t('admin.participantes.carteira'), t('admin.participantes.papel'), t('admin.situacao'), '']}
                    vazio={participantes.length === 0 ? t('admin.participantes.vazio') : undefined}
                >
                    {participantes.map(({ endereco, dados }) => (
                        <tr key={endereco}>
                            <td className="px-4 py-3 font-medium text-texto">
                                {editando === endereco ? (
                                    <form
                                        className="flex items-end gap-2"
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!nomeAceito(novoNome)) return;
                                            const ok = await enviar(async () =>
                                                lote.getOperadorSetParticipanteNomeInstructionAsync({
                                                    operador: client.payer,
                                                    participante: endereco,
                                                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                                    nome: novoNome.trim(),
                                                }),
                                            );
                                            if (ok) setEditando(null);
                                        }}
                                    >
                                        <CampoNome valor={novoNome} onChange={setNovoNome} compacto />
                                        <Botao type="submit" carregando={envio.isRunning} disabled={!nomeAceito(novoNome)}>
                                            {t('admin.salvar')}
                                        </Botao>
                                        <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>
                                            {t('admin.cancelar')}
                                        </Botao>
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded text-left hover:text-acento focus-visible:outline-2 focus-visible:outline-acento"
                                        title={t('admin.renomear')}
                                        onClick={() => {
                                            setNovoNome(lerNomeParticipante(dados.nome));
                                            setEditando(endereco);
                                        }}
                                    >
                                        {lerNomeParticipante(dados.nome) || <span className="text-texto-suave">{t('admin.participantes.semNome')}</span>}
                                        <Pencil className="size-3.5 text-texto-suave" aria-hidden="true" />
                                    </button>
                                )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-texto" title={dados.carteira}>
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

/** O programa aceita até 32 bytes UTF-8, sem ficar vazio. */
const nomeAceito = (nome: string) => nome.trim() !== '' && bytesDoNome(nome.trim()) <= PARTICIPANTE_NOME_MAX;

function CampoNome({ valor, onChange, compacto }: { valor: string; onChange: (v: string) => void; compacto?: boolean }) {
    const { t } = useTranslation();
    const longo = bytesDoNome(valor.trim()) > PARTICIPANTE_NOME_MAX;
    return (
        <Campo
            rotulo={compacto ? '' : t('admin.participantes.nome')}
            aria-label={t('admin.participantes.nome')}
            required
            value={valor}
            autoComplete="off"
            placeholder={t('admin.participantes.nomeExemplo')}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={longo}
            ajuda={longo ? t('admin.participantes.nomeLongo') : compacto ? undefined : t('admin.participantes.nomeAjuda')}
        />
    );
}
