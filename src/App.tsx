import { createBrowserRouter, RouterProvider } from 'react-router';
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
import { Trilha } from './paginas/Trilha';
import { PreferenciasProvider } from './preferencias/Preferencias';
import { SolanaProvider } from './solana/SolanaProvider';

const router = createBrowserRouter([
    {
        element: <Shell />,
        children: [
            { index: true, element: <Painel /> },
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
            { path: '/explorar', element: <Trilha /> },
            ...TODOS_OS_ITENS.filter((i) => !['/', '/explorar', '/participantes', '/balancas', '/materiais', '/coletas', '/lotes', '/meus-lotes', '/minha-carteira', '/retiradas', '/leiloes', '/escrow', '/compras'].includes(i.rota)).map((i) => ({
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
