import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Shell } from './layout/Shell';
import { TODOS_OS_ITENS } from './navegacao/menu';
import { NaoEncontrada, Operacao } from './paginas/Operacao';
import { Balancas } from './paginas/admin/Balancas';
import { Materiais } from './paginas/admin/Materiais';
import { Participantes } from './paginas/admin/Participantes';
import { MeusLotes } from './paginas/coletor/MeusLotes';
import { Coletas } from './paginas/cooperativa/Coletas';
import { Lotes } from './paginas/cooperativa/Lotes';
import { MinhaCarteira } from './paginas/MinhaCarteira';
import { Painel } from './paginas/Painel';
import { Retiradas } from './paginas/Retiradas';
import { Compras, EscrowLotes, Leiloes } from './paginas/Vendas';
import { Recebimentos } from './paginas/industria/Recebimentos';
import { ColetasImportador, DistribuicoesImportador, EntregasImportador, ReciclagemImportador } from './paginas/importador/Operacoes';
import { PainelImportador } from './paginas/importador/Painel';
import { Trilha } from './paginas/Trilha';
import { Disputa } from './paginas/venda/Disputa';
import { VendasCooperativa } from './paginas/venda/Vendas';
import { PreferenciasProvider } from './preferencias/Preferencias';
import { SolanaProvider } from './solana/SolanaProvider';
import { useCadastro } from './solana/useCadastro';

/** Página inicial: o importador entra direto no painel dele (ADR 0011); os demais, no painel geral. */
function Inicio() {
    const { cadastro } = useCadastro();
    if (cadastro?.papeis.includes('importador')) return <Navigate to="/importador" replace />;
    return <Painel />;
}

/** Rotas com tela própria; as demais do menu caem na página provisória. */
const IMPLEMENTADAS = [
    '/',
    '/explorar',
    '/participantes',
    '/balancas',
    '/materiais',
    '/coletas',
    '/lotes',
    '/meus-lotes',
    '/minha-carteira',
    '/retiradas',
    '/leiloes',
    '/escrow',
    '/compras',
    '/marketplace',
    '/vendas',
    '/recebimentos',
    '/importador',
    '/importador/distribuicoes',
    '/importador/coletas',
    '/importador/entregas',
    '/importador/reciclagem',
];

const router = createBrowserRouter([
    {
        element: <Shell />,
        children: [
            { index: true, element: <Inicio /> },
            { path: '/participantes', element: <Participantes /> },
            { path: '/balancas', element: <Balancas /> },
            { path: '/materiais', element: <Materiais /> },
            { path: '/coletas', element: <Coletas /> },
            { path: '/lotes', element: <Lotes /> },
            { path: '/meus-lotes', element: <MeusLotes /> },
            { path: '/minha-carteira', element: <MinhaCarteira /> },
            { path: '/retiradas', element: <Retiradas /> },
            { path: '/leiloes', element: <Leiloes /> },
            { path: '/escrow', element: <EscrowLotes /> },
            { path: '/compras', element: <Compras /> },
            { path: '/marketplace', element: <Disputa /> },
            { path: '/vendas', element: <VendasCooperativa /> },
            { path: '/recebimentos', element: <Recebimentos /> },
            { path: '/explorar', element: <Trilha /> },
            { path: '/importador', element: <PainelImportador /> },
            { path: '/importador/distribuicoes', element: <DistribuicoesImportador /> },
            { path: '/importador/coletas', element: <ColetasImportador /> },
            { path: '/importador/entregas', element: <EntregasImportador /> },
            { path: '/importador/reciclagem', element: <ReciclagemImportador /> },
            ...TODOS_OS_ITENS.filter((i) => !IMPLEMENTADAS.includes(i.rota)).map((i) => ({
                path: i.rota,
                element: <Operacao item={i} />,
            })),
            { path: '*', element: <NaoEncontrada /> },
        ],
    },
]);

export function App() {
    return (
        <PreferenciasProvider>
            <SolanaProvider>
                <RouterProvider router={router} />
            </SolanaProvider>
        </PreferenciasProvider>
    );
}
