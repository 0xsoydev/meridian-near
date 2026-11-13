# Meridian on NEAR — spec

The spec for the NEAR rebuild. `AGENTS.md` makes it binding: change this file first when the design changes.

- Development ends 2026-11-14 23:59 UTC. Judging runs 16–18 Nov. The hosted demo stays up until 2026-11-25.
- Tracks: `defi` and `agents`, plus `privacy` if the NEAR AI proofs ship (§9.12).
- Baseline: the ETHGlobal Mumbai build on Hedera, 0G and World ID, imported without history at the tag `pre-hackathon`. Only work after that tag is judged (HACKATHON.md Q-002 to Q-004). Its spec is `git show pre-hackathon:docs/plan.md`, cited below as "baseline §n".
- Removed: Hedera (x402, HCS, mirror node, scheduled payouts), 0G (rail, Galileo, Solidity), World ID, Privy, wagmi, viem, and the comfy.fun hookup.

Built: `claude-code` and `codex` (§9.15). Each seller connects their own subscription through a fresh PKCE login; the grant is sealed at rest and refreshed server-side. Reverses the earlier removal; review both vendors' terms before enabling these rails in production.

---

## 1. Product

- **Sellers** list unused LLM API capacity as MTokens, at a limit price at or below their provider's list price. Capacity comes from a rail: a provider API key the seller owns (§1.1).
- **Owners** are NEAR accounts. An owner keeps USDC in a Meridian wallet inside the `core` contract and gives each agent a router key (`rk_`) with a daily limit set on-chain.
- **Agents** run in a terminal with `OPENAI_BASE_URL` and an `rk_` key, and never hold a NEAR key. The router refills each key's float from the owner's wallet, inside the owner's limit, before it runs dry. The daily limit is the only stop; raising it is one approval on a phone.
- **Spot**: agents and humans buy MTokens ahead on the book and resell what they won't use.
- **Perps**: cash-settled perps on the venue's $/MToken index, margined from the Meridian wallet. Sellers short to lock in tomorrow's revenue; buyers go long to cap their costs.
- **Payouts**: sellers are paid daily into their Meridian wallet and withdraw to NEAR or any chain.
- **Revenue**: `TAKE_BPS` (1000) of every request charge and spot fill, and 10 bps of perp notional.

| Rule | Source |
|---|---|
| Everything runs on NEAR. The hosted demo runs on testnet with test USDC; mainnet is the same build with mainnet values (`NEAR_NETWORK`) | user |
| No Hedera, 0G, World ID, x402, Privy, or EVM code | user |
| Sellers may list Claude Code and Codex accounts; the grant never leaves the server | user |
| Agents never hold a NEAR key, and no screen asks anyone for a private key | user |
| An agent never stops for money before its owner's daily limit | user |
| An ask is at or below the blended list price of its own rail, and every listing has a price | plan |
| One MToken = 1M mixed tokens (3 input : 1 output); capacity and usage are token counts | plan |
| A request is served entirely from prepaid MTokens or entirely at the current ask | plan |
| Metering uses the rail's reported token counts, never a cost field | plan |
| USDC leaves an owner's wallet only through the owner's own `withdraw` or `modify`, or a `pull` inside the limit the owner set with `set_cap` | plan |
| NEAR Intents has no testnet: 1Click runs on mainnet only, and testnet shows `dry` quotes | HACKATHON.md Q-007 |
| near-api-js 7.4 needs Node ≥ 22.22.2; near-sdk 5.30.1 needs Rust ≥ 1.95 | research |
| A function-call key cannot attach a deposit, so every call that needs 1 yoctoNEAR is signed in a wallet | research |
| NEAR AI Cloud resale is allowed, confirmed by NEAR AI | user |

### 1.1 Rails (`lib/rails.ts`)

Static config, one entry per provider. The `0g` rail and `resetPeriod` go. No remaining rail has expiring credits, so market asks, the daily listing reset and prepaid expiry go too.

| Rail | Base URL | Key check | Models and prices |
|---|---|---|---|
| `near-ai` | `https://cloud-api.near.ai/v1` | `POST /v1/check_api_key` (free; a bad key on `/v1/models` still gets the public list) | `GET /v1/models` `pricing.prompt`/`completion` (USD per token); TEE flag from `GET /v1/model/list` `metadata.verifiable` |
| `openrouter` | `OPENROUTER_BASE_URL` | `GET /key` | top 30 by weekly tokens, needs `OPENROUTER_API_KEY` |
| `commandcode` | `COMMANDCODE_BASE_URL` | one 1-token request | live list |
| `zen`, `opencode-go`, `anthropic`, `openai` | `*_BASE_URL` | `/models` | static lists, OpenRouter prices |
| `claude-code`, `codex` | `CLAUDE_CODE_BASE_URL`, `CODEX_BASE_URL` | connected account (§9.15) | static lists, OpenRouter prices |
| `stub` | `STUB_RAIL_URL` | `/models` | tests only |

`near-ai` requests carry `x-no-aliasing: true` and `Accept-Encoding: identity`, and their proofs are kept (§9.12). `Verifiability` becomes `"tee"` or `null`.

## 2. What NEAR does here

| NEAR piece | Role | Track |
|---|---|---|
| `core.<team>.near`, Rust (near-sdk) | wallets, per-agent limits, perps, index, public fill log | `defi`, `agents` |
| Native USDC on NEAR | the only money | all |
| NEAR accounts and NEP-413 | sign-in, listings, key creation | all |
| Signed orders on `core` | MetaMask, Phantom and any Ethereum or Solana wallet own money on `core` by address and sign limits, withdrawals and perps trades; `core` verifies them | all |
| `set_cap` and `pull` | agent spending limits enforced by the contract | `agents` |
| Function-call keys on `ops` | the servers can pull, post, log, liquidate and pay out, never withdraw | `agents` |
| NEAR Intents 1Click | fund `core` from any chain, withdraw to any chain, `dry` quotes for judges | `defi`, `agents` |
| NEAR AI Cloud | TEE rail with per-response signatures on `/receipts` | `privacy` |

Not used: Chain Signatures, x402, the Agent API, Sputnik DAO, NEP-245 MTokens.

## 3. System

