import { address, type Instruction, isAddress } from '@solana/kit';
import { useClient } from '@solana/react';
import { Pencil, Plus, Power } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao, Situacao } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import type { ContaDecodificada } from '../../solana/contas';
import { useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import {
    abreviar,
    CampoNome,
    filtroSituacao,
    type FiltroSituacao,
    nomeAceito,
    sha256,
    SoAdministracao,
    useOpcoesSituacao,
} from './comum';

/** Papéis de participante, na ordem do fluxo físico, com a chave de tradução. */
export const PAPEIS = [
    { valor: lote.Papel.Coletor, chave: 'papel.coletor' },
    { valor: lote.Papel.Cooperativa, chave: 'papel.cooperativa' },
    { valor: lote.Papel.Transportador, chave: 'papel.transportador' },
    { valor: lote.Papel.Industria, chave: 'papel.industria' },
] as const;
export const chavePapel = (p: lote.Papel) => PAPEIS.find((x) => x.valor === p)?.chave ?? '';

type Linha = ContaDecodificada<lote.Participante>;
/** O que está aberto no popup: inclusão ou alteração do nome. */
type Popup = { tipo: 'novo' } | { tipo: 'editar'; linha: Linha };

export function Participantes() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.participantes')} />
            <SoAdministracao>
                <ConteudoParticipantes />
            </SoAdministracao>
        </>
    );
}

function ConteudoParticipantes() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const lista = useParticipantes();
    const envio = useEnviar();
    const [popup, setPopup] = useState<Popup | null>(null);
    const [papel, setPapel] = useState('');
    const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
    const opcoesSituacao = useOpcoesSituacao();

    const colunas = useMemo<Coluna<Linha>[]>(
        () => [
            {
                id: 'nome',
                titulo: t('admin.participantes.nome'),
                valor: (l) => lerNomeFixo(l.dados.nome),
                celula: (l) =>
                    lerNomeFixo(l.dados.nome) || <span className="text-texto-suave">{t('admin.participantes.semNome')}</span>,
            },
            {
                id: 'carteira',
                titulo: t('admin.participantes.carteira'),
                largura: 'w-44',
                valor: (l) => l.dados.carteira,
                celula: (l) => (
                    <span className="tabular-nums" title={l.dados.carteira}>
                        {abreviar(l.dados.carteira)}
                    </span>
                ),
            },
            { id: 'papel', titulo: t('admin.participantes.papel'), valor: (l) => t(chavePapel(l.dados.papel)), largura: 'w-40' },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-36',
                valor: (l) => t(l.dados.ativo ? 'admin.ativo' : 'admin.inativo'),
                celula: (l) => <Situacao ativo={l.dados.ativo} />,
            },
        ],
        [t],
    );
    const filtro = useMemo(() => {
        const porSituacao = filtroSituacao(situacao);
        return (l: Linha) => (papel === '' || l.dados.papel === Number(papel)) && porSituacao(l.dados.ativo);
    }, [papel, situacao]);
    const grade = useGrade(lista.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'nome', desc: false }, filtro });
    const sel = grade.selecionada;

    const enviar = async (montar: () => Promise<Instruction>) => {
        try {
            await envio.dispatchAsync([await montar()]);
            lista.refresh();
            return true;
        } catch {
            return false; // o erro fica em envio.error
        }
    };

    const abrir = (p: Popup) => {
        envio.reset();
        setPopup(p);
    };

    const alternarAtivo = (l: Linha) =>
        enviar(async () =>
            lote.getOperadorSetParticipanteAtivoInstructionAsync({
                operador: client.payer,
                participante: l.endereco,
                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                ativo: !l.dados.ativo,
            }),
        );

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />}

            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
                        <FiltroGrade
                            rotulo={t('admin.participantes.papel')}
                            valor={papel}
                            onChange={(v) => {
                                setPapel(v);
                                grade.reiniciar();
                            }}
                            opcoes={[
                                { valor: '', texto: t('grade.todosPapeis') },
                                ...PAPEIS.map((p) => ({ valor: String(p.valor), texto: t(p.chave) })),
                            ]}
                        />
                        <FiltroGrade
                            rotulo={t('admin.situacao')}
                            valor={situacao}
                            onChange={(v) => {
                                setSituacao(v as FiltroSituacao);
                                grade.reiniciar();
                            }}
                            opcoes={opcoesSituacao}
                        />
                        <AcoesGrade>
                            <Botao compacto variante="secundario" disabled={!sel} onClick={() => sel && abrir({ tipo: 'editar', linha: sel })}>
                                <Pencil className="size-4" /> {t('admin.editar')}
                            </Botao>
                            <Botao
                                compacto
                                variante="secundario"
                                disabled={!sel}
                                carregando={envio.isRunning && !popup}
                                onClick={() => sel && alternarAtivo(sel)}
                            >
                                <Power className="size-4" /> {t(sel && !sel.dados.ativo ? 'admin.ativar' : 'admin.desativar')}
                            </Botao>
                            <Botao compacto onClick={() => abrir({ tipo: 'novo' })}>
                                <Plus className="size-4" /> {t('admin.novo')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    vazio={t('admin.participantes.vazio')}
                    carregando={lista.status === 'fetching' && !lista.data}
                    onAbrir={(l) => abrir({ tipo: 'editar', linha: l })}
                />
            </CartaoGrade>

            {popup?.tipo === 'novo' && (
                <DialogoNovo
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={async (carteira, papelNovo, nome, referencia) => {
                        const ok = await enviar(async () =>
                            lote.getOperadorRegisterParticipanteInstructionAsync({
                                payer: client.payer,
                                operador: client.payer,
                                participante: await pLote.participante(carteira),
                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                carteira,
                                papel: papelNovo,
                                // On-chain vai só o hash da referência do cadastro (LGPD).
                                kycHash: await sha256(referencia || `cadastro:${carteira}`),
                                nome,
                            }),
                        );
                        if (ok) setPopup(null);
                    }}
                />
            )}
            {popup?.tipo === 'editar' && (
                <DialogoNome
                    linha={popup.linha}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={async (nome) => {
                        const ok = await enviar(async () =>
                            lote.getOperadorSetParticipanteNomeInstructionAsync({
                                operador: client.payer,
                                participante: popup.linha.endereco,
                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                nome,
                            }),
                        );
                        if (ok) setPopup(null);
                    }}
                />
            )}
        </div>
    );
}

