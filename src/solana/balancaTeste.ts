import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from '@solana/kit';
import { useCallback, useEffect, useState } from 'react';

/**
 * Balança de TESTE (só devnet): a chave do "equipamento" fica no navegador da cooperativa.
 * Na operação real, a balança física tem a própria chave e assina cada pesagem.
 */
const chave = (cooperativa: string) => `ecolchain:balanca-teste:${cooperativa}`;

function lerSemente(cooperativa: string): Uint8Array | null {
    try {
        const hex = localStorage.getItem(chave(cooperativa));
        if (!hex || hex.length !== 64) return null;
        return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
    } catch {
        return null;
    }
}

export function useBalancaTeste(cooperativa: string | undefined) {
    const [signer, setSigner] = useState<KeyPairSigner | null>(null);

    useEffect(() => {
        setSigner(null);
        const semente = cooperativa ? lerSemente(cooperativa) : null;
        if (semente) void createKeyPairSignerFromPrivateKeyBytes(semente).then(setSigner);
    }, [cooperativa]);

    const gerar = useCallback(async () => {
        if (!cooperativa) return;
        const semente = crypto.getRandomValues(new Uint8Array(32));
        try {
            localStorage.setItem(chave(cooperativa), [...semente].map((b) => b.toString(16).padStart(2, '0')).join(''));
        } catch {
            // sem armazenamento: a balança vale só nesta aba
        }
        setSigner(await createKeyPairSignerFromPrivateKeyBytes(semente));
    }, [cooperativa]);

    return { balanca: signer, gerar };
}
