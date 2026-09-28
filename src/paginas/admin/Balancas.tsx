import { address, type Instruction, isAddress } from '@solana/kit';
import { useClient, useRequest } from '@solana/react';
import { Pencil, Plus, Power } from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as lote from '@clientes/generated/ecol_lote';
import { lerNomeFixo } from '@clientes/nome';
import { eventAuthority, lote as pLote } from '@clientes/pdas';
import { Dialogo } from '../../componentes/dialogo';
import { AcoesGrade, CampoBusca, CartaoGrade, type Coluna, FiltroGrade, Grade, useGrade } from '../../componentes/grade';
import { TituloPagina } from '../../componentes/pagina';
import { Botao, Campo, Resultado, Selecao, Situacao } from '../../componentes/ui';
import type { AppClient } from '../../solana/cliente';
import { type ContaDecodificada, listarContas } from '../../solana/contas';
import { useParticipantes } from '../../solana/useDados';
import { useEnviar } from '../../solana/useEnviar';
import {
    abreviar,
    CampoNome,
    filtroSituacao,
    type FiltroSituacao,
    nomeAceito,
    rotuloParticipante,
    SoAdministracao,
    useOpcoesSituacao,
} from './comum';
import { chavePapel } from './Participantes';

type Linha = ContaDecodificada<lote.Balanca>;
type Popup = { tipo: 'nova' } | { tipo: 'editar'; linha: Linha };

export function Balancas() {
    const { t } = useTranslation();
    return (
        <>
            <TituloPagina titulo={t('itens.balancas')} />
            <SoAdministracao>
                <ConteudoBalancas />
            </SoAdministracao>
        </>
    );
}