function DialogoNovo({
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (carteira: ReturnType<typeof address>, papel: lote.Papel, nome: string, referencia: string) => void;
}) {
    const { t } = useTranslation();
    const [carteira, setCarteira] = useState('');
    const [nome, setNome] = useState('');
    const [papel, setPapel] = useState<lote.Papel>(lote.Papel.Cooperativa);
    const [referencia, setReferencia] = useState('');
    const carteiraValida = isAddress(carteira.trim());
    const pronto = carteiraValida && nomeAceito(nome);

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pronto) aoSalvar(address(carteira.trim()), papel, nome.trim(), referencia.trim());
    };

    return (
        <Dialogo
            titulo={t('admin.participantes.novo')}
            formId="form-participante"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('admin.participantes.cadastrar')}
            aoFechar={aoFechar}
        >
            <form id="form-participante" onSubmit={enviar} className="flex flex-col gap-4">
                <Resultado erro={erro} sucesso="" />
                <CampoNome
                    valor={nome}
                    onChange={setNome}
                    rotulo={t('admin.participantes.nome')}
                    exemplo={t('admin.participantes.nomeExemplo')}
                    ajuda={t('admin.participantes.nomeAjuda')}
                />
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
                <p className="-mt-2 text-xs text-texto-suave">{t('admin.participantes.umPapel')}</p>
                <Campo
                    rotulo={t('admin.participantes.referencia')}
                    value={referencia}
                    ajuda={t('admin.participantes.referenciaAjuda')}
                    onChange={(e) => setReferencia(e.target.value)}
                />
            </form>
        </Dialogo>
    );
}

function DialogoNome({
    linha,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (nome: string) => void;
}) {
    const { t } = useTranslation();
    const [nome, setNome] = useState(lerNomeFixo(linha.dados.nome));
    return (
        <Dialogo
            titulo={t('admin.participantes.editar')}
            subtitulo={`${t(chavePapel(linha.dados.papel))} | ${linha.dados.carteira}`}
            formId="form-nome"
            salvando={salvando}
            podeSalvar={nomeAceito(nome)}
            aoFechar={aoFechar}
        >
            <form
                id="form-nome"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (nomeAceito(nome)) aoSalvar(nome.trim());
                }}
                className="flex flex-col gap-4"
            >
                <Resultado erro={erro} sucesso="" />
                <CampoNome
                    valor={nome}
                    onChange={setNome}
                    rotulo={t('admin.participantes.nome')}
                    exemplo={t('admin.participantes.nomeExemplo')}
                    ajuda={t('admin.participantes.nomeAjuda')}
                />
                <p className="text-xs text-texto-suave">{t('admin.participantes.umPapel')}</p>
            </form>
        </Dialogo>
    );
}
