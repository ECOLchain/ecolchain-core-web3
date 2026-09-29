# Interface web — EcolChain

React 19 + Tailwind 4 (Vite). Conecta carteiras Solana pelo Wallet Standard (`@solana/kit-plugin-wallet`) e lê o cadastro da carteira direto dos programas, usando os clientes Codama do repositório da blockchain.

## Repositórios

| Repositório | Conteúdo |
|---|---|
| [ecolchain-core-web](https://github.com/ECOLchain/ecolchain-core-web) (este) | interface web |
| [ecolchain-core-chains](https://github.com/ECOLchain/ecolchain-core-chains) | programas Anchor, clientes TypeScript (`onchain/clients`), ADRs e operação da devnet |

A interface importa os clientes pelo alias `@clientes/*`, que aponta para `../onchain/clients/src`. Por isso **este repositório precisa ficar dentro da pasta do repositório da blockchain, na pasta `web/`** (que está no `.gitignore` de lá):

```bash
git clone https://github.com/ECOLchain/ecolchain-core-chains.git ecolchain
git clone https://github.com/ECOLchain/ecolchain-core-web.git ecolchain/web
cd ecolchain/onchain/clients && npm install     # dependências dos clientes
cd ../../web && npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de produção em dist/
```

Os clientes gerados (`onchain/clients/src/generated`) estão versionados no repositório da blockchain, então não é preciso compilar os programas para rodar a interface.

## O que já existe

- **Header fixo:** logo à esquerda; à direita, tamanho do texto (P / M / G), tema claro/escuro, rede e carteira (endereço, papel e rede). Em telas estreitas, as preferências ficam num painel.
- **Menu lateral:** o botão ☰ recolhe o menu para só ícones (telas largas) ou abre uma gaveta (celular). Sem carteira conectada, todas as opções ficam desabilitadas.
- **Menu por papel:** ao conectar, a interface lê o `Participante` da carteira no `ecol_lote` e as chaves das três configs. O menu mostra só as operações de cada papel (cooperativa, indústria, transportador, coletor, operador, intermediador, registrador, Zupy, árbitro), definidas em `src/navegacao/menu.ts`.
- **Idiomas:** pt-BR, en-US e es-ES (`src/i18n/locales`), escolhidos no rodapé do menu lateral, com bandeira. Com o menu recolhido, aparece só a bandeira e a lista abre ao lado.
- **Redes:** devnet (padrão) e localnet. Mainnet fica bloqueada até os programas serem publicados lá.
- **Layout do painel central:** moldura com a barra de título (subheader) fixa no topo; só o miolo rola. Toda listagem é uma grade com busca (sem acentos), filtros, ordenação clicando no cabeçalho e 7 registros por página (`componentes/grade.tsx`). Inclusões e alterações abrem em popup (`componentes/dialogo.tsx`), com Salvar e fechar no cabeçalho; as ações da régua agem sobre a linha selecionada (Enter na linha abre a edição). Como os dados vêm inteiros da blockchain, filtro, ordem e paginação acontecem no navegador.
- **Administração** (carteira do operador): telas funcionais de **Participantes** (cadastrar com nome, editar o nome, ativar/desativar), **Balanças** (nome, proprietário escolhido pelo nome e carteira; editar o nome, ativar/desativar) e **Materiais** (cadastrar, renomear, ativar/desativar). Cada ação é uma transação assinada na carteira; o resultado mostra o link da transação ou o erro em linguagem simples.
- **Cooperativa** (carteira com papel Cooperativa):
  - **Lotes de origem:** registra o material que chega, com a origem (coletor, triagem própria, doação, compra ou catador avulso), o material e o peso; a balança assina a pesagem. Para coletor, escolhe o coletor cadastrado; para as demais, informa a referência (nota, recibo, CNPJ), da qual só um hash vai on-chain.
  - **Lotes de venda:** junta lotes de origem do mesmo material, pesa o consolidado (aceito de −10% a +2% da soma) e fecha o lote (criar, vincular 10 origens por transação, pesar e fechar). Depois, anuncia no leilão ou cancela o anúncio. Antes da venda, **Desfazer** devolve as origens e queima o recibo digital do lote.
  - **Balança de teste (só devnet/localnet):** na primeira vez, a tela gera uma chave de balança guardada no navegador; a administração a cadastra em Balanças com a cooperativa como dona. Na operação real, o equipamento assina cada pesagem.
  - **Leitor de QR:** em "Novo lote de origem", o botão **Ler QR** abre a câmera e lê o QR Code da tela Minha carteira do coletor, selecionando-o na lista (`componentes/LeitorQr.tsx`, `jsqr`). A câmera só abre em **https** ou em `localhost`.
  - **Nota fiscal ou recibo do lote de venda:** opcional; vira o `evidencias_hash` no mesmo formato das referências de origem, e a trilha encontra o lote pelo texto.
- **Coletor:** **Minha carteira** (nome e QR Code com o endereço da carteira, para a cooperativa escanear na entrega) e **Meus lotes** (grade com os lotes de origem da carteira em qualquer cooperativa, o lote de venda e a situação de cada um, com link para a trilha).
- **Transportador:** **Minha carteira**, para a cooperativa conferir quem retira o lote.
- **Trilha pública** (sem carteira): busca pelo nome de um participante (coletor, cooperativa, indústria, transportador), pela referência de um comprovante (o hash é recalculado no navegador) ou pelo endereço de um lote ou carteira, e mostra lote de origem → lote de venda → consumo pela indústria → crédito de carbono. Aceita `?q=` na URL para compartilhar o link. No RPC público da devnet, buscas grandes podem esbarrar no limite de requisições (429).
- **Páginas:** o painel ainda é um esqueleto, e as demais operações abrem uma página provisória.

## Testar com uma rede local

Sem depender da devnet (nem da carteira de administração):

```bash
cd ../onchain && NO_DNA=1 anchor build        # os .so em target/deploy
cd clients && npx tsx scripts/rede-local.ts   # Surfpool com configs, cooperativa, 2 coletores, transportador, materiais e balança
# em outro terminal, com o rpcUrl/wsUrl que o script mostrar:
cd web && VITE_RPC_LOCALNET=<rpcUrl> VITE_WS_LOCALNET=<wsUrl> npm run dev
```

Na interface, escolha a rede **Localnet**. As chaves de teste (cooperativa, balança, coletor 1 e transportador) ficam em `onchain/.surfpool-demo.json`, fora do git; a semente da balança vai em `localStorage["ecolchain:balanca-teste:<cooperativa>"]`.

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
| `src/paginas/` | páginas: `admin/`, `cooperativa/`, `coletor/`, `Trilha.tsx`, `MinhaCarteira.tsx` e as provisórias |
| `src/componentes/` | grade, popup, título do painel, leitor de QR, campos e botões |
| `src/componentes/Logo.tsx` | logo provisório (trocar pela marca oficial) |

Depois de mudar um programa (no repositório da blockchain), rode `anchor build` e depois `npm run gerar` em `onchain/clients`; a interface passa a usar os clientes novos na hora.