function ConteudoBalancas() {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const fonte = useCallback(
        () => listarContas(client, lote.ECOL_LOTE_PROGRAM_ADDRESS, lote.BALANCA_DISCRIMINATOR, lote.getBalancaDecoder()),
        [client],
    );
    const lista = useRequest(fonte);
    const participantes = useParticipantes();
    const envio = useEnviar();
    const [popup, setPopup] = useState<Popup | null>(null);
    const [situacao, setSituacao] = useState<FiltroSituacao>('todos');
    const opcoesSituacao = useOpcoesSituacao();

    const participanteDe = useMemo(
        () => new Map((participantes.data ?? []).map((p) => [p.dados.carteira as string, p.dados])),
        [participantes.data],
    );
    // Só cooperativas e indústrias ativas têm balança.
    const donos = useMemo(
        () =>
            (participantes.data ?? []).filter(
                (p) => p.dados.ativo && (p.dados.papel === lote.Papel.Cooperativa || p.dados.papel === lote.Papel.Industria),
            ),
        [participantes.data],
    );

    const colunas = useMemo<Coluna<Linha>[]>(() => {
        const dono = (l: Linha) => participanteDe.get(l.dados.dono);
        return [
            {
                id: 'nome',
                titulo: t('admin.balancas.nome'),
                valor: (l) => lerNomeFixo(l.dados.nome),
                celula: (l) => lerNomeFixo(l.dados.nome) || <span className="text-texto-suave">{t('admin.participantes.semNome')}</span>,
            },
            {
                id: 'dono',
                titulo: t('admin.balancas.dono'),
                valor: (l) => {
                    const d = dono(l);
                    return d ? rotuloParticipante(d) : abreviar(l.dados.dono);
                },
                busca: (l) => l.dados.dono,
            },
            {
                id: 'papel',
                titulo: t('admin.participantes.papel'),
                largura: 'w-40',
                valor: (l) => {
                    const d = dono(l);
                    return d ? t(chavePapel(d.papel)) : '';
                },
            },
            {
                id: 'dispositivo',
                titulo: t('admin.balancas.dispositivo'),
                largura: 'w-48',
                valor: (l) => l.dados.dispositivo,
                celula: (l) => (
                    <span className="tabular-nums" title={l.dados.dispositivo}>
                        {abreviar(l.dados.dispositivo)}
                    </span>
                ),
            },
            {
                id: 'situacao',
                titulo: t('admin.situacao'),
                largura: 'w-36',
                valor: (l) => t(l.dados.ativa ? 'admin.ativo' : 'admin.inativo'),
                celula: (l) => <Situacao ativo={l.dados.ativa} />,
            },
        ];
    }, [t, participanteDe]);
    const filtro = useMemo(() => {
        const f = filtroSituacao(situacao);
        return (l: Linha) => f(l.dados.ativa);
    }, [situacao]);
    const grade = useGrade(lista.data, colunas, { chave: (l) => l.endereco, ordem: { id: 'nome', desc: false }, filtro });
    const abrir = (p: Popup) => {
        envio.reset();
        setPopup(p);
    };
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

    return (
        <div className="flex flex-col gap-4">
            {!popup && <Resultado assinatura={envio.data} erro={envio.error} sucesso={t('admin.salvo')} />}

            <CartaoGrade
                barra={
                    <>
                        <CampoBusca grade={grade} rotulo={t('grade.buscar')} />
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
                                onClick={() =>
                                    sel &&
                                    enviar(async () =>
                                        lote.getOperadorSetBalancaAtivaInstructionAsync({
                                            operador: client.payer,
                                            balanca: sel.endereco,
                                            eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                            program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                            ativa: !sel.dados.ativa,
                                        }),
                                    )
                                }
                            >
                                <Power className="size-4" /> {t(sel && !sel.dados.ativa ? 'admin.ativar' : 'admin.desativar')}
                            </Botao>
                            <Botao compacto onClick={() => abrir({ tipo: 'nova' })}>
                                <Plus className="size-4" /> {t('admin.nova')}
                            </Botao>
                        </AcoesGrade>
                    </>
                }
            >
                <Grade
                    grade={grade}
                    vazio={t('admin.balancas.vazio')}
                    carregando={lista.status === 'fetching' && !lista.data}
                    onAbrir={(l) => abrir({ tipo: 'editar', linha: l })}
                />
            </CartaoGrade>

            {popup?.tipo === 'editar' && (
                <DialogoNomeBalanca
                    linha={popup.linha}
                    dono={participanteDe.get(popup.linha.dados.dono)}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={async (nome) => {
                        const ok = await enviar(async () =>
                            lote.getOperadorSetBalancaNomeInstructionAsync({
                                operador: client.payer,
                                balanca: popup.linha.endereco,
                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                nome,
                            }),
                        );
                        if (ok) setPopup(null);
                    }}
                />
            )}
            {popup?.tipo === 'nova' && (
                <DialogoNova
                    donos={donos}
                    carregandoDonos={!participantes.data}
                    salvando={envio.isRunning}
                    erro={envio.error}
                    aoFechar={() => setPopup(null)}
                    aoSalvar={async (dono, dispositivo, nome) => {
                        const ok = await enviar(async () =>
                            lote.getOperadorRegisterBalancaInstructionAsync({
                                payer: client.payer,
                                operador: client.payer,
                                donoPart: await pLote.participante(dono),
                                balanca: await pLote.balanca(dispositivo),
                                eventAuthority: await eventAuthority(lote.ECOL_LOTE_PROGRAM_ADDRESS),
                                program: lote.ECOL_LOTE_PROGRAM_ADDRESS,
                                dispositivo,
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

function DialogoNova({
    donos,
    carregandoDonos,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    donos: ContaDecodificada<lote.Participante>[];
    carregandoDonos: boolean;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (dono: ReturnType<typeof address>, dispositivo: ReturnType<typeof address>, nome: string) => void;
}) {
    const { t } = useTranslation();
    const [nome, setNome] = useState('');
    const [dono, setDono] = useState('');
    const [dispositivo, setDispositivo] = useState('');
    const dispositivoValido = isAddress(dispositivo.trim());
    const pronto = !!dono && dispositivoValido && nomeAceito(nome);
    // Em ordem de nome, para achar a cooperativa numa lista longa.
    const ordenados = useMemo(
        () => [...donos].sort((a, b) => rotuloParticipante(a.dados).localeCompare(rotuloParticipante(b.dados))),
        [donos],
    );

    const enviar = (e: FormEvent) => {
        e.preventDefault();
        if (pronto) aoSalvar(address(dono), address(dispositivo.trim()), nome.trim());
    };

    return (
        <Dialogo
            titulo={t('admin.balancas.nova')}
            formId="form-balanca"
            salvando={salvando}
            podeSalvar={pronto}
            rotuloSalvar={t('admin.balancas.cadastrar')}
            aoFechar={aoFechar}
        >
            {!carregandoDonos && donos.length === 0 ? (
                <p className="text-sm text-texto-suave">{t('admin.balancas.semDonos')}</p>
            ) : (
                <form id="form-balanca" onSubmit={enviar} className="flex flex-col gap-4">
                    <Resultado erro={erro} sucesso="" />
                    <CampoNome
                        valor={nome}
                        onChange={setNome}
                        rotulo={t('admin.balancas.nome')}
                        exemplo={t('admin.balancas.nomeExemplo')}
                        ajuda={t('admin.balancas.nomeAjuda')}
                    />
                    <Selecao rotulo={t('admin.balancas.dono')} required value={dono} onChange={(e) => setDono(e.target.value)}>
                        <option value="" disabled>
                            {t('admin.balancas.escolherDono')}
                        </option>
                        {ordenados.map((p) => (
                            <option key={p.endereco} value={p.dados.carteira}>
                                {rotuloParticipante(p.dados)} ({t(chavePapel(p.dados.papel))})
                            </option>
                        ))}
                    </Selecao>
                    <Campo
                        rotulo={t('admin.balancas.dispositivo')}
                        required
                        value={dispositivo}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setDispositivo(e.target.value)}
                        aria-invalid={dispositivo !== '' && !dispositivoValido}
                        ajuda={
                            dispositivo !== '' && !dispositivoValido
                                ? t('admin.participantes.carteiraInvalida')
                                : t('admin.balancas.dispositivoAjuda')
                        }
                    />
                </form>
            )}
        </Dialogo>
    );
}

function DialogoNomeBalanca({
    linha,
    dono,
    salvando,
    erro,
    aoFechar,
    aoSalvar,
}: {
    linha: Linha;
    dono: lote.Participante | undefined;
    salvando: boolean;
    erro: unknown;
    aoFechar: () => void;
    aoSalvar: (nome: string) => void;
}) {
    const { t } = useTranslation();
    const [nome, setNome] = useState(lerNomeFixo(linha.dados.nome));
    return (
        <Dialogo
            titulo={t('admin.balancas.editar')}
            subtitulo={`${dono ? rotuloParticipante(dono) : abreviar(linha.dados.dono)} | ${linha.dados.dispositivo}`}
            formId="form-nome-balanca"
            salvando={salvando}
            podeSalvar={nomeAceito(nome)}
            aoFechar={aoFechar}
        >
            <form
                id="form-nome-balanca"
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
                    rotulo={t('admin.balancas.nome')}
                    exemplo={t('admin.balancas.nomeExemplo')}
                    ajuda={t('admin.balancas.nomeAjuda')}
                />
            </form>
        </Dialogo>
    );
}
