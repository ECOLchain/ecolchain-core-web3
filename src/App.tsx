import { createBrowserRouter, RouterProvider } from 'react-router';
import { Shell } from './layout/Shell';
import { TODOS_OS_ITENS } from './navegacao/menu';
import { NaoEncontrada, Operacao } from './paginas/Operacao';
import { Balancas } from './paginas/admin/Balancas';
import { Materiais } from './paginas/admin/Materiais';
import { Participantes } from './paginas/admin/Participantes';
import { Painel } from './paginas/Painel';
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
            ...TODOS_OS_ITENS.filter((i) => !['/', '/participantes', '/balancas', '/materiais'].includes(i.rota)).map((i) => ({
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
