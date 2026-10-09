import {
    ArrowLeftRight,
    BadgeCheck,
    Boxes,
    ClipboardList,
    Coins,
    Factory,
    FileCheck2,
    Gavel,
    Handshake,
    Landmark,
    LayoutDashboard,
    Leaf,
    Package,
    type LucideIcon,
    Recycle,
    PackageCheck,
    QrCode,
    Scale,
    ScrollText,
    Search,
    ShieldAlert,
    Split,
    Store,
    Ticket,
    Truck,
    Users,
    Wallet,
    Wine,
    ChartColumn,
    Send,
    FileBadge,
    Receipt,
} from 'lucide-react';
import type { PapelUsuario } from '../solana/useCadastro';

export type ItemMenu = {
    /** Chave de tradução em `itens.*` e `descricoes.*`. */
    id: string;
    rota: string;
    icone: LucideIcon;
};

const item = (id: string, rota: string, icone: LucideIcon): ItemMenu => ({ id, rota, icone });

const I = {
    painel: item('painel', '/', LayoutDashboard),
    explorar: item('explorar', '/explorar', Search),
    lotes: item('lotes', '/lotes', Boxes),
    coletas: item('coletas', '/coletas', ClipboardList),
    meusLotes: item('meusLotes', '/meus-lotes', Package),
    minhaCarteira: item('minhaCarteira', '/minha-carteira', QrCode),
    retiradas: item('retiradas', '/retiradas', Handshake),
    entregas: item('entregas', '/entregas', Truck),
    // "Disputa" (ADR 0012): lotes à venda por preço fixo; a rota mantém o nome antigo.
    marketplace: item('marketplace', '/marketplace', Store),
    vendas: item('vendas', '/vendas', Receipt),
    compras: item('compras', '/compras', Factory),
    recebimentos: item('recebimentos', '/recebimentos', PackageCheck),
    disputas: item('disputas', '/disputas', ShieldAlert),
    direitos: item('direitos', '/direitos', Wallet),
    participantes: item('participantes', '/participantes', Users),
    balancas: item('balancas', '/balancas', Scale),
    materiais: item('materiais', '/materiais', Recycle),
    leiloes: item('leiloes', '/leiloes', Gavel),
    creditos: item('creditos', '/creditos', Leaf),
    distribuicoes: item('distribuicoes', '/distribuicoes', Split),
    escrow: item('escrow', '/escrow', Landmark),
    vendasCredito: item('vendasCredito', '/vendas-credito', Coins),
    repasses: item('repasses', '/repasses', ArrowLeftRight),
    validacao: item('validacao', '/validacao', FileCheck2),
    aposentadorias: item('aposentadorias', '/aposentadorias', BadgeCheck),
    resgates: item('resgates', '/resgates', Ticket),
    arbitragem: item('arbitragem', '/arbitragem', ScrollText),
    // Importador (ADR 0011): o painel é a página inicial dele.
    painelImportador: item('painelImportador', '/importador', ChartColumn),
    distribuicoesImportador: item('distribuicoesImportador', '/importador/distribuicoes', Wine),
    coletasImportador: item('coletasImportador', '/importador/coletas', ClipboardList),
    entregasImportador: item('entregasImportador', '/importador/entregas', Send),
    reciclagemImportador: item('reciclagemImportador', '/importador/reciclagem', FileBadge),
} as const;

/** Sempre visíveis (habilitados só com a carteira conectada). */
export const ITENS_GERAIS: readonly ItemMenu[] = [I.painel, I.explorar];

/** O que cada papel opera, na ordem do fluxo. Espelha quem assina cada instrução nos programas. */
export const ITENS_POR_PAPEL: Record<PapelUsuario, readonly ItemMenu[]> = {
    cooperativa: [I.coletas, I.lotes, I.marketplace, I.vendas, I.retiradas, I.disputas, I.direitos, I.minhaCarteira],
    // A Clean Tech opera como a cooperativa (ADR 0011).
    cleantech: [I.coletas, I.lotes, I.marketplace, I.vendas, I.retiradas, I.disputas, I.direitos, I.minhaCarteira],
    importador: [
        I.painelImportador,
        I.distribuicoesImportador,
        I.coletasImportador,
        I.entregasImportador,
        I.reciclagemImportador,
        I.minhaCarteira,
    ],
    // Retiradas: quando a indústria escolhe retirar ela mesma o lote comprado (ADR 0012).
    industria: [I.marketplace, I.compras, I.retiradas, I.recebimentos, I.disputas, I.direitos, I.minhaCarteira],
    transportador: [I.minhaCarteira, I.retiradas, I.entregas, I.disputas, I.direitos],
    coletor: [I.minhaCarteira, I.meusLotes, I.direitos],
    operador: [I.participantes, I.balancas, I.materiais, I.leiloes, I.creditos, I.distribuicoes],
    intermediador: [I.escrow, I.vendasCredito, I.repasses],
    registrador: [I.validacao, I.aposentadorias],
    zupy: [I.resgates],
    arbitro: [I.arbitragem],
};

/** Ordem dos grupos no menu quando a carteira acumula papéis. */
export const ORDEM_PAPEIS: readonly PapelUsuario[] = [
    'importador',
    'cooperativa',
    'cleantech',
    'industria',
    'transportador',
    'coletor',
    'operador',
    'intermediador',
    'registrador',
    'zupy',
    'arbitro',
];

/** Todas as rotas, para o roteador (cada item aparece uma vez). */
export const TODOS_OS_ITENS: readonly ItemMenu[] = Object.values(I);
