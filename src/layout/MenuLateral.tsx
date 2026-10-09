import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { type ItemMenu, ITENS_GERAIS, ITENS_POR_PAPEL, ORDEM_PAPEIS } from '../navegacao/menu';
import type { AppClient } from '../solana/cliente';
import { useCadastro } from '../solana/useCadastro';
import { SeletorIdioma } from './SeletorIdioma';

type Props = {
    /** Telas largas: expandido (ícone + texto) ou recolhido (só ícones). */
    expandido: boolean;
    /** Telas estreitas: gaveta sobreposta aberta ou fechada. */
    gavetaAberta: boolean;
    fecharGaveta: () => void;
};

export function MenuLateral({ expandido, gavetaAberta, fecharGaveta }: Props) {
    const { t } = useTranslation();
    const client = useClient<AppClient>();
    const conectada = useConnectedWallet(client) != null;
    const { cadastro, status } = useCadastro();

    const grupos = conectada && cadastro ? ORDEM_PAPEIS.filter((p) => cadastro.papeis.includes(p)) : [];
    const aviso = !conectada
        ? t('menu.conecteParaUsar')
        : status === 'fetching' && !cadastro
          ? t('papel.verificando')
          : cadastro && cadastro.papeis.length === 0
            ? t('menu.semCadastro')
            : null;
    // Recolhido só vale em telas largas; na gaveta o texto aparece sempre.
    const mostrarTexto = expandido || gavetaAberta;

    return (
        <>
            {gavetaAberta && (
                <div className="fixed inset-0 top-16 z-30 bg-black/30 lg:hidden" onClick={fecharGaveta} aria-hidden="true" />
            )}
            <nav
                id="menu-lateral"
                aria-label={t('menu.navegacao')}
                className={`fixed top-16 bottom-0 left-0 z-30 flex flex-col border-r border-linha bg-superficie transition-[width,translate] duration-200 ${
                    gavetaAberta ? 'w-72 translate-x-0' : '-translate-x-full lg:translate-x-0'
                } ${expandido ? 'lg:w-64' : 'lg:w-[4.25rem]'}`}
            >
                {/* Só a lista rola; o rodapé com o idioma fica fixo embaixo (e o menu dele pode sair para o lado). */}
                <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                    <div className="flex items-center justify-end px-2 pt-2 lg:hidden">
                        <button
                            type="button"
                            onClick={fecharGaveta}
                            aria-label={t('menu.fechar')}
                            className="flex size-9 items-center justify-center rounded-lg text-texto-suave hover:bg-superficie-2"
                        >
                            <X className="size-5" />
                        </button>
                    </div>

                    <Grupo titulo={t('menu.geral')} mostrarTexto={mostrarTexto}>
                        {ITENS_GERAIS.map((i) => (
                            // A trilha pública é aberta a qualquer pessoa, com ou sem carteira.
                            <Item
                                key={i.id}
                                item={i}
                                habilitado={conectada || i.id === 'explorar'}
                                mostrarTexto={mostrarTexto}
                                aoNavegar={fecharGaveta}
                            />
                        ))}
                    </Grupo>

                    {grupos.map((papel) => (
                        <Grupo key={papel} titulo={t(`papel.${papel}`)} mostrarTexto={mostrarTexto}>
                            {ITENS_POR_PAPEL[papel].map((i) => (
                                <Item key={i.id} item={i} habilitado mostrarTexto={mostrarTexto} aoNavegar={fecharGaveta} />
                            ))}
                        </Grupo>
                    ))}

                    {aviso && mostrarTexto && (
                        <p className="mx-4 mt-4 rounded-lg bg-superficie-2 p-3 text-sm leading-relaxed text-texto-suave">{aviso}</p>
                    )}
                </div>
                <div className="border-t border-linha p-2">
                    <SeletorIdioma recolhido={!mostrarTexto} />
                </div>
            </nav>
        </>
    );
}

function Grupo({ titulo, mostrarTexto, children }: { titulo: string; mostrarTexto: boolean; children: React.ReactNode }) {
    return (
        <div className="px-2 pt-4 first-of-type:pt-3">
            {mostrarTexto ? (
                <h2 className="px-3 pb-1.5 text-xs font-semibold text-texto-suave">{titulo}</h2>
            ) : (
                <hr className="mx-3 mb-2 border-linha" aria-label={titulo} />
            )}
            <ul className="flex flex-col gap-0.5">{children}</ul>
        </div>
    );
}

function Item({
    item,
    habilitado,
    mostrarTexto,
    aoNavegar,
}: {
    item: ItemMenu;
    habilitado: boolean;
    mostrarTexto: boolean;
    aoNavegar: () => void;
}) {
    const { t } = useTranslation();
    const Icone = item.icone;
    const rotulo = t(`itens.${item.id}`);
    const base = `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${mostrarTexto ? '' : 'justify-center'}`;

    if (!habilitado) {
        return (
            <li>
                <span aria-disabled="true" title={`${rotulo}: ${t('menu.desabilitado')}`} className={`${base} cursor-not-allowed text-texto-suave/50`}>
                    <Icone className="size-[1.15rem] shrink-0" aria-hidden="true" />
                    {mostrarTexto ? <span className="truncate">{rotulo}</span> : <span className="sr-only">{rotulo}</span>}
                </span>
            </li>
        );
    }

    return (
        <li>
            <NavLink
                to={item.rota}
                end={item.rota === '/' || item.rota === '/importador'}
                onClick={aoNavegar}
                title={mostrarTexto ? undefined : rotulo}
                className={({ isActive }) =>
                    `${base} transition-colors ${
                        isActive
                            ? 'bg-acento-suave text-acento'
                            : 'text-texto-suave hover:bg-superficie-2 hover:text-texto'
                    }`
                }
            >
                <Icone className="size-[1.15rem] shrink-0" aria-hidden="true" />
                {mostrarTexto ? <span className="truncate">{rotulo}</span> : <span className="sr-only">{rotulo}</span>}
            </NavLink>
        </li>
    );
}
