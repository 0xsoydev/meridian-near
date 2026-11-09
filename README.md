# Meridian

A market for LLM capacity, on NEAR.

Sellers list unused provider capacity as MTokens, priced at or below their provider's list price. Agents buy inference from those sellers through an OpenAI-compatible router, and owners cap what each agent can spend per day with a limit the `core` contract enforces.

Built for the NEAR Hackathon, tracks `defi` and `agents`.

## How NEAR fits

- **`core.<team>.near`** is a Rust contract that holds a USDC wallet per account, the per-agent daily limits, the perps markets, the price index and the public log of minute rollups. It is the only place money lives.
- **`ops.<team>.near`** calls `pull`, `post`, `log_rollups`, `liquidate` and `payout` through function-call keys. It can never withdraw from a wallet.
- **NEAR accounts and NEP-413** sign every listing, amendment, cancellation and key creation.
- **NEAR Intents 1Click** is the way in from another chain and the way out to one. `dry` quotes let anyone try it without funds.
- **NEAR AI Cloud** is the verifiable rail. Its TEE models are the demo market, and `/receipts` reads straight from `core`.

## What works

- The `core` contract: wallets, caps, `pull`, `payout`, perps ported from the earlier Solidity build, the index and rollups. 11 unit tests.
- The router: OpenAI-compatible streaming, prepaid MTokens, spot and limit orders, resale, a matcher, and a float that refills from the owner's wallet inside the on-chain limit.
- The keeper: rollups, index posts, liquidations and daily payouts over NEAR.
- The app: wallet, agent approval, trade, perps, sell and receipts pages on `@hot-labs/near-connect`.

Not built yet: perp trade history, the 1Click UI beyond quotes, and the subscription OAuth rails (see `docs/plan.md`).

## Run it

Requires Node ≥ 22.22.2, pnpm 10, Rust 1.95 and `cargo-near`.

```sh
pnpm install
cp .env.example .env        # fill in DATABASE_URL, SECRETS_KEY, the NEAR ids and keys
pnpm --filter web db:generate && pnpm --filter web db:migrate
pnpm --filter web seed      # prints the owner's near commands
pnpm dev                    # http://localhost:3000
```

The keeper and the demo agent:

```sh
node --experimental-strip-types --env-file=apps/web/.env keeper/main.ts
pnpm --filter demo-agent start
```

The contract:

```sh
cd contracts/core
cargo near build non-reproducible-wasm
near contract deploy <core.account> use-file target/near/meridian_core/meridian_core.wasm \
  with-init-call new json-args '{"owner":"<team>.near","ops":"ops.<team>.near","usdc":"<usdc>"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

USDC on NEAR mainnet is `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`; on testnet it is `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`.

## Checks

```sh
pnpm typecheck
pnpm build
pnpm --filter web test
cd contracts/core && cargo test
```

## Layout

```
contracts/core/     the Rust contract
apps/web/           the router, pages and API routes
keeper/             rollups, index, liquidations, payouts
agents/demo/        an agent that buys inference from the terminal
docs/plan.md        the spec
```

## Provenance

The Hedera, 0G and World ID version of this project was built at ETHGlobal Mumbai 2026. It is imported without history at the tag `pre-hackathon`; the NEAR work starts from that commit. Built with AI coding assistants, reviewed by the team.
