import { type Address, address, isAddress } from '@solana/kit';
import { useClient } from '@solana/react';
import { Pencil, Plus, Power, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { abreviar, CampoNome, nomeAceito } from '../paginas/admin/comum';
import type { AppClient } from '../solana/cliente';
import type { ContaDecodificada } from '../solana/contas';
import { useCarteiras } from '../solana/useDados';
import { useEnviar } from '../solana/useEnviar';
import { LeitorQr } from './LeitorQr';
import { Botao, Campo, Resultado, Situacao } from './ui';

type Carteira = ContaDecodificada<lote.Carteira>;
type Edicao = { tipo: 'nova' } | { tipo: 'nome'; carteira: Carteira } | null;

/**
 * Carteiras de um participante (ADR 0011): cada uma com nome, todas assinando pelo ator. A carteira
 * conectada assina como operador ou como o próprio titular; carteira vinculada só consulta.
 */
export function GestaoCarteiras({ participante, podeEditar }: { participante: lote.Participante; podeEditar: boolean }) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const titular = participante.carteira;
    const lista = useCarteiras(titular);
    const envio = useEnviar();
    const [edicao, setEdicao] = useState<Edicao>(null);
    const [nome, setNome] = useState('');
    const [endereco, setEndereco] = useState('');
    const [lendoQr, setLendoQr] = useState(false);

    const registros = lista.data ?? [];
    const registroTitular = registros.find((c) => c.dados.endereco === titular);
    const vinculadas = registros.filter((c) => c.dados.endereco !== titular);
    const enderecoValido = isAddress(endereco.trim());

    const enviar = async (ix: () => Promise<Parameters<typeof envio.dispatchAsync>[0][number]>) => {
        try {
            await envio.dispatchAsync([await ix()]);
            setEdicao(null);
            lista.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };
    const ev = () => eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
    const incluir = (alvo: Address, nomeNovo: string) =>
        enviar(async () =>
            lote.getParticipanteAddCarteiraInstructionAsync({
                payer: client.payer,
                autoridade: client.payer,
                participante: await pLote.participante(titular),
                enderecoPart: await pLote.participante(alvo),
                carteira: await pLote.carteira(alvo),
                eventAuthority: await ev(),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                endereco: alvo,
                nome: nomeNovo,
            }),
        );
    const atualizar = (c: Carteira, nomeNovo: string, ativa: boolean) =>
        enviar(async () =>
            lote.getParticipanteUpdateCarteiraInstructionAsync({
                autoridade: client.payer,
                participante: await pLote.participante(titular),
                carteira: c.endereco,
                eventAuthority: await ev(),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                nome: nomeNovo,
                ativa,
            }),
        );

    const abrir = (e: Edicao) => {
        envio.reset();
        setEdicao(e);
        setNome(e?.tipo === 'nome' ? lerNomeFixo(e.carteira.dados.nome) : '');
        setEndereco('');
        setLendoQr(false);
    };
    const salvar = () => {
        if (!nomeAceito(nome)) return;
        if (edicao?.tipo === 'nome') void atualizar(edicao.carteira, nome.trim(), edicao.carteira.dados.ativa);
        else if (edicao?.tipo === 'nova' && enderecoValido) void incluir(address(endereco.trim()), nome.trim());
    };

    return (
        <div className="flex flex-col gap-3">
            <Resultado assinatura={edicao ? undefined : envio.data} erro={envio.error} sucesso={t('admin.salvo')} />
            <ul className="divide-y divide-linha rounded-lg border border-linha">
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                    <span className="font-semibold text-texto">
                        {(registroTitular && lerNomeFixo(registroTitular.dados.nome)) || t('carteiras.titular')}
                    </span>
                    <span className="rounded-full bg-acento-suave px-2 py-0.5 text-xs font-semibold text-acento">{t('carteiras.titular')}</span>
                    <span className="tabular-nums text-texto-suave" title={titular}>
                        {abreviar(titular)}
                    </span>
                    {podeEditar && (
                        <Botao
                            compacto
                            variante="secundario"
                            className="ml-auto"
                            onClick={() =>
                                registroTitular
                                    ? abrir({ tipo: 'nome', carteira: registroTitular })
                                    : (abrir({ tipo: 'nova' }), setEndereco(titular))
                            }
                        >
                            <Pencil className="size-4" /> {t('carteiras.nomear')}
                        </Botao>
                    )}
                </li>
                {vinculadas.map((c) => (
                    <li key={c.endereco} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                        <span className="font-semibold text-texto">{lerNomeFixo(c.dados.nome)}</span>
                        <span className="tabular-nums text-texto-suave" title={c.dados.endereco}>
                            {abreviar(c.dados.endereco)}
                        </span>
                        <Situacao ativo={c.dados.ativa} />
                        {podeEditar && (
                            <span className="ml-auto flex gap-2">
                                <Botao compacto variante="secundario" onClick={() => abrir({ tipo: 'nome', carteira: c })}>
                                    <Pencil className="size-4" /> {t('admin.editar')}
                                </Botao>
                                <Botao
                                    compacto
                                    variante="secundario"
                                    carregando={envio.isRunning && !edicao}
                                    onClick={() => void atualizar(c, lerNomeFixo(c.dados.nome), !c.dados.ativa)}
                                >
                                    <Power className="size-4" /> {t(c.dados.ativa ? 'admin.desativar' : 'admin.ativar')}
                                </Botao>
                            </span>
                        )}
                    </li>
                ))}
                {lista.data && vinculadas.length === 0 && (
                    <li className="px-3 py-2.5 text-sm text-texto-suave">{t('carteiras.nenhumaVinculada')}</li>
                )}
            </ul>

            {podeEditar && !edicao && (
                <div>
                    <Botao compacto onClick={() => abrir({ tipo: 'nova' })}>
                        <Plus className="size-4" /> {t('carteiras.vincular')}
                    </Botao>
                </div>
            )}

            {edicao && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        salvar();
                    }}
                    className="flex flex-col gap-3 rounded-lg border border-linha bg-fundo p-3"
                >
                    {edicao.tipo === 'nova' && endereco !== titular && (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                                <Campo
                                    rotulo={t('carteiras.endereco')}
                                    required
                                    value={endereco}
                                    spellCheck={false}
                                    autoComplete="off"
                                    onChange={(e) => setEndereco(e.target.value)}
                                    aria-invalid={endereco !== '' && !enderecoValido}
                                    ajuda={endereco !== '' && !enderecoValido ? t('admin.participantes.carteiraInvalida') : t('carteiras.enderecoAjuda')}
                                />
                                <Botao type="button" variante="secundario" className="mb-5 h-10" onClick={() => setLendoQr((v) => !v)}>
                                    <ScanLine className="size-4" /> {t('cooperativa.coletas.lerQr')}
                                </Botao>
                            </div>
                            {lendoQr && (
                                <LeitorQr
                                    aoLer={(texto) => {
                                        setEndereco(texto);
                                        setLendoQr(false);
                                    }}
                                    aoCancelar={() => setLendoQr(false)}
                                    instrucao={t('leitorQr.aponte')}
                                />
                            )}
                        </div>
                    )}
                    <CampoNome
                        valor={nome}
                        onChange={setNome}
                        rotulo={t('carteiras.nome')}
                        exemplo={t('carteiras.nomeExemplo')}
                        ajuda={t('carteiras.nomeAjuda')}
                    />
                    <div className="flex justify-end gap-2">
                        <Botao type="button" compacto variante="secundario" onClick={() => setEdicao(null)}>
                            {t('admin.cancelar')}
                        </Botao>
                        <Botao
                            type="submit"
                            compacto
                            carregando={envio.isRunning}
                            disabled={!nomeAceito(nome) || (edicao.tipo === 'nova' && !enderecoValido)}
                        >
                            {t('admin.salvar')}
                        </Botao>
                    </div>
                </form>
            )}
        </div>
    );
}
