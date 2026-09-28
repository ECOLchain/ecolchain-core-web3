# Interface web — EcolChain

React 19 + Tailwind 4 (Vite). Conecta carteiras Solana pelo Wallet Standard (`@solana/kit-plugin-wallet`) e lê o cadastro da carteira direto dos programas, usando os clientes Codama de `../onchain/clients`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção em dist/
```

## O que já existe

- **Header fixo:** logo à esquerda; à direita, tamanho do texto (P / M / G), tema claro/escuro, rede e carteira (endereço, papel e rede). Em telas estreitas, as preferências ficam num painel.
- **Menu lateral:** o botão ☰ recolhe o menu para só ícones (telas largas) ou abre uma gaveta (celular). Sem carteira conectada, todas as opções ficam desabilitadas.
- **Menu por papel:** ao conectar, a interface lê o `Participante` da carteira no `ecol_lote` e as chaves das três configs. O menu mostra só as operações de cada papel (cooperativa, indústria, transportador, coletor, operador, intermediador, registrador, Zupy, árbitro), definidas em `src/navegacao/menu.ts`.
- **Idiomas:** pt-BR, en-US e es-ES (`src/i18n/locales`), escolhidos no rodapé do menu lateral, com bandeira. Com o menu recolhido, aparece só a bandeira e a lista abre ao lado.
- **Redes:** devnet (padrão) e localnet. Mainnet fica bloqueada até os programas serem publicados lá.
- **Administração** (carteira do operador): telas funcionais de **Participantes** (cadastrar com nome, renomear clicando no nome, ativar/desativar), **Balanças** (cadastrar para uma cooperativa ou indústria, escolhida pelo nome e carteira; ativar/desativar) e **Materiais** (cadastrar, renomear, ativar/desativar). Cada ação é uma transação assinada na carteira; o resultado mostra o link da transação ou o erro em linguagem simples.
- **Cooperativa** (carteira com papel Cooperativa):
  - **Entregas de coletores:** escolhe o coletor cadastrado, o material e o peso; a balança assina a pesagem e a entrega vai para a blockchain. A tabela mostra quem entregou, quanto e se a entrega já está num lote.
  - **Meus lotes:** escolhe o material, marca as entregas disponíveis, informa o peso do lote na balança (ou usa a soma) e monta o lote (uma transação para criar e uma a cada 10 entregas vinculadas). Depois, anuncia no leilão (preço mínimo e prazo) ou cancela o anúncio.
  - **Balança de teste (só devnet/localnet):** na primeira vez, a tela gera uma chave de balança guardada no navegador; a administração a cadastra em Balanças com a cooperativa como dona. Na operação real, o equipamento assina cada pesagem.
- **Páginas:** o painel ainda é um esqueleto, e as demais operações abrem uma página provisória.

## Testar com uma rede local

Sem depender da devnet (nem da carteira de administração):

```bash
cd ../onchain && NO_DNA=1 anchor build        # os .so em target/deploy
cd clients && npx tsx scripts/rede-local.ts   # Surfpool com configs, cooperativa, 2 coletores, materiais e balança
# em outro terminal, com o rpcUrl/wsUrl que o script mostrar:
cd web && VITE_RPC_LOCALNET=<rpcUrl> VITE_WS_LOCALNET=<wsUrl> npm run dev
```

Na interface, escolha a rede **Localnet**. As chaves de teste (cooperativa e balança) ficam em `onchain/.surfpool-demo.json`, fora do git; a semente da balança vai em `localStorage["ecolchain:balanca-teste:<cooperativa>"]`.

As preferências (tema, fonte, idioma e rede) ficam no `localStorage` do navegador.

## Configuração

| Variável | Padrão |
|---|---|
| `VITE_RPC_DEVNET` | `https://api.devnet.solana.com` |
| `VITE_WS_DEVNET` | derivado do RPC |
| `VITE_RPC_LOCALNET` | `http://127.0.0.1:8899` |
| `VITE_WS_LOCALNET` | derivado do RPC |

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `src/layout/` | `Shell` (header + menu + conteúdo), `Header`, `MenuLateral`, `Carteira`, `Controles` |
| `src/navegacao/menu.ts` | itens do menu e quais papéis veem cada um |
| `src/solana/` | redes, cliente Kit por rede, `useCadastro` (papéis da carteira) |
| `src/preferencias/` | tema, fonte, idioma e rede |
| `src/i18n/` | traduções |
| `src/paginas/` | painel e páginas provisórias |
| `src/componentes/Logo.tsx` | logo provisório (trocar pela marca oficial) |

Os clientes gerados são importados pelo alias `@clientes/*`, que aponta para `../onchain/clients/src`. Depois de mudar um programa, rode `anchor build` e depois `npm run gerar` em `onchain/clients`.
