import { type Address, address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Copy, Scale } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { coletorRef } from '@clientes/coletor';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { Botao, Campo, Carregando, Resultado, Secao, Selecao, Tabela, Titulo } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useBalancaTeste } from '../../solana/balancaTeste';
import type { AppClient } from '../../solana/cliente';
import { useCadastro } from '../../solana/useCadastro';
import { gramasParaKg, kgParaGramas, useEntregas, useMateriais, useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { rotuloParticipante, SoPapel } from '../admin/comum';

/** Endereço "vazio" (Pubkey::default): entrega ainda sem lote. */
const SEM_LOTE = '11111111111111111111111111111111';
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function Coletas() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-6">
            <Titulo titulo={t('itens.coletas')} descricao={t('descricoes.coletas')} />
            <SoPapel papel="cooperativa" aviso={t('cooperativa.soCooperativa')}>
                <ConteudoColetas />
            </SoPapel>
        </div>
    );
}

/** Situação da balança de teste on-chain: não cadastrada, de outro dono, inativa ou pronta. */
function useSituacaoBalanca(dispositivo: Address | undefined, cooperativa: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(async () => {
        const conta = await lote.fetchMaybeBalanca(client.rpc, await pLote.balanca(dispositivo!));
        if (!conta.exists) return 'naoCadastrada' as const;
        if (conta.data.dono !== cooperativa) return 'outroDono' as const;
        return conta.data.ativa ? ('pronta' as const) : ('inativa' as const);
    }, [client, dispositivo, cooperativa]);
    return useRequest(dispositivo && cooperativa ? fonte : null);
}

