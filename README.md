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

## Carteira recomendada: Solflare

Use a **[Solflare](https://solflare.com)** (extensão do navegador ou app do celular) para todos os papéis. É a carteira usada na operação da devnet (a administração assina com uma Solflare), e ela atende três pontos de que a EcolChain depende:

- **Assina sem alterar a transação.** A retirada do lote é assinada por duas pessoas, cada uma no seu aparelho: a cooperativa assina primeiro e o transportador completa. Algumas carteiras acrescentam instruções ao assinar (proteções ou taxa de prioridade). Isso muda a transação e invalida a assinatura da outra parte. Nesse caso, a tela avisa: "A carteira alterou a transação ao assinar".
- **Assina sem enviar.** A Solflare implementa a assinatura avulsa do Wallet Standard (`solana:signTransaction`), usada na retirada.
- **Devnet.** A rede da carteira pode ser trocada para Devnet, a rede atual dos programas. A rede escolhida na carteira precisa ser a mesma do seletor de rede da interface.

Outras carteiras compatíveis com o Wallet Standard aparecem no botão **Conectar** e servem para as telas de uma assinatura só, mas não são testadas.

## O que já existe

- **Header fixo:** logo e, em destaque, o **selo de quem está operando** ("Operando como", papel e nome do cadastro), numa cor por papel, repetida numa faixa no topo do header. Serve para apresentações: de longe dá para ver se a tela é da cooperativa, do coletor, do transportador, da indústria ou da administração. À direita: tamanho do texto (P / M / G), tema claro/escuro, rede e carteira. Em telas estreitas, as preferências ficam num painel e a carteira mostra só o ícone.
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
- **Retiradas** (cooperativa e transportador): a retirada exige a assinatura das duas partes (`transportador_pickup_lote`).
  1. A cooperativa seleciona o lote vendido, identifica o transportador pelo QR da tela Minha carteira dele (ou pela lista) e assina.
  2. A tela mostra um QR com a assinatura da cooperativa, o lote, as duas carteiras e o blockhash. O código vale por cerca de um minuto; depois, "Gerar novo código".
  3. O transportador, em **Assinar retirada**, lê o QR. O aparelho dele remonta a mesma transação a partir da blockchain, confere a assinatura da cooperativa, mostra o lote para conferência, assina e envia.
  4. A tela da cooperativa percebe a retirada sozinha. O lote vai para "Em transporte", e o recibo digital, para a carteira do transportador.

  O transportador vê na grade os lotes que retirou. Código em `src/solana/retirada.ts`.
- **Venda** (administração, intermediador e indústria): `industria_accept_venda` exige as três assinaturas.
  1. Em **Leilões**, a administração seleciona o lote anunciado e registra o resultado: indústria vencedora, valor (≥ preço mínimo), referência do depósito no escrow e da ata. Assina e mostra o código.
  2. Em **Escrow dos lotes**, o intermediador lê o código, confere e assina.
  3. Em **Compras**, a indústria lê, confere, assina e envia. A tela da administração percebe a venda sozinha.

  A transação usa um **nonce durável**: uma conta de sistema derivada da carteira do operador (`createAccountWithSeed`, semente `ecolchain-venda`), criada na primeira venda por ≈ 0,0015 SOL. Por isso o código **não expira com o tempo**, só quando outra venda usa o nonce. Cada aparelho remonta a transação a partir da blockchain e confere as assinaturas anteriores antes de assinar. Em Leilões, a administração também encerra leilões vencidos sem lance. Código em `src/solana/venda.ts`.
- **Recebimentos** (indústria): os lotes em transporte para a indústria, com prazo de entrega (em vermelho se vencido). **Registrar recebimento** mostra o peso de saída e a faixa aceita sem disputa, que usa a tolerância fixada na venda e a mesma conta do programa. Se o peso digitado cair fora da faixa, a tela avisa antes de assinar, e o lote vai para disputa por divergência de peso. Com a balança da indústria pronta, a pesagem é assinada por ela (Ed25519) e o recebimento fica **atestado** (✓ na grade); sem balança, o peso fica como informado. O recibo digital passa para a carteira da indústria. A balança de teste é a mesma da cooperativa (`componentes/BalancaTeste.tsx`), gerada no navegador da indústria e cadastrada pela administração.
- **Escrow dos lotes** (intermediador): todas as vendas, com a situação do dinheiro (retido, aguardando liberação, liberado à cooperativa, devolvido, em disputa) e o peso recebido. Tem dois caminhos:
  - **Assinar venda**: a segunda assinatura da venda, descrita acima.
  - **Liberar pagamento**: para lotes recebidos pela indústria (`intermediador_confirm_liberacao`). Mostra quem recebe, quem pagou, o valor e os pesos de saída e de chegada (atestado ou informado), e pede a referência do repasse à cooperativa, por exemplo o id do Pix. Vai on-chain só o hash, com o domínio `ECOLCHAIN:LIBERACAO:v1` sobre o texto normalizado. O lote passa a **Reciclado** e pode entrar num crédito de carbono.
- **Códigos entre aparelhos** (retirada e venda): cada código aparece como QR Code, com o botão **Copiar código**. Quem lê usa a câmera ou **cola o código**, o que permite fazer tudo num computador só, por exemplo numa apresentação com um perfil de navegador por papel (`componentes/CodigoAssinatura.tsx`).
- **Trilha pública** (sem carteira): busca pelo nome de um participante (coletor, cooperativa, indústria, transportador), pela referência de um comprovante (o hash é recalculado no navegador) ou pelo endereço de um lote ou carteira, e mostra lote de origem → lote de venda → consumo pela indústria → crédito de carbono. Aceita `?q=` na URL para compartilhar o link. No RPC público da devnet, buscas grandes podem esbarrar no limite de requisições (429).
- **Páginas:** o painel ainda é um esqueleto, e as demais operações abrem uma página provisória.

## Testar com uma rede local

Sem depender da devnet (nem da carteira de administração):

```bash
cd ../onchain && NO_DNA=1 anchor build        # os .so em target/deploy
cd clients && npx tsx scripts/rede-local.ts   # Surfpool com configs, participantes de teste, materiais, balanças e quatro lotes de demonstração
# em outro terminal, com o rpcUrl/wsUrl que o script mostrar:
cd web && VITE_RPC_LOCALNET=<rpcUrl> VITE_WS_LOCALNET=<wsUrl> npm run dev
```

Na interface, escolha a rede **Localnet**. Os lotes de venda de demonstração: #1 vendido (esperando a retirada), #2 em leilão com lances da Indústria Demo e da Recicla Sul (esperando o prazo e a venda; a cooperativa os vê em Disputa › Ver lances), #3 em transporte (esperando o recebimento, com a balança da indústria já cadastrada) e #4 recebido (esperando a liberação do escrow). As chaves de teste de todos os papéis usados na interface (cooperativa e sua balança, coletor 1, transportador, indústria e sua balança, operador e intermediador) ficam em `onchain/.surfpool-demo.json`, fora do git, e são reaproveitadas quando a rede é reiniciada (as carteiras importadas continuam valendo; `NOVAS_CHAVES=1` gera outras); a semente da balança vai em `localStorage["ecolchain:balanca-teste:<cooperativa>"]`.

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
| `src/solana/` | redes, cliente Kit por rede, `useCadastro` (papéis da carteira), `retirada.ts` e `venda.ts` (assinatura em vários aparelhos) |
| `src/preferencias/` | tema, fonte, idioma e rede |
| `src/i18n/` | traduções |
| `src/paginas/` | páginas: `admin/`, `cooperativa/`, `coletor/`, `Trilha.tsx`, `MinhaCarteira.tsx` e as provisórias |
| `src/componentes/` | grade, popup, título do painel, leitor de QR, campos e botões |
| `src/componentes/Logo.tsx` | logo provisório (trocar pela marca oficial) |

Depois de mudar um programa (no repositório da blockchain), rode `anchor build` e depois `npm run gerar` em `onchain/clients`; a interface passa a usar os clientes novos na hora.
