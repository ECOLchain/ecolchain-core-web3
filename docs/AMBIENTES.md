# Ambientes e redes Solana

Segregação de ambientes do `ecolchain-core-web`: cada ambiente do frontend
aponta para uma rede Solana diferente. **Mainnet ainda não é usada** — os
programas só serão publicados nela futuramente.

| Ambiente | Hostname | Rede Solana | Proteção |
|---|---|---|---|
| dev | `app-dev-tester.ecolchain.com` | **devnet** | Basic Auth + `noindex` |
| prod | `app.ecolchain.com` | **testnet** | — |
| local | `localhost` (vite dev) | **localnet** (`127.0.0.1:8899`) | — |
| futuro | `app.ecolchain.com` | **mainnet** | quando programas publicarem |

## Como a rede é escolhida

- `src/solana/redes.ts` define `REDES` (devnet, testnet, localnet) e
  `REDE_PADRAO` — a rede default quando o usuário ainda não escolheu uma no
  seletor (preferência fica salva no navegador).
- `REDE_PADRAO` vem de `import.meta.env.VITE_REDE_PADRAO`, definido **no build**
  pela esteira:
  - builds de dev (branches `feature/**` e `develop`): sem a var → `devnet`
  - build de prod (branch `main`): `VITE_REDE_PADRAO=testnet`
- RPCs podem ser sobrescritos por `VITE_RPC_<REDE>` / `VITE_WS_<REDE>`
  (útil para RPC dedicado se o público der rate-limit).

## Esteira (feature -> develop -> main)

```
push em feature/** ──► typecheck + build (devnet) → sync → ecolchain-web-dev
                     └─► auto-PR → develop (preview = domínio dev + credenciais)
push em develop ─────► idem → ecolchain-web-dev
                     └─► auto-PR → main (preview = domínio dev + credenciais)
push em main ────────► typecheck + build (testnet) → sync → ecolchain-web-prod
                     └─► purge de cache Cloudflare → app.ecolchain.com
```

Os buckets (`ecolchain-web-dev`, `ecolchain-web-prod`), os workers de proxy com
SPA-fallback e os domínios são provisionados por Terraform no repo
`ecolchain-infra-general` (módulos `core-web/dev` e `core-web/prod`).

## Dependência: clientes onchain

O build importa `@clientes` → `../onchain/clients/src` (clientes Solana gerados
por Codama), que vive no repo privado `ecolchain-core-chains`
(`onchain/clients/src`).

- **No CI**: a esteira faz checkout de `ecolchain-core-chains` (secret
  `ONCHAIN_CHECKOUT_PAT`) e cria um symlink `../onchain` → `<chains>/onchain`.
- **Local**: crie o mesmo symlink uma vez:
  ```bash
  ln -sfn ~/Dev/ecolchain/ecolchain-core-chains/onchain ~/Dev/ecolchain/onchain
  ```