function ConteudoColetas() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { carteira } = useCadastro();
    const cooperativa = carteira ? address(carteira) : undefined;
    const { balanca, gerar } = useBalancaTeste(cooperativa);
    const situacao = useSituacaoBalanca(balanca?.address, cooperativa);
    const materiais = useMateriais();
    const participantes = useParticipantes();
    const entregas = useEntregas(cooperativa);
    const envio = useEnviar();

    const coletores = useMemo(
        () => (participantes.data ?? []).filter((p) => p.dados.ativo && p.dados.papel === lote.Papel.Coletor),
        [participantes.data],
    );
    const ativos = useMemo(() => (materiais.data ?? []).filter((m) => m.dados.ativo), [materiais.data]);
    const nomeMaterial = useMemo(
        () => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])),
        [materiais.data],
    );
    // coletor_ref → carteira, para mostrar quem entregou.
    const [refs, setRefs] = useState<Map<string, lote.Participante>>(new Map());
    useEffect(() => {
        let vivo = true;
        void Promise.all(coletores.map(async (c) => [hex(await coletorRef(c.dados.carteira)), c.dados] as const)).then(
            (pares) => vivo && setRefs(new Map(pares)),
        );
        return () => {
            vivo = false;
        };
    }, [coletores]);

    const [coletor, setColetor] = useState('');
    const [material, setMaterial] = useState('');
    const [peso, setPeso] = useState('');
    const pesoG = kgParaGramas(peso);
    const pronta = situacao.data === 'pronta' && !!balanca;

    const registrar = async (e: FormEvent) => {
        e.preventDefault();
        if (!balanca || !cooperativa || !pesoG || !coletor || !material) return;
        const proximo = (entregas.data ?? []).reduce((m, x) => (x.dados.entregaId > m ? x.dados.entregaId : m), 0n) + 1n;
        const codigo = Number(material);
        const entrega = await pLote.entrega(cooperativa, proximo);
        const ts = BigInt(Math.floor(Date.now() / 1000));
        try {
            await envio.dispatchAsync([
                // A balança assina a pesagem; a instrução Ed25519 vai imediatamente antes.
                await instrucaoPesagem(balanca, TipoPesagem.Entrega, entrega, pesoG, ts),
                await lote.getCooperativaRegisterEntregaInstructionAsync({
                    payer: client.payer,
                    cooperativa: client.payer,
                    balanca: await pLote.balanca(balanca.address),
                    materialCadastro: await pLote.material(codigo),
                    entrega,
                    eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    entregaId: proximo,
                    coletorRef: await coletorRef(address(coletor)),
                    material: codigo,
                    pesoG,
                    tsPesagem: ts,
                }),
            ]);
            setPeso('');
            entregas.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    return (
        <>
            <Secao titulo={t('cooperativa.balanca.titulo')}>
                {!balanca ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="max-w-xl text-sm text-texto-suave">{t('cooperativa.balanca.semBalanca')}</p>
                        <Botao onClick={gerar}>
                            <Scale className="size-4" /> {t('cooperativa.balanca.gerar')}
                        </Botao>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 text-sm">
                        <p className="flex flex-wrap items-center gap-2 text-texto">
                            <span className="text-texto-suave">{t('cooperativa.balanca.chave')}</span>
                            <code className="rounded bg-superficie-2 px-2 py-0.5 break-all">{balanca.address}</code>
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard?.writeText(balanca.address).catch(() => {})}
                                aria-label={t('carteira.copiar')}
                                className="rounded p-1 text-texto-suave hover:text-texto"
                            >
                                <Copy className="size-4" />
                            </button>
                        </p>
                        <p className={pronta ? 'text-acento' : 'text-kraft'}>
                            {situacao.data ? t(`cooperativa.balanca.${situacao.data}`) : t('admin.carregando')}
                        </p>
                        {situacao.data && situacao.data !== 'pronta' && (
                            <Botao variante="secundario" className="self-start" onClick={() => situacao.refresh()}>
                                {t('cooperativa.balanca.verificar')}
                            </Botao>
                        )}
                    </div>
                )}
                <p className="mt-3 text-xs text-texto-suave">{t('cooperativa.balanca.aviso')}</p>
            </Secao>

            <Secao titulo={t('cooperativa.coletas.nova')}>
                {coletores.length === 0 && participantes.data ? (
                    <p className="text-sm text-texto-suave">{t('cooperativa.coletas.semColetores')}</p>
                ) : (
                    <form onSubmit={registrar} className="grid gap-4 lg:grid-cols-[1fr_12rem_9rem_auto] lg:items-end">
                        <Selecao rotulo={t('papel.coletor')} required value={coletor} onChange={(e) => setColetor(e.target.value)}>
                            <option value="" disabled>
                                {t('cooperativa.coletas.escolherColetor')}
                            </option>
                            {coletores.map((c) => (
                                <option key={c.endereco} value={c.dados.carteira}>
                                    {rotuloParticipante(c.dados)}
                                </option>
                            ))}
                        </Selecao>
                        <Selecao rotulo={t('cooperativa.material')} required value={material} onChange={(e) => setMaterial(e.target.value)}>
                            <option value="" disabled>
                                {t('cooperativa.escolherMaterial')}
                            </option>
                            {ativos.map((m) => (
                                <option key={m.endereco} value={m.dados.codigo}>
                                    {m.dados.nome}
                                </option>
                            ))}
                        </Selecao>
                        <Campo
                            rotulo={t('cooperativa.pesoKg')}
                            inputMode="decimal"
                            required
                            value={peso}
                            placeholder="0,000"
                            onChange={(e) => setPeso(e.target.value)}
                        />
                        <Botao type="submit" carregando={envio.isRunning} disabled={!pronta || !pesoG || !coletor || !material}>
                            <Scale className="size-4" /> {t('cooperativa.coletas.pesar')}
                        </Botao>
                    </form>
                )}
                {!pronta && balanca && <p className="mt-3 text-sm text-kraft">{t('cooperativa.coletas.balancaNaoPronta')}</p>}
            </Secao>

            <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('cooperativa.coletas.registrada')} />

            {entregas.status === 'fetching' && !entregas.data ? (
                <Carregando />
            ) : (
                <Tabela
                    colunas={['#', t('cooperativa.data'), t('papel.coletor'), t('cooperativa.material'), t('cooperativa.pesoKg'), t('admin.situacao')]}
                    vazio={(entregas.data ?? []).length === 0 ? t('cooperativa.coletas.vazio') : undefined}
                >
                    {(entregas.data ?? []).map(({ endereco, dados }) => {
                        const quem = refs.get(hex(dados.coletorRef));
                        const noLote = dados.lote !== SEM_LOTE;
                        return (
                            <tr key={endereco}>
                                <td className="px-4 py-3 font-semibold tabular-nums text-texto">{dados.entregaId.toString()}</td>
                                <td className="px-4 py-3 text-texto-suave">
                                    {new Date(Number(dados.tsPesagem) * 1000).toLocaleString(idioma, { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                                <td className="px-4 py-3 text-texto" title={quem?.carteira}>
                                    {quem ? rotuloParticipante(quem) : '—'}
                                </td>
                                <td className="px-4 py-3 text-texto">{nomeMaterial.get(dados.material) ?? dados.material}</td>
                                <td className="px-4 py-3 tabular-nums text-texto">{gramasParaKg(dados.pesoG, idioma)}</td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                            noLote ? 'bg-superficie-2 text-texto-suave' : 'bg-acento-suave text-acento'
                                        }`}
                                    >
                                        {noLote ? t('cooperativa.coletas.noLote') : t('cooperativa.coletas.disponivel')}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </Tabela>
            )}
        </>
    );
}
