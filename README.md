# Web interface — EcolChain

React 19 + Tailwind 4 (Vite). Connects Solana wallets through the Wallet Standard (`@solana/kit-plugin-wallet`) and reads the wallet's registration directly from the programs, using the Codama clients from the blockchain repository.

## Repositories

| Repository | Contents |
|---|---|
| [ecolchain-core-web3](https://github.com/ECOLchain/ecolchain-core-web3) (this one) | web interface |
| [ecolchain-core-chains](https://github.com/ECOLchain/ecolchain-core-chains) | Anchor programs, TypeScript clients (`onchain/clients`), ADRs and devnet operations |

The interface imports the clients through the `@clientes/*` alias, which points to `../onchain/clients/src`. That is why **this repository must live inside the blockchain repository folder, in the `web/` folder** (which is in that repository's `.gitignore`):

```bash
git clone https://github.com/ECOLchain/ecolchain-core-chains.git ecolchain
git clone https://github.com/ECOLchain/ecolchain-core-web3.git ecolchain/web
cd ecolchain/onchain/clients && npm install     # client dependencies
cd ../../web && npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build in dist/
```

The generated clients (`onchain/clients/src/generated`) are committed to the blockchain repository, so you don't need to build the programs to run the interface.

## Recommended wallet: Solflare

Use **[Solflare](https://solflare.com)** (browser extension or mobile app) for every role. It is the wallet used in the devnet operation (the administration signs with a Solflare wallet), and it meets three requirements EcolChain depends on:

- **Signs without changing the transaction.** The lot pickup is signed by two people, each on their own device: the cooperative signs first and the carrier completes it. Some wallets add instructions when signing (protections or a priority fee). That changes the transaction and invalidates the other party's signature. In that case, the screen warns: "A carteira alterou a transação ao assinar" (the wallet changed the transaction while signing).
- **Signs without sending.** Solflare implements the Wallet Standard's standalone signing (`solana:signTransaction`), used in the pickup.
- **Devnet.** The wallet's network can be switched to Devnet, the programs' current network. The network chosen in the wallet must match the network selector in the interface.

Other Wallet Standard–compatible wallets show up under the **Connect** button and work for the single-signature screens, but they are not tested.

## What already exists

- **Fixed header:** the logo and, prominently, the **badge of who is operating** ("Operating as", role and registered name), in a color per role, repeated in a strip at the top of the header. It is meant for presentations: from a distance you can tell whether the screen belongs to the cooperative, the collector, the carrier, the industry or the administration. On the right: text size (S / M / L), light/dark theme, network and wallet. On narrow screens, the preferences go into a panel and the wallet shows only its icon.
- **Side menu:** the ☰ button collapses the menu to icons only (wide screens) or opens a drawer (mobile). With no wallet connected, every option is disabled.
- **Menu per role:** on connect, the interface reads the wallet's `Participante` in `ecol_lote` and the keys of the three configs. The menu shows only the operations of each role (cooperative, industry, carrier, collector, operator, payment intermediary, registrar, Zupy, arbiter), defined in `src/navegacao/menu.ts`.
- **Languages:** pt-BR, en-US and es-ES (`src/i18n/locales`), chosen at the bottom of the side menu, with a flag. With the menu collapsed, only the flag shows and the list opens beside it.
- **Networks:** devnet (default) and localnet. Mainnet stays locked until the programs are published there.
- **Central panel layout:** a frame with the title bar (subheader) fixed at the top; only the body scrolls. Every listing is a grid with search (accent-insensitive), filters, sorting by clicking the header, and 7 records per page (`componentes/grade.tsx`). Inserts and edits open in a popup (`componentes/dialogo.tsx`), with Save and close in the header; the toolbar actions act on the selected row (Enter on a row opens the edit). Since the data comes whole from the blockchain, filtering, sorting and pagination happen in the browser.
- **Administration** (operator wallet): working screens for **Participants** (register with a name, edit the name, activate/deactivate), **Scales** (name, owner chosen by name and wallet; edit the name, activate/deactivate) and **Materials** (register, rename, activate/deactivate). Each action is a transaction signed in the wallet; the result shows the transaction link or the error in plain language.
- **Cooperative** (wallet with the Cooperative role):
  - **Source lots:** records incoming material, with its origin (collector, own sorting, donation, purchase or independent waste picker), the material and the weight; the scale signs the weighing. For a collector, it picks the registered collector; for the others, it takes a reference (invoice, receipt, CNPJ), of which only a hash goes on-chain.
  - **Sale lots:** combines source lots of the same material, weighs the consolidated load (accepted from −10% to +2% of the sum) and closes the lot (create, link 10 source lots per transaction, weigh and close). Then it lists the lot for auction or cancels the listing. Before the sale, **Undo** returns the source lots and burns the lot's digital receipt.
  - **Test scale (devnet/localnet only):** the first time, the screen generates a scale key stored in the browser; the administration registers it under Scales with the cooperative as owner. In real operation, the device signs each weighing.
  - **QR reader:** in "New source lot", the **Scan QR** button opens the camera and reads the QR Code from the collector's My wallet screen, selecting them in the list (`componentes/LeitorQr.tsx`, `jsqr`). The camera only opens over **https** or on `localhost`.
  - **Invoice or receipt for the sale lot:** optional; it becomes the `evidencias_hash` in the same format as the origin references, and the trail finds the lot by the text.
- **Collector:** **My wallet** (name and a QR Code with the wallet address, for the cooperative to scan on delivery) and **My lots** (a grid with the wallet's source lots at any cooperative, the sale lot and the status of each, with a link to the trail).
- **Carrier:** **My wallet**, so the cooperative can check who is picking up the lot.
- **Pickups** (cooperative and carrier): the pickup requires both parties' signatures (`transportador_pickup_lote`).
  1. The cooperative selects the sold lot, identifies the carrier by the QR on their My wallet screen (or from the list) and signs.
  2. The screen shows a QR with the cooperative's signature, the lot, both wallets and the blockhash. The code is valid for about a minute; after that, "Generate new code".
  3. The carrier, in **Sign pickup**, scans the QR. Their device rebuilds the same transaction from the blockchain, checks the cooperative's signature, shows the lot for review, signs and sends.
  4. The cooperative's screen detects the pickup on its own. The lot moves to "In transit", and the digital receipt goes to the carrier's wallet.

  The carrier sees the lots they picked up in the grid. Code in `src/solana/retirada.ts`.
- **Sale** (administration, payment intermediary and industry): `industria_accept_venda` requires all three signatures.
  1. In **Auctions**, the administration selects the listed lot and records the result: winning industry, amount (≥ minimum price), and the references of the escrow deposit and of the minutes. It signs and shows the code.
  2. In **Batch escrow**, the payment intermediary scans the code, checks it and signs.
  3. In **Purchases**, the industry scans, checks, signs and sends. The administration's screen detects the sale on its own.

  The transaction uses a **durable nonce**: a system account derived from the operator's wallet (`createAccountWithSeed`, seed `ecolchain-venda`), created on the first sale for ≈ 0.0015 SOL. That is why the code **does not expire with time**, only when another sale uses the nonce. Each device rebuilds the transaction from the blockchain and checks the previous signatures before signing. In Auctions, the administration also closes expired auctions with no bids. Code in `src/solana/venda.ts`.
- **Receipts** (industry): the lots in transit to the industry, with the delivery deadline (in red if overdue). **Register receipt** shows the departure weight and the range accepted without dispute, which uses the tolerance fixed at the sale and the same calculation as the program. If the entered weight falls outside the range, the screen warns before signing, and the lot goes into a weight-discrepancy dispute. With the industry's scale ready, the weighing is signed by it (Ed25519) and the receipt is **attested** (✓ in the grid); without a scale, the weight is recorded as declared. The digital receipt moves to the industry's wallet. The test scale is the same as the cooperative's (`componentes/BalancaTeste.tsx`), generated in the industry's browser and registered by the administration.
- **Batch escrow** (payment intermediary): all sales, with the status of the money (held, awaiting release, released to the cooperative, refunded, in dispute) and the received weight. It has two paths:
  - **Sign sale**: the sale's second signature, described above.
  - **Release payment**: for lots received by the industry (`intermediador_confirm_liberacao`). It shows who receives, who paid, the amount and the departure and arrival weights (attested or declared), and asks for the reference of the transfer to the cooperative, for example the Pix id. Only the hash goes on-chain, with the domain `ECOLCHAIN:LIBERACAO:v1` over the normalized text. The lot moves to **Recycled** (`Reciclado`) and can join a carbon credit.
- **Codes between devices** (pickup and sale): each code appears as a QR Code, with a **Copy code** button. The reader uses the camera or **pastes the code**, which makes it possible to do everything on a single computer, for example in a presentation with one browser profile per role (`componentes/CodigoAssinatura.tsx`).
- **Public trail** (no wallet): searches by the name of a participant (collector, cooperative, industry, carrier), by the reference of a proof document (the hash is recomputed in the browser) or by the address of a lot or wallet, and shows source lot → sale lot → consumption by the industry → carbon credit. It accepts `?q=` in the URL for sharing the link. On the public devnet RPC, large searches may hit the request limit (429).
- **Pages:** the dashboard is still a skeleton, and the other operations open a placeholder page.

## Testing with a local network

Without depending on devnet (or on the administration wallet):

```bash
cd ../onchain && NO_DNA=1 anchor build        # the .so files in target/deploy
cd clients && npx tsx scripts/rede-local.ts   # Surfpool with configs, test participants, materials, scales and four demo lots
# in another terminal, with the rpcUrl/wsUrl the script prints:
cd web && VITE_RPC_LOCALNET=<rpcUrl> VITE_WS_LOCALNET=<wsUrl> npm run dev
```

In the interface, choose the **Localnet** network. The demo sale lots: #1 sold (awaiting pickup), #2 in auction with bids from Indústria Demo and Recicla Sul (awaiting the deadline and the sale; the cooperative sees them in Marketplace › View bids), #3 in transit (awaiting receipt, with the industry's scale already registered) and #4 received (awaiting the escrow release). The test keys for every role used in the interface (cooperative and its scale, collector 1, carrier, industry and its scale, operator and payment intermediary) are in `onchain/.surfpool-demo.json`, outside git, and are reused when the network restarts (imported wallets keep working; `NOVAS_CHAVES=1` generates new ones); the scale seed goes in `localStorage["ecolchain:balanca-teste:<cooperativa>"]`.

Preferences (theme, font, language and network) are kept in the browser's `localStorage`.

## Configuration

| Variable | Default |
|---|---|
| `VITE_RPC_DEVNET` | `https://api.devnet.solana.com` |
| `VITE_WS_DEVNET` | derived from the RPC |
| `VITE_RPC_LOCALNET` | `http://127.0.0.1:8899` |
| `VITE_WS_LOCALNET` | derived from the RPC |

## Structure

| Path | Contents |
|---|---|
| `src/layout/` | `Shell` (header + menu + content), `Header`, `MenuLateral`, `Carteira`, `Controles` |
| `src/navegacao/menu.ts` | menu items and which roles see each one |
| `src/solana/` | networks, Kit client per network, `useCadastro` (wallet roles), `retirada.ts` and `venda.ts` (multi-device signing) |
| `src/preferencias/` | theme, font, language and network |
| `src/i18n/` | translations |
| `src/paginas/` | pages: `admin/`, `cooperativa/`, `coletor/`, `Trilha.tsx`, `MinhaCarteira.tsx` and the placeholders |
| `src/componentes/` | grid, popup, panel title, QR reader, fields and buttons |
| `src/componentes/Logo.tsx` | EcolChain logo in the header (`public/EcolChain-header.png`) |

After changing a program (in the blockchain repository), run `anchor build` and then `npm run gerar` in `onchain/clients`; the interface picks up the new clients immediately.
