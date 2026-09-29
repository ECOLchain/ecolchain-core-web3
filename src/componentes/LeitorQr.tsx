import jsQR from 'jsqr';
import { CameraOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Botao } from './ui';

/** Intervalo entre tentativas de leitura: o bastante para o celular não esquentar. */
const INTERVALO_MS = 150;
/** Os quadros são reduzidos a esta largura antes da decodificação. */
const LARGURA_ANALISE = 640;

/**
 * Câmera traseira com leitura contínua de QR Code. Chama `aoLer` uma vez, com o texto do primeiro
 * código encontrado, e desliga a câmera. Exige contexto seguro (https ou localhost).
 */
export function LeitorQr({ aoLer, aoCancelar }: { aoLer: (texto: string) => void; aoCancelar: () => void }) {
    const { t } = useTranslation();
    const video = useRef<HTMLVideoElement>(null);
    const [erro, setErro] = useState(false);
    // A última versão do callback, sem reiniciar a câmera quando o componente pai renderiza.
    const lido = useRef(aoLer);
    lido.current = aoLer;

    useEffect(() => {
        let fluxo: MediaStream | undefined;
        let quadro = 0;
        let ultimo = 0;
        let vivo = true;
        const tela = document.createElement('canvas');
        const ctx = tela.getContext('2d', { willReadFrequently: true });
        const parar = () => {
            cancelAnimationFrame(quadro);
            for (const trilha of fluxo?.getTracks() ?? []) trilha.stop();
        };

        const analisar = (agora: number) => {
            if (!vivo) return;
            const v = video.current;
            if (v && ctx && v.readyState >= v.HAVE_ENOUGH_DATA && agora - ultimo >= INTERVALO_MS) {
                ultimo = agora;
                const escala = Math.min(1, LARGURA_ANALISE / v.videoWidth);
                tela.width = Math.round(v.videoWidth * escala);
                tela.height = Math.round(v.videoHeight * escala);
                ctx.drawImage(v, 0, 0, tela.width, tela.height);
                const imagem = ctx.getImageData(0, 0, tela.width, tela.height);
                const codigo = jsQR(imagem.data, imagem.width, imagem.height, { inversionAttempts: 'attemptBoth' });
                if (codigo?.data) {
                    vivo = false;
                    parar();
                    lido.current(codigo.data.trim());
                    return;
                }
            }
            quadro = requestAnimationFrame(analisar);
        };

        (async () => {
            try {
                fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                if (!vivo || !video.current) return parar();
                video.current.srcObject = fluxo;
                await video.current.play();
                quadro = requestAnimationFrame(analisar);
            } catch {
                if (vivo) setErro(true);
            }
        })();
        return () => {
            vivo = false;
            parar();
        };
    }, []);

    return (
        <div className="flex flex-col gap-2">
            {erro ? (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-dashed border-linha p-3 text-sm text-kraft">
                    <CameraOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t('leitorQr.semCamera')}
                </p>
            ) : (
                <div className="relative overflow-hidden rounded-lg bg-black">
                    <video ref={video} muted playsInline className="block aspect-[4/3] w-full object-cover" aria-label={t('leitorQr.camera')} />
                    {/* Moldura de mira: onde posicionar o código. */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                        <div className="aspect-square w-3/5 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                    </div>
                    <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-1.5 text-center text-xs text-white">{t('leitorQr.aponte')}</p>
                </div>
            )}
            <Botao type="button" variante="secundario" compacto className="self-start" onClick={aoCancelar}>
                <X className="size-4" /> {t('leitorQr.fechar')}
            </Botao>
        </div>
    );
}