```
 Agent, terminal ──https, rk_──> Router · Next.js 16 on Vercel ───────────────> LLM rails
   reads /skill.md                 /api/v1/chat/completions (OpenAI shape)       NEAR AI (TEE)
                                   /api/v1/device · me · trades · sells · book   OpenRouter · Anthropic · …
 Human, browser or phone           pages / /trade /perps /sell /wallet /receipts /agents /a/[code]
   │ NEAR wallet (near-connect)    Neon Postgres: accounts · keys · listings · book · usage · payouts
   │                                  │ web key: pull
   │                                  v
   └─ fund · set_cap · modify ───> core.<team>.near ──ft_transfer──> USDC (NEP-141)
      withdraw · liquidate           wallets · caps · treasury · vault · markets · positions
                                     index posts · rollups · fills
                                     ^ keeper key: post · log_rollups · liquidate · payout
 Keeper, Node 22, always on ─────────┘ 60 s rollups · 180 s index · 30 s liquidations · daily payouts
 Other chains ──1Click deposit address──> core, msg {"fund":{"to":"<owner>"}}
```

### 3.1 Where the money is

```
 IN    NEAR       usdc.ft_transfer_call(core, amount, {"fund":{}}) ──────────┐
       any chain  1Click → core, msg {"fund":{"to":"<owner>"}} ──────────────┴──> wallets[owner]
 CORE  wallets[owner] ── pull, inside the owner's limit per key per day ──> treasury
       wallets[owner] ── modify(+margin) ──> position ── close: equity ──> wallets[owner]
       vault: the house side of every perp · perp fees ──> treasury
 OUT   treasury ── payout(account, amount, id), daily ──> wallets[seller, or refunded owner]
       wallets[x] ── withdraw ──> x.near, or a 1Click address on any chain
 DB    keys.balance (the float): + pulls, − charges and MToken buys, + resale proceeds
       90 % of each charge ──> that seller's next daily payout · Meridian keeps the rest
```

## 4. Accounts and keys

| Account | Role | Keys |
|---|---|---|
| `<team>.near` (`NEAR_OWNER_ID`) | contract owner (deploy, `list_market`, `fund_vault`); takes revenue with `payout` to itself, then `withdraw` | full access, in the team wallet |
| `core.<team>.near` (`NEAR_CORE_ID`) | the contract, holding all USDC; registered on USDC | full access, kept for upgrades until submission |
| `ops.<team>.near` (`NEAR_OPS_ID`) | the only caller of `pull`, `post`, `log_rollups` and `payout` | web: function-call key for `pull` (`NEAR_WEB_KEY`); keeper: function-call key for `post`, `log_rollups`, `liquidate`, `payout` (`NEAR_KEEPER_KEY`); relay: function-call key for `set_cap_signed`, `withdraw_signed`, `modify_signed` (`NEAR_RELAY_KEY`); full access kept offline |

The web app and the keeper use separate keys so their nonces never collide. Each function-call key has a 1 NEAR gas allowance.

## 5. Repository

```
apps/web/
  app/page.tsx                 landing: the story diagrams, "use from your terminal", three ways in
  app/(site)/{trade,perps,sell,keys,receipts,agents}/
  app/a/[code]/page.tsx        approve an agent, or a higher limit
  app/api/v1/…, app/api/listings/…
  public/skill.md              the manual agents read
  public/skills/meridian-swarm/ SKILL.md and swarm.mjs: the swarm skill agents install (§9.14)
  lib/near.ts                  RPC, core views and calls, ops accounts, NEP-413 verify, tx status
  lib/pay.ts                   float top-up, 402/403 bodies (replaces x402.ts)
  lib/approvals.ts             device codes and limit raises (World removed)
  lib/intents.ts               1Click quotes, status and deposit submits, in any token
  lib/rollup.ts                minute rollups (moved from hcs.ts) and index math
  lib/perp.ts, lib/payouts.ts  rewired to core
  kept, edited where §8–§10 say: price, rails, book, bids, offers, ledger, listings, accounts, auth, secrets, schema, db, errors, types, utils, testkit
  scripts/{seed,e2e,stub-rail}.ts
contracts/core/                Cargo.toml, rust-toolchain.toml, src/lib.rs (unit tests inside)
keeper/{main,jobs}.ts
agents/demo/main.ts
```

- Deleted: `lib/{x402,mirror,hcs,world,comfy,perp-events,chain,abi}.ts` and their tests; `app/api/v1/{topup,balance,approvals,agents}`, `app/api/v1/keys/deposit`, `app/api/sellers`, `app/approve`; `app/(site)/wallet-deposit.ts`; `scripts/{hedera-setup,hedera-agent,og-e2e}.ts`; `agents/demo/market.ts` (its buy and sell steps move into `main.ts`); `contracts/{src,test,script,lib,foundry.toml,foundry.lock}` and `.gitmodules`; `apps/web/drizzle/`, regenerated as one initial migration on a fresh database.
- CI: the web job drops the Privy placeholder, and the contracts job runs `cargo test` in `contracts/core`.

## 6. Stack (exact pins)

| Area | Packages |
|---|---|
| App | next 16.4.3, react 19.3.1, react-dom 19.3.1, typescript 7.0.2, @types/node 22 |
| UI | tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, lightweight-charts 5.2.1, qrcode 1.5.4, motion, lucide-react |
| NEAR | near-api-js 7.4.0 (server, keeper, agent); @hot-labs/near-connect 0.12.0 (browser only) |
| Intents | `fetch` to `https://1click.chaindefuser.com/v0`, no SDK |
| Data | drizzle-orm 0.45.4, drizzle-kit 0.31.11, @neondatabase/serverless 1.2.0, zod 4.6.7 |
| Agent | openai 7.45.0 |
| Contract | Rust 1.95.0 (`rust-toolchain.toml`, target `wasm32-unknown-unknown`), near-sdk 5.30.1, cargo-near 0.23.0, near CLI 0.31 |
| Runtime | Node ≥ 22.22.2 (`nvm install 22`) |

