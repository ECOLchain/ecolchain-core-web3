import type { Address } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Copy, Scale } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lote as pLote } from '@clientes/pdas';
import { useBalancaTeste } from '../solana/balancaTeste';
import type { AppClient } from '../solana/cliente';
import { Dialogo } from './dialogo';
import { Botao } from './ui';

/** De quem é a balança: muda só o texto ("esta cooperativa", "esta indústria"). */
export type DonoBalanca = 'cooperativa' | 'industria';

/**
 * Balança de teste da carteira conectada (cooperativa ou indústria): a chave no navegador e a
 * situação do cadastro on-chain (não cadastrada, de outro dono, inativa ou pronta).
 */
export function useBalancaDoParticipante(dono: Address | undefined) {
    const client = useClient<AppClient>();
    const { balanca, gerar } = useBalancaTeste(dono);
    const dispositivo = balanca?.address;
    const fonte = useCallback(async () => {
        const conta = await lote.fetchMaybeBalanca(client.rpc, await pLote.balanca(dispositivo!));
        if (!conta.exists) return 'naoCadastrada' as const;
        if (conta.data.dono !== dono) return 'outroDono' as const;
        return conta.data.ativa ? ('pronta' as const) : ('inativa' as const);
    }, [client, dispositivo, dono]);
    const situacao = useRequest(dispositivo && dono ? fonte : null);
    return { balanca, gerar, situacao, pronta: situacao.data === 'pronta' && !!balanca };
}

/** Botão da régua: "Balança" com o ponto verde (pronta) ou âmbar (falta algo). */
export function BotaoBalanca({ pronta, onClick }: { pronta: boolean; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <Botao compacto variante="secundario" onClick={onClick}>
            <span className={`size-2 rounded-full ${pronta ? 'bg-acento' : 'bg-kraft'}`} aria-hidden="true" />
            {t('balancaTeste.titulo')}
        </Botao>
    );
}

/** Popup da balança de teste: gerar a chave e acompanhar o cadastro pela administração. */
export function DialogoBalanca({
    estado,
    dono,
    aoFechar,
}: {
    estado: ReturnType<typeof useBalancaDoParticipante>;
    dono: DonoBalanca;
    aoFechar: () => void;
}) {
    const { t } = useTranslation();
    const { balanca, gerar, situacao, pronta } = estado;
    const quem = t(`balancaTeste.quem.${dono}`);
    return (
        <Dialogo titulo={t('balancaTeste.titulo')} aoFechar={aoFechar}>
            {!balanca ? (
                <div className="flex flex-col items-start gap-4">
                    <p className="text-sm text-texto-suave">{t('balancaTeste.semBalanca', { quem })}</p>
                    <Botao onClick={gerar}>
                        <Scale className="size-4" /> {t('balancaTeste.gerar')}
                    </Botao>
                </div>
            ) : (
                <div className="flex flex-col gap-3 text-sm">
                    <p className="text-texto-suave">{t('balancaTeste.chave')}</p>
                    <p className="flex items-start gap-2">
                        <code className="rounded bg-superficie-2 px-2 py-1 break-all text-texto">{balanca.address}</code>
                        <button
                            type="button"
                            onClick={() => void navigator.clipboard?.writeText(balanca.address).catch(() => {})}
                            aria-label={t('carteira.copiar')}
                            title={t('carteira.copiar')}
                            className="rounded p-1.5 text-texto-suave hover:text-texto"
                        >
                            <Copy className="size-4" />
                        </button>
                    </p>
                    <p className={pronta ? 'font-medium text-acento' : 'font-medium text-kraft'}>
                        {situacao.data ? t(`balancaTeste.${situacao.data}`, { quem }) : t('admin.carregando')}
                    </p>
                    {situacao.data && situacao.data !== 'pronta' && (
                        <Botao variante="secundario" className="self-start" onClick={() => situacao.refresh()}>
                            {t('balancaTeste.verificar')}
                        </Botao>
                    )}
                </div>
            )}
            <p className="mt-4 text-xs text-texto-suave">{t('balancaTeste.aviso')}</p>
        </Dialogo>
    );
}
