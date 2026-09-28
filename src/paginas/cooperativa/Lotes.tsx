import { type Address, address, type Instruction } from '@solana/kit';
import { useClient } from '@solana/react';
import { Megaphone, Package, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { comContasGravaveis, instrucaoPesagem, TipoPesagem } from '@clientes/pesagem';
import { Botao, Campo, Carregando, Resultado, Secao, Selecao, Tabela, Titulo } from '../../componentes/ui';
import { usePreferencias } from '../../preferencias/Preferencias';
import { useBalancaTeste } from '../../solana/balancaTeste';
import type { AppClient } from '../../solana/cliente';
import { useCadastro } from '../../solana/useCadastro';
import { gramasParaKg, kgParaGramas, useEntregas, useLotes, useMateriais } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import { SoPapel } from '../admin/comum';

const SEM_LOTE = '11111111111111111111111111111111';
/** Limite do programa por transação ao vincular entregas. */
const ENTREGAS_POR_TX = 10;

export function Lotes() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-6">
            <Titulo titulo={t('itens.lotes')} descricao={t('descricoes.lotes')} />
            <SoPapel papel="cooperativa" aviso={t('cooperativa.soCooperativa')}>
                <ConteudoLotes />
            </SoPapel>
        </div>
    );
}

function ConteudoLotes() {
    const { t } = useTranslation();
    const { idioma } = usePreferencias();
    const client = useClient<AppClient>();
    const { carteira } = useCadastro();
    const cooperativa = carteira ? address(carteira) : undefined;
    const { balanca } = useBalancaTeste(cooperativa);
    const materiais = useMateriais();
    const entregas = useEntregas(cooperativa);
    const lotes = useLotes(cooperativa);
    const envio = useEnviar();
    const [progresso, setProgresso] = useState<string | null>(null);

    const nomeMaterial = useMemo(
        () => new Map((materiais.data ?? []).map((m) => [m.dados.codigo, m.dados.nome])),
        [materiais.data],
    );

    // ---- montagem ----
    const [material, setMaterial] = useState('');
    const disponiveis = useMemo(
        () => (entregas.data ?? []).filter((e) => e.dados.lote === SEM_LOTE && String(e.dados.material) === material),
        [entregas.data, material],
    );
    const [marcadas, setMarcadas] = useState<Set<Address>>(new Set());
    const escolhidas = disponiveis.filter((e) => marcadas.has(e.endereco));
    const soma = escolhidas.reduce((a, e) => a + e.dados.pesoG, 0n);
    const [pesoFardo, setPesoFardo] = useState('');
    const [evidencias, setEvidencias] = useState('');
    const pesoG = pesoFardo ? kgParaGramas(pesoFardo) : soma > 0n ? soma : null;

    const alternar = (e: Address) =>
        setMarcadas((m) => {
            const n = new Set(m);
            if (n.has(e)) n.delete(e);
            else n.add(e);
            return n;
        });

    const montar = async (ev: FormEvent) => {
        ev.preventDefault();
        if (!balanca || !cooperativa || !pesoG || escolhidas.length === 0) return;
        const loteId = (lotes.data ?? []).reduce((m, x) => (x.dados.loteId > m ? x.dados.loteId : m), 0n) + 1n;
        const codigo = Number(material);
        const lotePda = await pLote.lote(cooperativa, loteId);
        const ev0 = await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS);
        const ts = BigInt(Math.floor(Date.now() / 1000));
        const hash = new Uint8Array(
            await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidencias.trim() || `lote:${cooperativa}:${loteId}`)),
        );
        const lotesDeEntregas: Address[][] = [];
        for (let i = 0; i < escolhidas.length; i += ENTREGAS_POR_TX) {
            lotesDeEntregas.push(escolhidas.slice(i, i + ENTREGAS_POR_TX).map((e) => e.endereco));
        }
        const total = 1 + lotesDeEntregas.length;
        try {
            // 1) Pesagem do lote montado (fardo), assinada pela balança, e criação do lote.
            setProgresso(t('cooperativa.lotes.passo', { n: 1, total }));
            await envio.dispatchAsync([
                await instrucaoPesagem(balanca, TipoPesagem.Origem, lotePda, pesoG, ts),
                await lote.getCooperativaCreateLoteInstructionAsync({
                    payer: client.payer,
                    cooperativa: client.payer,
                    balanca: await pLote.balanca(balanca.address),
                    materialCadastro: await pLote.material(codigo),
                    lote: lotePda,
                    eventAuthority: ev0,
                    program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    loteId,
                    material: codigo,
                    pesoG,
                    tsPesagem: ts,
                    evidenciasHash: hash,
                    // Metadados do recibo (Core asset); na devnet, um endereço de referência.
                    uri: `https://ecolchain.dev/lotes/${cooperativa}/${loteId}.json`,
                }),
            ]);
            // 2) Vinculação das entregas, até 10 por transação.
            for (const [i, grupo] of lotesDeEntregas.entries()) {
                setProgresso(t('cooperativa.lotes.passo', { n: i + 2, total }));
                const ix: Instruction = comContasGravaveis(
                    await lote.getCooperativaAddEntregasInstructionAsync({
                        cooperativa: client.payer,
                        lote: lotePda,
                        eventAuthority: ev0,
                        program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                    }),
                    grupo,
                );
                await envio.dispatchAsync([ix]);
            }
            setMarcadas(new Set());
            setPesoFardo('');
            setEvidencias('');
        } catch {
            // o erro fica em envio.error
        } finally {
            setProgresso(null);
            entregas.refresh();
            lotes.refresh();
        }
    };

    // ---- anúncio ----
    const [anunciando, setAnunciando] = useState<Address | null>(null);
    const [dias, setDias] = useState('7');
    const [preco, setPreco] = useState('');

    const acaoLote = async (montarIx: () => Promise<Instruction>) => {
        try {
            await envio.dispatchAsync([await montarIx()]);
            setAnunciando(null);
            lotes.refresh();
        } catch {
            // o erro fica em envio.error
        }
    };

    const anunciar = (lotePda: Address) => (ev: FormEvent) => {
        ev.preventDefault();
        const centavos = Math.round(Number(preco.replace(',', '.')) * 100);
        const prazo = BigInt(Math.floor(Date.now() / 1000) + Number(dias) * 86_400);
        void acaoLote(async () =>
            lote.getCooperativaListLoteInstructionAsync({
                cooperativa: client.payer,
                lote: lotePda,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                prazoLeilao: prazo,
                precoMinimoCentavos: BigInt(centavos),
            }),
        );
    };

    const cancelar = (lotePda: Address) =>
        acaoLote(async () =>
            lote.getCooperativaCancelAnuncioInstructionAsync({
                cooperativa: client.payer,
                lote: lotePda,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
            }),
        );

    const precoValido = Number(preco.replace(',', '.')) > 0;
    const diasValidos = Number(dias) >= 1 && Number(dias) <= 90;

    return (
        <>
            <Secao titulo={t('cooperativa.lotes.montar')}>
                {!balanca ? (
                    <p className="text-sm text-kraft">{t('cooperativa.lotes.semBalanca')}</p>
                ) : (
                    <form onSubmit={montar} className="flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
                            <Selecao
                                rotulo={t('cooperativa.material')}
                                required
                                value={material}
                                onChange={(e) => {
                                    setMaterial(e.target.value);
                                    setMarcadas(new Set());
                                }}
                            >
                                <option value="" disabled>
                                    {t('cooperativa.escolherMaterial')}
                                </option>
                                {(materiais.data ?? [])
                                    .filter((m) => m.dados.ativo)
                                    .map((m) => (
                                        <option key={m.endereco} value={m.dados.codigo}>
                                            {m.dados.nome}
                                        </option>
                                    ))}
                            </Selecao>
                            <Campo
                                rotulo={t('cooperativa.lotes.evidencias')}
                                value={evidencias}
                                ajuda={t('cooperativa.lotes.evidenciasAjuda')}
                                onChange={(e) => setEvidencias(e.target.value)}
                            />
                        </div>

                        {material && (
                            <fieldset className="flex flex-col gap-2">
                                <legend className="mb-2 text-sm font-medium text-texto">{t('cooperativa.lotes.escolherEntregas')}</legend>
                                {disponiveis.length === 0 ? (
                                    <p className="text-sm text-texto-suave">{t('cooperativa.lotes.semEntregas')}</p>
                                ) : (
                                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {disponiveis.map((e) => (
                                            <li key={e.endereco}>
                                                <label
                                                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                                        marcadas.has(e.endereco)
                                                            ? 'border-acento bg-acento-suave text-texto'
                                                            : 'border-linha text-texto-suave hover:border-texto-suave'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={marcadas.has(e.endereco)}
                                                        onChange={() => alternar(e.endereco)}
                                                        className="accent-[var(--cor-acento)]"
                                                    />
                                                    <span className="font-semibold tabular-nums">#{e.dados.entregaId.toString()}</span>
                                                    <span className="tabular-nums">{gramasParaKg(e.dados.pesoG, idioma)} kg</span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </fieldset>
                        )}

                        {escolhidas.length > 0 && (
                            <div className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                                <p className="text-sm text-texto">
                                    {t('cooperativa.lotes.resumo', { n: escolhidas.length, kg: gramasParaKg(soma, idioma) })}
                                </p>
                                <Campo
                                    rotulo={t('cooperativa.lotes.pesoFardo')}
                                    inputMode="decimal"
                                    value={pesoFardo}
                                    placeholder={gramasParaKg(soma, idioma)}
                                    ajuda={t('cooperativa.lotes.pesoFardoAjuda')}
                                    onChange={(e) => setPesoFardo(e.target.value)}
                                />
                                <Botao type="submit" carregando={envio.isRunning} disabled={!pesoG}>
                                    <Package className="size-4" /> {t('cooperativa.lotes.criar')}
                                </Botao>
                            </div>
                        )}
                        {progresso && <p className="text-sm text-kraft">{progresso}</p>}
                    </form>
                )}
            </Secao>

            <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />

            {lotes.status === 'fetching' && !lotes.data ? (
                <Carregando />
            ) : (
                <Tabela
                    colunas={['#', t('cooperativa.material'), t('cooperativa.pesoKg'), t('cooperativa.lotes.entregas'), t('cooperativa.lotes.estado'), '']}
                    vazio={(lotes.data ?? []).length === 0 ? t('cooperativa.lotes.vazio') : undefined}
                >
                    {(lotes.data ?? []).map(({ endereco, dados }) => {
                        const estado = dados.estado.__kind;
                        return (
                            <tr key={endereco} className="align-top">
                                <td className="px-4 py-3 font-semibold tabular-nums text-texto">{dados.loteId.toString()}</td>
                                <td className="px-4 py-3 text-texto">{nomeMaterial.get(dados.material) ?? dados.material}</td>
                                <td className="px-4 py-3 tabular-nums text-texto">{gramasParaKg(dados.pesoG, idioma)}</td>
                                <td className="px-4 py-3 tabular-nums text-texto-suave">
                                    {dados.qtdEntregas} ({gramasParaKg(dados.pesoEntregasG, idioma)} kg)
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs font-semibold text-texto">
                                        {t(`estadoLote.${estado}`)}
                                    </span>
                                    {dados.estado.__kind === 'Anunciado' && (
                                        <p className="mt-1 text-xs text-texto-suave">
                                            {t('cooperativa.lotes.ate', {
                                                data: new Date(Number(dados.estado.prazoLeilao) * 1000).toLocaleDateString(idioma),
                                                preco: (Number(dados.precoMinimoCentavos) / 100).toLocaleString(idioma, {
                                                    style: 'currency',
                                                    currency: 'BRL',
                                                }),
                                            })}
                                        </p>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {(estado === 'Criado' || estado === 'SemLance') &&
                                        (anunciando === endereco ? (
                                            <form onSubmit={anunciar(endereco)} className="flex flex-wrap items-end justify-end gap-2">
                                                <Campo
                                                    rotulo={t('cooperativa.lotes.precoMinimo')}
                                                    inputMode="decimal"
                                                    required
                                                    value={preco}
                                                    onChange={(e) => setPreco(e.target.value)}
                                                    className="w-28"
                                                />
                                                <Campo
                                                    rotulo={t('cooperativa.lotes.dias')}
                                                    type="number"
                                                    min={1}
                                                    max={90}
                                                    value={dias}
                                                    onChange={(e) => setDias(e.target.value)}
                                                    className="w-20"
                                                />
                                                <Botao type="submit" carregando={envio.isRunning} disabled={!precoValido || !diasValidos}>
                                                    {t('cooperativa.lotes.anunciar')}
                                                </Botao>
                                                <Botao variante="secundario" aria-label={t('admin.cancelar')} onClick={() => setAnunciando(null)}>
                                                    <X className="size-4" />
                                                </Botao>
                                            </form>
                                        ) : (
                                            <div className="flex justify-end">
                                                <Botao variante="secundario" disabled={dados.qtdEntregas === 0} onClick={() => setAnunciando(endereco)}>
                                                    <Megaphone className="size-4" /> {t('cooperativa.lotes.anunciar')}
                                                </Botao>
                                            </div>
                                        ))}
                                    {estado === 'Anunciado' && (
                                        <div className="flex justify-end">
                                            <Botao variante="secundario" disabled={envio.isRunning} onClick={() => cancelar(endereco)}>
                                                {t('cooperativa.lotes.cancelarAnuncio')}
                                            </Botao>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </Tabela>
            )}
        </>
    );
}
