# Runbook

## Accounts and keys

| Account | Purpose | Keys |
|---|---|---|
| `<team>.testnet` | owner: deploy, `list_market`, `fund_vault`, takes revenue | full access, in the team wallet |
| `core.<team>.testnet` | the contract and all USDC | full access, kept for upgrades |
| `ops.<team>.testnet` | the only caller of `pull`, `post`, `log_rollups`, `liquidate`, `payout` | web: function-call key for `pull`; keeper: function-call key for the rest; full access kept offline |

Register `core` on USDC before the first deposit:

```sh
near contract call-function as-transaction <usdc> storage_deposit \
  json-args '{"account_id":"core.<team>.testnet","registration_only":true}' \
  prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' \
  sign-as <team>.testnet network-config testnet sign-with-keychain send
```

## Environment

Copy `.env.example` to `apps/web/.env`. The keeper and the agent read the same file. `NEAR_WEB_KEY` is the web function-call key; `NEAR_KEEPER_KEY` is the keeper's.

## Database

```sh
pnpm --filter web db:generate
pnpm --filter web db:migrate
```

## Contract

```sh
cd contracts/core
cargo test
cargo near build non-reproducible-wasm
near contract deploy core.<team>.testnet use-file target/near/meridian_core/meridian_core.wasm \
  with-init-call new \
  json-args '{"owner":"<team>.testnet","ops":"ops.<team>.testnet","usdc":"<usdc>"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send
```

## Seed

```sh
pnpm --filter web seed
```

It creates the house listing on `NEARAI_API_KEY` and prints the owner commands: one `list_market` per model, `fund_vault`, and `set_cap` for the shared demo key. Run them once.

## Keeper

```sh
node --experimental-strip-types --env-file=apps/web/.env keeper/main.ts
```

It publishes rollups every minute, posts the index every three, liquidates every thirty seconds and pays out once a day after 00:00 UTC.

## Rehearsal

1. `POST /api/v1/device` with a name and a cap.
2. Open `/a/<code>`, connect a wallet, fund and approve.
3. Poll the device endpoint; take the `rk_`.
4. One streamed completion debits the float.
5. A spot buy, then sell half into the book.
6. A perp long, add margin, close.
7. Force a payout: `closeDay(yesterday)` on the keeper, then `payPending`.
8. `/receipts` shows a rollup; with a NEAR AI key it also shows a verified proof.

## Recovery

- A payout stays `pending` when `core.payout` fails; the keeper retries every minute.
- A device code expires after 10 minutes; call `/device` again.
- A listing whose key is refused goes `invalid`; re-list on `/sell`.
- A pull that succeeded but was not credited costs one pull; run the request again.
