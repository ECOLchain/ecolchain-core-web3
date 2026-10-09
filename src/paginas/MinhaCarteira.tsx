import { type Address, address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { lote as pLote } from '@clientes/pdas';
import { GestaoCarteiras } from '../componentes/Carteiras';
import { TituloPagina } from '../componentes/pagina';
import { Botao } from '../componentes/ui';
import type { AppClient } from '../solana/cliente';
import { useCadastro } from '../solana/useCadastro';
import { SoPapel } from './admin/comum';

/** Quem mostra o QR e em que momento: o coletor na entrega, o transportador na retirada. */
const USO: Partial<Record<lote.Papel, { papel: string; ajuda: string }>> = {
    [lote.Papel.Coletor]: { papel: 'papel.coletor', ajuda: 'minhaCarteira.ajudaColetor' },
    [lote.Papel.Transportador]: { papel: 'papel.transportador', ajuda: 'minhaCarteira.ajudaTransportador' },
};

export function MinhaCarteira() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.minhaCarteira')} />
            <SoPapel
                papel={['coletor', 'transportador', 'cooperativa', 'cleantech', 'industria', 'importador']}
                aviso={t('minhaCarteira.soParticipante')}
            >
                <ConteudoMinhaCarteira />
            </SoPapel>
        </>
    );
}

function useParticipante(carteira: Address | undefined) {
    const client = useClient<AppClient>();
    const fonte = useCallback(
        async () => lote.fetchMaybeParticipante(client.rpc, await pLote.participante(carteira!)),
        [client, carteira],
    );
    return useRequest(carteira ? fonte : null);
}

/** Endereço em grupos de 4 caracteres: mais fácil de conferir de olho com a tela da cooperativa. */
const emGrupos = (endereco: string) => endereco.match(/.{1,4}/g)?.join(' ') ?? endereco;

/**
 * Cartão do participante para mostrar à cooperativa: o QR Code traz só o endereço da carteira (o
 * mesmo que ela escolheria na lista), então qualquer leitor o entende e nada pessoal é exposto.
 */
function ConteudoMinhaCarteira() {
    const { t } = useTranslation();
    const { carteira, ator, cadastro } = useCadastro();
    // O QR mostra a carteira conectada (a que vai assinar); o cadastro é o do titular que ela representa.
    const participante = useParticipante(ator ? address(ator) : undefined);
    const [copiado, setCopiado] = useState(false);
    if (!carteira) return null;

    const dados = participante.data?.exists ? participante.data.data : undefined;
    const nome = dados ? lerNomeFixo(dados.nome) : '';
    const uso = dados ? USO[dados.papel] : undefined;
    const rotuloPapel = uso ? t(uso.papel) : '';

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(carteira);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {
            // área de transferência indisponível: o endereço continua na tela
        }
    };

    return (
        <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-xl border border-linha bg-superficie p-6 text-center shadow-sm sm:p-8">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold text-texto">{nome || rotuloPapel}</h2>
                <p className="text-sm text-texto-suave">
                    {rotuloPapel}
                    {dados && !dados.ativo && ` (${t('papel.inativo')})`}
                </p>
            </div>

            {/* Fundo branco também no tema escuro: leitores de QR esperam módulos escuros sobre claro. */}
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-linha">
                <QRCodeSVG
                    value={carteira}
                    size={256}
                    level="M"
                    marginSize={2}
                    title={t('minhaCarteira.qrTitulo')}
                    className="block h-auto w-[min(16rem,64vw)]"
                />
            </div>

            <p className="max-w-xs font-medium tracking-wide break-words text-texto tabular-nums">{emGrupos(carteira)}</p>

            <Botao variante="secundario" compacto onClick={copiar}>
                {copiado ? <Check className="size-4 text-acento" /> : <Copy className="size-4" />}
                {copiado ? t('carteira.copiado') : t('carteira.copiar')}
            </Botao>

            {cadastro?.nomeCarteira && <p className="-mt-2 text-sm text-texto-suave">{cadastro.nomeCarteira}</p>}
            {uso && <p className="max-w-sm text-sm text-texto-suave">{t(uso.ajuda)}</p>}

            {dados && (
                <div className="flex w-full flex-col gap-2 border-t border-linha pt-5 text-left">
                    <h3 className="text-base font-semibold text-texto">{t('carteiras.titulo')}</h3>
                    <p className="text-sm text-texto-suave">{t('carteiras.explicacao')}</p>
                    {/* Só o titular gerencia; uma carteira vinculada apenas consulta. */}
                    <GestaoCarteiras participante={dados} podeEditar={carteira === dados.carteira} />
                </div>
            )}
        </section>
    );
}