Removed: @privy-io/*, wagmi, viem, @x402/*, @hiero-ledger/sdk, @worldcoin/*, Foundry and OpenZeppelin.

## 7. Coding rules

Baseline §6, plus:
- External data enters as `unknown` and leaves through zod: request bodies, upstream responses, NEAR RPC results, 1Click and wallet outputs.
- Money and token counts are `bigint` in TypeScript, `u128`/`i128` in the contract, decimal strings in JSON. USDC has 6 decimals on NEAR, so 1 atomic unit = 1 micro-USD.
- A pull is credited to the float right after the call returns. A crash between the call and the credit costs the owner at most one pull; the next request pulls again (§9.4).
- Contract: debit before any outgoing transfer; every cross-contract call has a callback that restores state on failure; methods that move an owner's money require 1 yoctoNEAR.
- Router errors keep the OpenAI shape, and a blocked request adds `action` (§8.2).
- One runnable check per non-trivial logic: `node:test` in `apps/web/lib/*.test.ts`, `cargo test` in `contracts/core`.

## 8. Router API

### 8.1 Endpoints

| Method | Path | Auth | What |
|---|---|---|---|
| POST | `/api/v1/chat/completions` | `Bearer rk_` | as before, with the float refilled by `pull` (§9.4); headers `X-Router-Model`, `X-Meridian-Paid-From` (`prepaid` or `float`), `X-Meridian-Float` |
| GET | `/api/v1/oauth/start?rail=` | none | sets the sealed ten-minute state cookie and redirects to the provider's authorize page (§9.15) |
| POST | `/api/v1/device` | none | `{name, cap_usd_micro?}` → `{device_code, user_code, verification_uri_complete, qr, expires_at, interval}`; `{demo:true}` with `DEMO_KEYS=1` → `{key, key_id}` on the shared demo limit |
| GET | `/api/v1/device/{device_code}` | the device code | `{status}`; `approved` carries `{key, key_id}` once |
| POST | `/api/v1/approvals/{user_code}/confirm` | none: the on-chain limit is the proof | `{account_id}` → approved when `cap(account_id, key).left > 0`; for `raise_cap` the account must own the key |
| POST | `/api/v1/approvals/{user_code}/deny` | none | → denied |
| GET | `/api/v1/me` | `Bearer rk_` | owner, wallet, float, limit (per day, used, left), prepaid, open orders; `?format=text` returns one line |
| POST, GET | `/api/v1/keys` | NEP-413 `create_key`, `list_keys` | create a key, or list the owner's keys with their last 50 requests |
| DELETE | `/api/v1/keys/{id}` | NEP-413 `revoke_key` | revoke; the float becomes a refund payout (§9.4) |
| PATCH | `/api/v1/keys/settings` | `Bearer rk_` | `default_model` only |
| POST | `/api/v1/quotes` | none | 1Click quote to fund or withdraw in any token; `dry:true` previews, and testnet always previews (§9.11) |
| GET | `/api/v1/quotes/{deposit_address}?memo=` | none | 1Click status; `memo` when the quote carried one |
| POST | `/api/v1/quotes/{deposit_address}` | none | `{tx_hash, memo?}` tells 1Click the deposit was sent |
| POST | `/api/v1/keys/return` | NEP-413 `return_float` | `{key_id}` → moves the key's free balance to the owner's Meridian wallet; the key keeps working (§9.4) |
| POST, GET, DELETE | `/api/v1/swarm` | `Bearer rk_` | start a swarm, read its agents' spend, end it and return the leftover (§9.14) |
| GET | `/api/v1/perps/account?account=` | none | wallet, positions, equity, liquidation prices from `core` |
| GET | `/api/v1/perps/market?model=` | none | the market view, the open-interest cap and its recent index posts |
| GET, POST | `/api/v1/perps/history` | none | an account's `position_modified` and `liquidated` events, newest first; POST takes up to four transaction hashes, reads their outcomes over RPC and stores the events `core` itself emitted, so nothing a caller sends can forge one; the keeper records its liquidations |
| GET | `/api/v1/wallet?account=` | none | the Meridian wallet balance and the USDC still in the NEAR account |
| POST | `/api/v1/keys/revoke` | NEP-413 `revoke_key` | revoke an owner's key |
| GET | `/api/v1/approvals/[userCode]` | the user code | the key id and requested limit for `/a/[code]` |
| kept | `trades`, `sells`, `bids`, `offers`, `holdings`, `fills`, `usage`, `book`, `models`, `status`, `payouts`, `/api/listings/*` | as before | a short float refills by `pull`; listings are NEP-413 signed; `status` also reports the treasury's liabilities |
| removed | `topup`, `balance`, `keys/deposit`, World `approvals`, `agents/comfy`, `/api/sellers/*` | | |

`maxDuration = 300` on the chat route.

### 8.2 Blocked requests

Many OpenAI clients show only `error.message`, so the message carries the link. `action` is for agents that read JSON.

```json
{
  "error": { "type": "permission_error", "code": "approval_required",
    "message": "claude-code used today's $5.00. Ask alice.near to raise it: https://<host>/a/9QT4MX (code 9QT-4MX)" },
  "action": { "url": "https://<host>/a/9QT4MX", "code": "9QT-4MX", "qr": "<qrcode utf8>",
    "near_cli": "near contract call-function as-transaction core.<team>.near set_cap json-args '{\"key\":\"<key_id>\",\"per_day\":\"10000000\"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as alice.near network-config mainnet sign-with-keychain send",
    "poll": "/api/v1/me" }
}
```

- `403 approval_required`: today's limit is used, or no limit is set. It opens or reuses a `raise_cap` approval.
- `402 insufficient_balance`: the owner's wallet can't cover the pull. `url` is `/wallet?key=<id>`.
- Demo keys get `403` with "the shared demo limit is used up today" and the device-flow command.
- `qr` is `qrcode.toString(url, { type: "utf8" })`.

### 8.3 Chat request handling

Baseline §9 steps 1–12, with these changes:
- Step 5 (x402 settle) is gone.
- Step 6 has no market-ask fallback.
- Step 8: a short float calls `topUp(key, need)` (§9.4) and retries the reservation once. A refusal returns §8.2. A swarm key never tops up: it answers 402 `insufficient_balance`, "this swarm agent has spent its share of the budget".
- Step 9: `near-ai` adds `x-no-aliasing: true` and `Accept-Encoding: identity`.
- After the response, in `after()`: a float under `LOW_FLOAT_MICRO` refills in the background, and `near-ai` responses get their proof stored (§9.12).

## 9. Flows

### 9.1 Agent setup: device flow (`lib/approvals.ts`)

1. The agent sends `POST /api/v1/device {"name":"claude-code on zer0-laptop","cap_usd_micro":"5000000"}`.
2. The router inserts a `keys` row with no owner and an unusable hash, plus a `create_key` approval: a 32-byte device code stored as SHA-256, a 6-character user code, 10 minutes to live. It returns the link, the code and a text QR.
3. The agent prints the QR and polls `GET /api/v1/device/{device_code}` every 3 s.
4. The human opens `/a/<code>`, connects a NEAR wallet and sees the agent's name, the limit and their wallet balance. One prompt:
   - wallet already covers it: `core.set_cap(key_id, cap)`;
   - otherwise: `usdc.ft_transfer_call(core, amount, {"fund":{"cap":{"key":key_id,"per_day":cap}}})`;
   - no USDC on NEAR: a 1Click address for any chain (§9.11), then `set_cap`.
5. The page posts `confirm {account_id}`. The router reads `cap(account_id, key_id)`; if it has room, one statement sets the key's owner and hash, seals the new `rk_` into the approval and marks it `approved`.
6. The next poll returns the key once and deletes the sealed copy. Deny → `denied`; past 10 minutes → `expired`.

### 9.2 Wallet and keys (`/wallet`, with `/keys` redirecting)

- Balance from `core.wallet`.
- Deposit: `ft_transfer_call(core, amount, {"fund":{}})`, or from any chain (§9.11).
- Withdraw: to the connected account (with `storage_deposit` on USDC first if it isn't registered), or to any chain.
- Create a key: a NEP-413 `create_key` returns the `rk_` once, and `set_cap(key_id, per_day)` follows in the same flow.
- Each key shows its name, limit, today's use and float, with Raise (`set_cap`), Move to wallet (`return_float`) and Revoke (`set_cap(key, 0)`, then `DELETE`).
- Swarm agents show under the key that started them, with their balance and when they end, until their leftover is back.

### 9.3 Raising a limit

A 403 opens a `raise_cap` approval. `/a/<code>` shows today's use and a new limit, the owner signs `set_cap`, the page posts `confirm`, and the approval turns `approved`. The agent polls `/api/v1/me` until `left > 0`. The owner can also raise it on `/wallet` or with the printed `near` command.

### 9.4 Float top-up (`lib/pay.ts`)

```ts
export function topUp(key: KeyRow, needMicro: bigint): Promise<{ floatMicro: bigint } | { blocked: Response }>;
export function reconcile(): Promise<number>;
```

- Each instance runs at most one top-up per key at a time (a `Map<keyId, Promise>`).
- Read `cap(owner, cap_key)` and `wallet(owner)`. `amount = min(max(PULL_MICRO, need − float), left, wallet)`, with `DEMO_PULL_MICRO` for demo keys. When `amount < need − float`: 403 if the limit is the shortfall, 402 if the wallet is.
- Sign `core.pull(owner, cap_key, amount)` with the web key, send it, then add `amount` to the float in one statement. A contract refusal returns the matching 402 or 403.
- Revoke: one statement zeroes the float (nothing reserved, no open bid or offer, no running swarm and no swarm leftover on its way back), invalidates the hash and inserts a `refund` payout for the owner, which the keeper pays (§9.10). Prepaid MTokens on the key are forfeited, and the page warns first.
- Move to wallet: the same statement without touching the hash. It moves the free float only; reserved amounts settle first. The keeper pays the refund within a minute.
- Demo keys share `cap_key = "demo"` on `NEAR_OWNER_ID`'s wallet, with a $2/day limit.

### 9.5 Sellers (`/sell`)

- Wallet → provider (any rail, `near-ai` included; its proofs use the seller's key) → API key, or a connected Claude Code/Codex account (§9.15) → free check → model → price at or under list → capacity → one NEP-413 signature → `POST /api/listings`.
- Stored-key reuse, amend and cancel work as in baseline §10.2, now NEP-413 signed.
- Earnings show today, unpaid and paid, with NearBlocks links. Withdraw goes to `/wallet`; "Short the index" goes to `/perps?model=…&side=short`.

### 9.6 Spot

Baseline §10.10, unchanged: buys walk the asks, limit buys rest as bids, the matcher runs every 60 s and after every list or amend, resale offers sit on the book, and resale proceeds go to the seller key's float. Two changes: a short float refills by `pull`, and prepaid MTokens never expire.

### 9.7 Index (keeper)

1. Every 60 s, the last closed minute's fills (`trades` plus charged `usage`) become one rollup per model: `{minute, fills, mixed_tokens, charge, vwap, usage_root}`. They go to `core.log_rollups`, and the usage rows get `rollup_minute`. After a restart the keeper resumes from the newest minute in `core.rollups`.
2. Every 180 s, or right after a minute with fills:
   - TWAP of the last `INDEX_WINDOW_MIN` minutes (60 in production, 10 for the demo, at most 120) from `core.rollups`;
   - with no fills, the best ask; with no ask, post nothing;
   - clamp to `[list/10, list]`, step at most 10 % from the last post;
   - `core.post` when the price moved 0.1 % or 5 minutes have passed.
3. `/receipts` recomputes the same thing in the browser from the same views, read over public NEAR RPC (`recomputeIndex` in `lib/index-math.ts`, shared with the keeper through `lib/rollup.ts`).

### 9.8 Perps (`/perps`)

- Orders are `core.modify(model, size_delta, margin_delta)` with 1 yocto and 50 Tgas. Margin comes from the Meridian wallet, and the ticket shows the wallet balance, the fee and the resulting liquidation price.
- `orderPlan`, `positionAfter` and `liquidationPrice` in `lib/perp.ts` are unchanged. A flip is a close, then an open, in one `signAndSendTransactions`.
- Positions, the margin editor and the stale-index message work as in baseline §10.8. Trade history is not built yet.
- The keeper pages `liquidatable` every 30 s and calls `liquidate`.

### 9.9 Fees and the treasury

Perp fees and the 10 % take land in `treasury`. The owner takes revenue with `payout(owner, amount, id)` then `withdraw`. `status` reports treasury liabilities (floats, unpaid seller earnings, queued refunds), and the owner withdraws only the surplus.

### 9.10 Daily close and payouts (keeper)

1. Checked every minute after 00:00 UTC: `closeDay(yesterday)` writes one `earnings` payout per seller and links the rows it sums.
2. Each `pending` payout, earnings or refund: `core.payout(account, amount, payout.id)` with the keeper key, then `executed` with the tx hash. A retry is safe because a paid id is refused.
3. The seller withdraws from `/wallet`, to NEAR or any chain.

### 9.11 Any chain in and out (`lib/intents.ts`)

- **Tokens.** Every token 1Click lists outside NEAR, deprecated ones dropped, grouped by chain on the page with USDC first.
- **Fund.** `POST /v0/quote` with:
  - `dry`, `swapType:"EXACT_OUTPUT"`, `amount` in USDC, `slippageTolerance:100`, `deadline` one hour out;
  - `originAsset` = the chosen token, `depositType:"ORIGIN_CHAIN"`, `depositMode:"MEMO"` on Stellar and `"SIMPLE"` elsewhere;
  - `destinationAsset:"nep141:<NEAR_USDC_ID>"`, `recipient:NEAR_CORE_ID`, `recipientType:"DESTINATION_CHAIN"`;
  - `customRecipientMsg:{"fund":{"to":"<owner>"}}`;
  - `refundTo` = the user's address on the origin chain, `refundType:"ORIGIN_CHAIN"`.

  The page shows "You send X on Y. $Z USDC lands in your Meridian wallet", the deposit address, the memo when 1Click returns one (with "Include this memo or the deposit can't be credited"), and a QR. The QR and the phone link carry a payment request where a standard exists (EIP-681 on EVM chains, Solana Pay, BIP-21) and no memo is needed; otherwise the plain address. It polls `GET /v0/status` (with the memo) and shows every outcome. The credit happens on-chain in `ft_on_transfer`.
- **Pay with a wallet.** Browser wallets announce themselves through EIP-6963, so the page lists every installed EVM wallet by its own name and icon, with no wallet library. On an EVM chain the page asks the wallet for its address (the refund address), quotes, switches the chain, and sends the native amount or an ERC-20 `transfer(depositAddress, amountIn)`. Then `POST /v0/deposit/submit` with the hash, and the status polling takes over. Every step has words: confirm in the wallet, switch chains, cancelled ("Nothing was sent"), paid and waiting for the chain, converting, done, refunded.
- **Withdraw.** Quote from `nep141:<NEAR_USDC_ID>` to the chosen token at the user's address, `refundTo` = the user's NEAR account. One prompt: `usdc.storage_deposit(deposit_address)`, then `core.withdraw(amount, deposit_address)`.
- `customRecipientMsg` is marked experimental, so the first real run moves 0.2 USDC. Fallback: deliver to the owner's NEAR account, then one `ft_transfer_call`.
- Testnet: 1Click only knows mainnet, so on testnet the wallet hides this route and never asks 1Click for tokens. Deposits come from the faucet (§9.16) or a NEAR testnet account, and withdrawals go to a NEAR testnet account. The UI minimum is $1. `ONECLICK_API_KEY` is optional and lowers the fee.

### 9.12 NEAR AI proofs

- The house listing uses `NEARAI_API_KEY`, seeded and sealed like any seller key.
- After each `near-ai` response the router calls `GET /v1/signature/{chat_id}?signing_algo=ed25519` and stores `{text, signature, signing_address, signature_kind, response_sha256}` in `usage.proof`.
- `/receipts` verifies the ed25519 signature with `node:crypto`, checks the response hash appears in `text`, and matches `signing_address` against `GET /v1/attestation/report?signing_algo=ed25519&nonce=<fresh>`. It links `cloud.near.ai/verify` for the TDX and NVIDIA checks we don't run.

### 9.13 Wallet-signed mutations (`lib/auth.ts`)

```ts
export type Signed =
  | { account_id: string; public_key: string; signature: string; nonce: string; message: string }
  | { account_id: string; signature: string; message: string };
export function verifySigned(envelope: unknown, host: string, action: string): Promise<{ account: string; intent: Record<string, unknown> } | null>;
```

- The message is `JSON.stringify({ domain, action, issued_at, ...intent })`. The NEP-413 payload is `{ message, recipient: host, nonce }`, with a 32-byte random nonce.
- `verifyMessage` from `near-api-js/nep413` checks the signature and that the key is a full-access key of the account (over RPC).
- An Ethereum wallet owner is their `0x…` address and signs with `personal_sign` (EIP-191); a Solana wallet owner is their public key in hex (a valid NEAR account id, shown in base58) and signs with `solana:signMessage`. Both send `{ account_id, signature, message }`; `signedBy` recovers or verifies the signer with `@noble/curves` and accepts it only when it is `account_id`.
- Money actions by these owners are signed orders (`lib/orders.ts`): one readable message with the action, the account, the contract, a nonce and an expiry. `POST /api/v1/signed` checks the signature, the expiry (at most an hour out) and the nonce, then calls `set_cap_signed`, `withdraw_signed` or `modify_signed` with `NEAR_RELAY_KEY`. `core` rebuilds the same message and checks the signature itself (`ecrecover` for `0x…`, `ed25519_verify` for 64-hex), so the relay can deliver an order but never change or forge one. `withdraw_signed` registers the recipient on USDC first.
- The domain, action and 5-minute window rules are unchanged, and `client_nonce` uniques still block replays.
- Actions: `create_key`, `list_keys`, `revoke_key`, `return_float`, `list`, `amend`, `cancel`.

### 9.14 Swarms (`app/api/v1/swarm/route.ts`, `public/skills/meridian-swarm/`)

An agent runs one task on several models at once, each model as its own sub-agent, paid from its own key inside the owner's daily limit.

1. `/meridian-swarm 5 "fix the failing parser test"` in Claude Code, Codex or OpenCode runs `swarm.mjs`. Without a key it runs the device flow (§9.1) and keeps the key in `~/.config/meridian/key` (mode 600).
2. `POST /api/v1/swarm {agents | models, budget_usd_micro, minutes?}` with the agent's key:
   - `agents` (1 to 8) takes the cheapest distinct models with a live ask; `models` names them. Fewer live models than asked runs fewer, and the answer says so.
   - `share = budget / count`, at least $0.01. A float short of `share × count` tops up once (§9.4), so a swarm counts against the parent's daily limit like any spend, and a refusal returns §8.2.
   - One statement debits the parent's float and inserts one child key per model: `parent_id`, `expires_at` (`minutes`, default 60, 5 to 240), the share as its float, no `cap_key`, the model as `default_model`. The answer carries each child's `rk_` once, its model, rail and ask.
3. `swarm.mjs` makes one git worktree per model under `.swarm/<run>/` from the working tree's state (`git stash create`, or `HEAD`), excluded through `.git/info/exclude`, and writes `.swarm/<run>/.opencode/opencode.json` with a `meridian` provider (`@opencode/ai/providers/openai-compatible`, base URL `<host>/api/v1`, the key from `MERIDIAN_SWARM_KEY`). It starts `opencode run --standalone --auto --model meridian/<model> "<task>"` in each worktree, OpenCode being the only runtime that takes a custom OpenAI-compatible provider today.
4. While they run it polls `GET /api/v1/swarm` (each child's spend, requests and end time) and redraws one line per agent on a terminal, or prints a line per change when piped or with `NO_COLOR`.
5. When the last one exits, or on Ctrl-C, it writes each worktree's change to `.swarm/<run>/<n>.patch`, optionally runs `--check "<cmd>"` in each worktree, calls `DELETE /api/v1/swarm {key_ids}` and prints the summary, how to apply a patch, and one JSON line for the host agent.
6. `DELETE` sets `expires_at = now()` and moves every ended child's free float back to the parent in one statement. The keeper runs the same statement every minute for swarms nobody ended, and for amounts that settle after the end.

A child key answers 401 after `expires_at`, never tops up, and can only run inference: `/trades` and `/sells` answer 403, so no MTokens or orders are left on a key that ends.

### 9.15 Connected accounts (`lib/oauth.ts`)

Claude Code and Codex list from the seller's subscription instead of an API key. The venue opens its own grant, so refreshing it never rotates the token the seller's own `claude` or `codex` CLI holds.

1. `GET /api/v1/oauth/start?rail=` sets a sealed, `HttpOnly`, ten-minute cookie carrying the rail, state and PKCE verifier, then redirects to the provider's authorize page. No state row is written; a replay arrives without the cookie and is refused.
2. The seller authorizes and pastes what the provider shows: `code#state` for Claude, the full `localhost:1455` callback link for Codex.
3. `POST /api/listings` with `{kind:"oauth", code}` checks the state against the cookie, exchanges the code, probes the account with one tiny request, and seals `{access, refresh, expires_at, account, account_id, plan}` as JSON in `credential_ciphertext`. `credential_kind` is `oauth`; `credential_meta` carries the account and plan for the seller's table. A grant belongs to one listing; only API keys can be reused.
4. The router refreshes 60 s before `expires_at` and once on a 401, writing the rotated refresh token before the new access token is used. If a concurrent request won the rotation, the loser re-reads the row and uses the winner. A provider refusal marks the listing `invalid`; a 5xx, 429 or timeout from the token endpoint leaves it active and fails only that request.
5. `DELETE /api/listings/:id` keeps API keys sealed so prepaid MTokens keep serving, and erases an OAuth grant once the listing has no prepaid MTokens left. The seller sees the account and plan on each listing.

Claude requests go to `/v1/messages` with `anthropic-beta: oauth-2025-04-20` and the Claude Code system preamble, and its answers and SSE are translated to OpenAI shapes. Codex requests use the Responses backend and its SSE is translated, tools included.

### 9.16 Testnet faucet (`app/api/v1/faucet/route.ts`)

MetaMask and Phantom owners have no NEAR account to hold test USDC, so on testnet the wallet offers Get 10 test USDC. `POST /api/v1/faucet` takes the owner's signed `faucet` message (§9.13) and, while their Meridian wallet holds under 1 USDC, sends 10 USDC from `NEAR_FAUCET_ID` to `core` with `{"fund":{"to":"<owner>"}}`, then checks the wallet rose. It answers 404 on mainnet. The faucet account holds only `usdc.fakes.testnet`, which anyone can `mint`, and testnet NEAR. Its key is full-access because NEP-141 transfers attach 1 yoctoNEAR. MetaMask and Phantom owners withdraw to a NEAR account they type; the relay refuses ids that aren't NEAR accounts and named accounts that don't exist.

## 10. Keeper (`keeper/main.ts`, `jobs.ts`)

One Node process. Each loop catches its own errors and never overlaps itself.

| Every | Job |
|---|---|
| 60 s | `publishRollups` → `core.log_rollups` |
| 180 s, or woken | `postIndexes` → `core.post` |
| 30 s | `liquidateUnderwater`: `core.liquidatable`, then `core.liquidate` |
| 60 s | `releaseStale`, `returnSwarmFloats`, `matchAllBids` |
| 60 s | `dailyClose`: `closeDay`, then `payPending` |

`resetDailyListings`, `checkScheduled` and the perp log scan are removed. The keeper signs with `NEAR_KEEPER_KEY`.

## 11. Demo agent (`agents/demo/main.ts`)

The agent holds no NEAR key:
1. `POST /api/v1/device`, print the QR, poll for the key. `--demo` takes a demo key instead.
2. `new OpenAI({ baseURL: ROUTER_URL + "/api/v1", apiKey })`, then stream a loop of tasks, printing the `X-Meridian-*` headers.
3. Buy 1 MTok on `/trades` when the best ask is under the index; sell half on `/sells`.
4. On a 403, print `action` and poll `/me` until the limit has room again.
5. `RUNAWAY=1` plays a runaway agent: it sends requests in a loop, prints what each cost and what is left of today's limit, and stops at the 403 with the approval link. `STUB_TOKENS` makes the stub rail report that many tokens per request, so the limit runs out in a few dozen requests.
6. `STUB_SHELL="<command>"` makes the stub rail answer a request that offers OpenCode's `shell` tool with one call to it, so a local swarm produces real patches without a model key.

## 12. Frontend

| Page | Contents |
|---|---|
| `/` | a live line under the hero (best ask or index against list); example diagrams that play once in view, with Pause (a spare key sold as MTokens, an ask priced under list moving to the front of the book, an agent's daily limit and its raise, a perp hedge from `payoffLadder`, the index recompute from `recomputeIndex`); one request from limit to seller payout, pinned while its four steps scroll past on wide screens; "Use from your terminal" with the one-line `skill.md` prompt and a terminal that loops approve, buy, inference and sell; "Three ways in" with real captures of `/wallet`, `/sell` and `/perps`; under reduced motion every diagram shows its last frame and nothing advances |
| `/agents` | the terminal guide: `skill.md`, the device flow, demo keys, what an agent can and cannot do |
| `/a/[code]` | approve an agent or a higher limit: name, limit, wallet, one prompt to fund and approve, or deny |
| `/wallet` | the Meridian wallet (deposit, withdraw, any token on any chain, pay with an EVM wallet, a payment QR), agents and keys behind one `list_keys` signature reused for four minutes (limit, used, float, raise, move to wallet, revoke), swarm agents under their parent, create a key and set its limit, recent requests |
| `/trade` | baseline §14; a short float refills from the owner's wallet; size presets, keys B/S/M/L/`/`, prefill from `?model=&side=&size=&limit=` |
| `/perps` | baseline §14; margin from the Meridian wallet, a payoff table at ±5/10/20 %, history from `perp_events` with explorer links, keys B/S/[/]/`/`, prefill from `?model=&side=&size=&leverage=` |
| `/sell` | wallet → provider → key → model → price → capacity → one signature; earnings and payouts |
| `/receipts` | rollups, index posts, NEAR AI proofs and payouts in a server component; the index recompute reads `core` over public NEAR RPC in the browser |

- `providers.tsx` is a client-only context around `@hot-labs/near-connect`, with the network from `NEXT_PUBLIC_NEAR_NETWORK`. It exposes `accountId`, `connect`, `disconnect`, `signMessage` and `signAndSendTransactions`. Nonces come from `crypto.getRandomValues(new Uint8Array(32))`.
- `public/skill.md` covers:
  - setup through the device flow;
  - the two environment variables;
  - `/me` and the response headers;
  - buying and selling with `/book`, `/trades` and `/sells`;
  - on a 402 or 403: show the link and QR, then poll;
  - never asking a human for a private key;
  - swarms: installing the skill and the three `/swarm` calls.

UX rules:
- One wallet prompt per job.
- Every blocked request says what to do next, with a link, a QR and the `near` command.
- Every amount shows where it comes from (float first, then wallet) and where it goes.
- Empty states lead somewhere.
- Without a wallet, pages render read-only with a connect button where an action would be.

## 13. Environment

| Name | Used by | Value |
|---|---|---|
| `NEAR_NETWORK`, `NEXT_PUBLIC_NEAR_NETWORK` | all | `testnet` or `mainnet` |
| `NEAR_RPC_URL` | web, keeper, agent | Comma-separated, tried in order; a 429, 5xx, timeout or network failure moves to the next one. Default `https://free.rpc.fastnear.com` (mainnet); `https://test.rpc.fastnear.com`, then `https://near-testnet.drpc.org` (testnet) |
| `NEAR_CORE_ID`, `NEXT_PUBLIC_NEAR_CORE_ID` | all | `core.<team>.near` |
| `NEAR_OWNER_ID` | web, keeper, seed | `<team>.near` |
| `NEAR_OPS_ID` | web, keeper | `ops.<team>.near` |
| `NEAR_WEB_KEY` | web | `ed25519:…`, function-call key on `ops` for `pull` |
| `NEAR_KEEPER_KEY` | keeper | `ed25519:…`, function-call key on `ops` for `post`, `log_rollups`, `liquidate`, `payout` |
| `NEAR_USDC_ID`, `NEXT_PUBLIC_NEAR_USDC_ID` | all | mainnet `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, testnet `usdc.fakes.testnet` |
| `NEAR_RELAY_KEY` | web | `ed25519:…`, function-call key on `ops` for `set_cap_signed`, `withdraw_signed`, `modify_signed` |
| `NEAR_FAUCET_ID`, `NEAR_FAUCET_KEY` | web | testnet only: the faucet account and its full-access key (§9.16) |
| `ONECLICK_API_KEY` | web | optional |
| `NEARAI_API_KEY` | seed | Meridian's NEAR AI key for the house listing |
| `DEMO_KEYS` | web | `1` turns on demo keys |
| `DATABASE_URL`, `SECRETS_KEY`, `PUBLIC_HOST`, `TAKE_BPS`, `INDEX_WINDOW_MIN` | as baseline | |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `COMMANDCODE_BASE_URL`, `ZEN_BASE_URL`, `OPENCODE_GO_BASE_URL`, `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `STUB_RAIL_URL` | web | as baseline |
| `CLAUDE_CODE_BASE_URL`, `CODEX_BASE_URL` | web | optional overrides for the connected-account rails |

Removed: every `HEDERA_*`, `HCS_TOPIC_ID`, `X402_FACILITATOR_URLS`, `MIRROR_NODE_URL`, every `WORLD_*`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_GALILEO_RPC`, `NEXT_PUBLIC_PERP_MARKET`, `NEXT_PUBLIC_INDEX_ORACLE`, `NEXT_PUBLIC_MOCK_USDC`, `KEEPER_PRIVATE_KEY`, `PERP_DEPLOY_BLOCK`, `OG_ROUTER_URL`, `OG_MODELS_URL`.

## 14. Security

- Seller API keys and OAuth grants are sealed with AES-256-GCM. Router keys are stored as SHA-256 and shown once. Device codes are stored as SHA-256, and a new key is delivered once, then deleted.
- OAuth state and the PKCE verifier live only in a sealed, `HttpOnly` ten-minute cookie. The grant is never sent to the seller's browser: the authorize URL alone crosses the boundary, and the callback code is exchanged server-side.
- The public listing view masks the connected account (`s***@example.com`); the full address stays server-side.
- USDC leaves a user's wallet only through that user's 1-yocto `withdraw` or `modify`, or a `pull` inside the limit they set.
- `ft_on_transfer` accepts only `NEAR_USDC_ID`. `withdraw` debits first and restores on failure. Payout ids pay once.
- The `ops` keys are function-call keys:
  - a leaked web key can only pull inside owners' limits, into the treasury;
  - a leaked keeper key can move the index 10 % a minute and pay out the treasury;
  - neither can withdraw from a wallet.
- NEP-413: the recipient is pinned to the host, the key must be full-access, signatures expire after 5 minutes, nonces are unique per intent.
- EIP-191 and ed25519, for `0x…` and 64-hex accounts only: the signer must be the account, with the same host, action and 5-minute rules.
- Signed orders on `core`: a per-owner nonce blocks replays and the expiry bounds delayed delivery; a changed field breaks the signature.
- The picker finds Ethereum wallets through EIP-6963 and Solana wallets through the Wallet Standard events, with no libraries. NEAR wallets stay behind NEAR Connect.
- Pay with a Solana wallet: `lib/solana.ts` builds the transfer by hand (system transfer for SOL; idempotent associated-token-account create plus `transferChecked` for tokens). The public Solana RPC refuses browsers, so `/api/v1/solana` relays `getLatestBlockhash` and `getAccountInfo` only.
- No prompts or completions are stored. NEAR AI proofs hold hashes and signatures only.
- The faucet runs on testnet only; its key can move only test USDC and testnet NEAR.
- No secrets in the repo.

## 15. Milestones

| # | Milestone | Done when |
|---|---|---|
| N0 | Repo | `pre-hackathon` tag, deletions, fresh database, `pnpm typecheck` green |
| N1 | `core` | `cargo test` green; deployed on testnet; a script runs fund, `set_cap`, `pull`, `payout`, `modify`, `liquidate`, `withdraw` |
| N2 | Router | NEP-413 auth; the device flow mints a key after an on-chain `set_cap`; a request on an empty float pulls once and streams; `/me` |
| N3 | Keeper | rollups logged, index posted, one liquidation, one payout into a seller wallet |
| N4 | Pages | wallet connect; `/a/[code]`; `/wallet` fund, withdraw, raise, revoke; `/perps` trade; `/sell` list; `/trade` buy; `/receipts` recompute matches |
| N5 | Any chain | `dry` quotes on every page; one 0.2 USDC fund from Base into `core` on mainnet |
| N6 | NEAR AI | the house listing streams and its proof verifies on `/receipts` |
| N7 | Ship | mainnet deploy and seed; demo agent run; README, LICENSE, video; the human posts and submits |

## 16. Schedule (to Nov 14 23:59 UTC)

| Day | Contract and keeper | Router and agent | Frontend |
|---|---|---|---|
| Mon 9 | toolchain, `core` skeleton | this plan, deletions, fresh database, `near.ts`, NEP-413 auth | |
| Tue 10 | `core` complete with tests; testnet deploy | `pay.ts`, device flow, `/me`, `skill.md` | wallet provider, `/a/[code]`, `/keys` |
| Wed 11 | keeper on NEAR | NEAR AI rail and proofs, 1Click | `/perps`, `/sell`, `/trade` |
| Thu 12 | testnet rehearsal end to end | demo agent, seed, e2e scripts | `/receipts`, `/agents`, landing |
| Fri 13 | mainnet deploy, seed, vault (with the human's OK) | the 0.2 USDC 1Click run, mainnet smoke | polish, empty states |
| Sat 14 | README, LICENSE, video; the human posts on X and confirms the submission | | |

The demo path freezes Sat 14 at 12:00 UTC.

## 17. Known limits

**Custody**
- The router holds sellers' API keys (sealed), each key's float (at most one pull ahead) and sellers' unpaid share. The treasury mixes those with revenue; `status` reports the liabilities.
- `<team>.near` can upgrade `core` until submission.

**Trusted parties**
- The keeper is a trusted index poster; its inputs (the rollups) are public and recomputable.
- The house vault is the only perps counterparty.

**Contract**
- The contract pays storage for wallets, limits, positions and the bounded histories, so a spammer spends gas and Meridian pays storage.
- A plain `ft_transfer` to `core` is not credited. The UI only sends `ft_transfer_call`.
- Perp trade history is not built. `/perps` shows open positions and the index.

**Payments and gas**
- 1Click deposits into `core` depend on `customRecipientMsg`, which is experimental.
- Users need a little NEAR for gas; meta-transactions are not used.
- A crash between a successful `pull` and the float credit costs the owner at most one pull.
- Concurrent pulls across instances can overshoot a float by one pull each. The on-chain limit still bounds the day.
- Revoking a key forfeits its prepaid MTokens. Its float is refunded by the next keeper payout.
- A payout is marked `executed` after the call returns; the payout id travels in the on-chain `payout` event, and the database keeps no transaction hash.
- Demo keys share one $2/day limit.
- Paying from a wallet in the page covers EVM chains. Solana, Bitcoin and the rest pay to the address, by QR or the phone link.
- A swarm's budget leaves the parent's float when it starts and comes back when it ends, or within a minute of `expires_at`.

**Swarms**
- Sub-agents run as `opencode run --auto` in their worktrees: they edit files and run commands as the user, on the user's machine. Claude Code and Codex can start a swarm but cannot be its sub-agents, since their custom providers need the Anthropic Messages and OpenAI Responses formats.
- Patches are taken against the state the swarm started from; nothing is applied to the user's tree.

**NEAR AI**
- It is house-only.
- Proofs check the signature and the attested signer, not the TDX quote.
- Streams carry gateway signatures.

**Wallets**
- NEP-413 from wallets that add a `callbackUrl` fails verification. MyNearWallet is one, and it is shutting down.

**Carried from the baseline**
- The bytes/3 prompt estimate, with the platform absorbing overruns.
- Failover can move a request between rails with different verifiability.
- The short-context seed prices.
- The per-rail key-check caveats.
- One partial fill per walk.

## 18. Needs the human

1. Install the toolchains: Node ≥ 22.22.2 (`nvm install 22`); Rust 1.95 (`rust-toolchain.toml` makes rustup install it); `cargo-near` 0.23 and `near` CLI 0.31.
2. Accounts: `<team>.near` in a wallet, plus the `core.` and `ops.` sub-accounts; the two function-call keys on `ops`; `core` registered on USDC (0.00125 NEAR).
3. A fresh Neon database, and a new `.env` from `.env.example`.
4. Testnet rehearsal with Circle faucet USDC (faucet.circle.com, NEAR testnet, 20 USDC every 2 hours).
5. A NEAR AI key with credits for the house listing.
6. Optional: a 1Click API key.
7. Budget: about 5 NEAR plus $40 USDC on mainnet, each spend confirmed first.
8. The new GitHub repo. It goes public by Nov 14.
