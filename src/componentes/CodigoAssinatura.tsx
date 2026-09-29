import { Check, ClipboardPaste, Copy, ScanLine } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeitorQr } from './LeitorQr';
import { Botao } from './ui';

/**
 * Código de uma transação assinada em mais de um aparelho: QR Code para a câmera do próximo
 * aparelho e botão Copiar, para quando os dois estão no mesmo computador (ex.: apresentação).
 */
export function MostrarCodigo({ codigo, titulo, apagado }: { codigo: string; titulo: string; apagado?: boolean }) {
    const { t } = useTranslation();
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(codigo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
        } catch {
            // área de transferência indisponível: resta o QR
        }
    };
    return (
        <div className="flex flex-col items-center gap-3">
            {/* Fundo branco também no tema escuro: leitores de QR esperam módulos escuros sobre claro. */}
            <div className={`rounded-2xl bg-white p-3 shadow-sm ring-1 ring-linha ${apagado ? 'opacity-25' : ''}`}>
                <QRCodeSVG value={codigo} size={320} level="L" marginSize={2} title={titulo} className="block h-auto w-[min(20rem,70vw)]" />
            </div>
            <Botao type="button" variante="secundario" compacto onClick={copiar} disabled={apagado}>
                {copiado ? <Check className="size-4 text-acento" /> : <Copy className="size-4" />}
                {copiado ? t('codigo.copiado') : t('codigo.copiar')}
            </Botao>
        </div>
    );
}

/** Lê o código de outro aparelho: pela câmera (QR) ou colando o texto copiado. */
export function LerCodigo({ aoLer, instrucaoCamera }: { aoLer: (texto: string) => void; instrucaoCamera: string }) {
    const { t } = useTranslation();
    const [camera, setCamera] = useState(true);
    const [texto, setTexto] = useState('');
    return (
        <div className="flex flex-col gap-3">
            {camera ? (
                <LeitorQr aoLer={aoLer} aoCancelar={() => setCamera(false)} instrucao={instrucaoCamera} />
            ) : (
                <Botao type="button" variante="secundario" compacto className="self-start" onClick={() => setCamera(true)}>
                    <ScanLine className="size-4" /> {t('codigo.abrirCamera')}
                </Botao>
            )}
            <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">{t('codigo.colar')}</span>
                <textarea
                    value={texto}
                    rows={2}
                    spellCheck={false}
                    placeholder="ecolchain:…"
                    onChange={(e) => setTexto(e.target.value)}
                    className="rounded-lg border border-linha bg-fundo px-3 py-2 font-mono text-xs break-all text-texto placeholder:text-texto-suave/80 focus:border-acento"
                />
            </label>
            <Botao type="button" variante="secundario" compacto className="self-start" disabled={!texto.trim()} onClick={() => aoLer(texto.trim())}>
                <ClipboardPaste className="size-4" /> {t('codigo.usarColado')}
            </Botao>
        </div>
    );
}
