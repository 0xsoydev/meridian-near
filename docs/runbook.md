# Runbook

## Accounts and keys

| Account | Purpose | Keys |
|---|---|---|
| `<team>.testnet` | owner: deploy, `list_market`, `fund_vault`, takes revenue | full access, in the team wallet |
| `core.<team>.testnet` | the contract and all USDC | full access, kept for upgrades |
| `ops.<team>.testnet` | the only caller of `pull`, `post`, `log_rollups`, `liquidate`, `payout`, and the relay for signed orders | web: function-call key for `pull`; keeper: function-call key for `post`, `log_rollups`, `liquidate`, `payout`; relay: function-call key for `set_cap_signed`, `withdraw_signed`, `modify_signed`; full access kept offline |

Register `core` on USDC before the first deposit:

```sh
near contract call-function as-transaction <usdc> storage_deposit \
  json-args '{"account_id":"core.<team>.testnet","registration_only":true}' \
  prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' \
  sign-as <team>.testnet network-config testnet sign-with-keychain send
```

## Environment

Copy `.env.example` to `apps/web/.env`. The keeper and the agent read the same file. `NEAR_WEB_KEY` is the web function-call key; `NEAR_KEEPER_KEY` is the keeper's; `NEAR_RELAY_KEY` is the relay's. `SOLANA_RPC_URL` is optional; without it Solana calls use the public mainnet RPC.

## Database

```sh
pnpm --filter web db:generate
pnpm --filter web db:migrate
```

`drizzle/0002` adds `keys.parent_id` and `keys.expires_at` for swarms. Run `db:migrate` against the production database before a build with swarms serves traffic; the change only adds nullable columns and an index.

## Contract

```sh
cd contracts/core
cargo test
cargo near build non-reproducible-wasm --no-abi
near contract deploy core.<team>.testnet use-file target/near/meridian_core.wasm \
  with-init-call new \
  json-args '{"owner":"<team>.testnet","ops":"ops.<team>.testnet","usdc":"<usdc>"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send
```

To upgrade a deployed `core` (no state migration is needed), deploy the new wasm without the init call, then give `ops` the relay key and put its private key in `NEAR_RELAY_KEY`:

```sh
near contract deploy core.<team>.testnet use-file target/near/meridian_core.wasm \
  without-init-call network-config testnet sign-with-keychain send
near account add-key ops.<team>.testnet grant-function-call-access \
  --allowance '1 NEAR' --contract-account-id core.<team>.testnet \
  --function-names 'set_cap_signed, withdraw_signed, modify_signed' \
  autogenerate-new-keypair save-to-keychain network-config testnet sign-with-keychain send
```

## Seed

```sh
pnpm --filter web seed
```

It creates the house listing on `NEARAI_API_KEY` and prints the owner commands: one `list_market` per model, `fund_vault`, and `set_cap` for the shared demo key. Run them once. With `STUB_RAIL_URL` it also lists the four stub models at different prices, so a local swarm has models to pick.

## Keeper

```sh
node --experimental-strip-types --env-file=apps/web/.env keeper/main.ts
```

It publishes rollups every minute, posts the index every three, liquidates every thirty seconds, pays seller earnings once a day after 00:00 UTC and pending refunds (revoked keys, Move to wallet) on every run, and moves what ended swarms didn't spend back to their parent keys every minute.

## Deploy

1. Vercel: import the repository and set the root directory to `apps/web`. `apps/web/vercel.json` runs `pnpm db:migrate && pnpm build`, so the schema follows each deploy. Add Neon from the Storage tab; it sets `DATABASE_URL`.
2. Environment: every name in `.env.example`, mainnet values for Production and testnet values for Preview, plus `CRON_SECRET`. `PUBLIC_HOST` is the deployment's own URL, because signed messages are checked against it.
3. The keeper: `GET /api/v1/tick` with `Authorization: Bearer $CRON_SECRET` runs every keeper job once. `.github/workflows/tick.yml` calls it every 5 minutes; set the repository secret `CRON_SECRET` and the variable `MERIDIAN_URL`. On Vercel Pro a per-minute Vercel Cron on the same path also works, and `keeper/main.ts` still runs on any always-on host.

## Rehearsal

1. `POST /api/v1/device` with a name and a cap.
2. Open `/a/<code>`, connect a wallet, fund and approve.
3. Poll the device endpoint; take the `rk_`.
4. One streamed completion debits the float.
5. A spot buy, then sell half into the book.
6. A perp long, add margin, close.
7. Force a payout: `closeDay(yesterday)` on the keeper, then `payPending`.
8. `/receipts` shows a rollup; with a NEAR AI key it also shows a verified proof.
9. A swarm: in any git repository, `MERIDIAN_URL=<host> node apps/web/public/skills/meridian-swarm/swarm.ts 3 "<task>" --budget 0.06`. Locally, start the stub rail with `STUB_SHELL='echo hello >> README.md'` so the sub-agents make a change.
10. A runaway agent: a key with a $0.50 limit, the stub rail with `STUB_TOKENS=150000`, then `RUNAWAY=1 RK_KEY=<key> MODEL=glm-5.3 pnpm --filter demo-agent start`. It stops at the 403 after about 19 requests.
11. Move to wallet on `/wallet`: the key's float leaves it and the wallet balance rises on the next keeper run.
12. Deposit from another chain on `/wallet`: on testnet a token on Solana shows a real mainnet price; paying needs mainnet.
13. `RK_KEY=<key> pnpm --filter web exec node --experimental-strip-types scripts/e2e.ts` checks the swarm money path: spent plus returned equals the budget.
14. Connect MetaMask or Phantom from the picker, approve an agent with one signature, and on mainnet pay a deposit with the same wallet. `GET /api/v1/signed?owner=<id>` shows the owner's next nonce.

## Recovery

- A payout stays `pending` when `core.payout` fails; the keeper retries every minute.
- A device code expires after 10 minutes; call `/device` again.
- A listing whose key is refused goes `invalid`; re-list on `/sell`.
- A pull that succeeded but was not credited costs one pull; run the request again.
