# Meridian

A market for LLM capacity, on NEAR.

Sellers list unused provider capacity as MTokens, priced at or below their provider's list price. Agents buy inference from those sellers through an OpenAI-compatible router, and owners cap what each agent can spend per day with a limit the `core` contract enforces.

Built for the NEAR Hackathon, tracks `defi` and `agents`.

## How NEAR fits

- **`core.<team>.near`** is a Rust contract that holds a USDC wallet per account, the per-agent daily limits, the perps markets, the price index and the public log of minute rollups. It is the only place money lives.
- **`ops.<team>.near`** calls `pull`, `post`, `log_rollups`, `liquidate` and `payout` through function-call keys. It can never withdraw from a wallet.
- **NEAR accounts and NEP-413** sign every listing, amendment, cancellation and key creation.
- **Any wallet.** MetaMask, Phantom, OKX and every other Ethereum or Solana browser wallet connect directly. The owner is their address. Setting a limit, withdrawing and trading perps are readable messages they sign; `core` checks each signature on chain (`ecrecover` or `ed25519_verify`), and Meridian relays them and pays the gas, so these owners never hold NEAR.
- **NEAR Intents 1Click** is the way in from another chain and the way out to one, on mainnet. The hosted demo runs on NEAR testnet, where a faucet hands out test USDC instead.
- **NEAR AI Cloud** is the verifiable rail. Its TEE models are the demo market, and `/receipts` reads straight from `core`.

## Security model

Money moves only where its owner signed for it. Each key can do exactly this much:

| Key | Held by | Can | Cannot |
|---|---|---|---|
| The owner's NEAR key, or their Ethereum or Solana wallet | the owner | deposit, `withdraw`, set and raise limits (`set_cap`), trade perps (`modify`); a wallet owner does the last three by signing a message | |
| A router key `rk_` | an agent | run inference, buy and resell MTokens with its float, which refills by `pull` only inside the daily limit its owner set on chain | touch the wallet, raise its own limit, withdraw |
| A swarm key | one sub-agent | run inference with its share of a swarm's budget until the swarm ends | top up, trade, start a swarm, outlive `expires_at` |
| The web function-call key (`NEAR_WEB_KEY`) | the router | `pull` inside each owner's daily limit, into the treasury | `withdraw`, `set_cap`, `modify`, `payout` |
| The keeper function-call key (`NEAR_KEEPER_KEY`) | the keeper | `post` the index (10 % a minute at most), `log_rollups`, `liquidate`, `payout` from the treasury | `withdraw` from a wallet, `set_cap`, `pull` |
| The relay function-call key (`NEAR_RELAY_KEY`) | the router | deliver a wallet owner's signed `set_cap_signed`, `withdraw_signed` or `modify_signed` | change, replay or forge one: `core` rebuilds the message and checks the owner's signature, nonce and expiry |

`withdraw`, `set_cap` and `modify` require one yoctoNEAR attached (`contracts/core/src/lib.rs`), and a function-call key can't attach a deposit, so only the owner's own wallet can call them. `pull` refuses anything past today's limit.

Signed messages (listing your agents, creating, revoking or emptying a key, listings) carry the site, the action and the time. The router accepts a NEP-413 signature from a full-access key of the account, an Ethereum signature (EIP-191) whose recovered address is the account, or a Solana (ed25519) signature from the account's key (`lib/auth.ts`). Each expires after five minutes. Signed orders for `core` name the contract, a per-owner nonce and an expiry, and `core` verifies them itself.

If both server keys leaked, an attacker could pull what is left of every owner's limit for today into the treasury and pay the treasury out to any account. Owners would lose at most today's unused limits; the treasury, which holds agents' floats, unpaid seller earnings and fees, is what is exposed. No wallet can be emptied and no limit raised without its owner's signature.

## What works

- The `core` contract: wallets, caps, `pull`, `payout`, perps ported from the earlier Solidity build, the index and rollups, and signed orders from Ethereum and Solana wallets. 21 unit tests.
- The router: OpenAI-compatible streaming, prepaid MTokens, spot and limit orders, resale, a matcher, and a float that refills from the owner's wallet inside the on-chain limit.
- The keeper: rollups, index posts, liquidations and daily payouts over NEAR.
- The app: wallet, agent approval, trade, perps, sell and receipts pages on `@hot-labs/near-connect`.
- On mainnet, deposits and withdrawals in any token on any chain 1Click supports, paid in one click from MetaMask or any EVM wallet, or from Phantom or any Solana wallet, and NEAR AI response proofs verified on `/receipts`.
- Sign-in with MetaMask, Phantom, OKX or any Ethereum or Solana browser wallet, or a NEAR wallet, from one picker. Wallet owners never need NEAR or gas.
- Swarms: one task on several models at once, each model its own OpenCode sub-agent in its own git worktree with its own key and share of the budget (`apps/web/public/skills/meridian-swarm/`).
- Moving a key's unspent balance back to the owner's wallet without revoking it.
- Selling from a Claude Code or Codex subscription: PKCE connect, sealed grant, server-side refresh, and a delist that erases it once prepaid clears.

Not built yet: perp trade history (see `docs/plan.md`).

## Try it

Each step runs on testnet with the stack from "Run it".

1. **Give an agent a key.** Run `pnpm --filter demo-agent start`. It prints a link and a QR code. Open it, connect a NEAR testnet wallet and approve a daily limit. The agent gets its key and streams an answer, paid from your wallet inside the limit.
2. **Watch a runaway agent stop.** Start the stub rail with `STUB_TOKENS=150000`, give a key a $0.50 limit, and run `RUNAWAY=1 RK_KEY=<key> MODEL=glm-5.3 pnpm --filter demo-agent start`. It logs each request's cost, then stops at about request 20 with the approval link and a QR code. Your wallet paid exactly the $0.50 limit.
3. **Run a swarm.** Install the skill from `/skills/meridian-swarm/` (see `/skill.md`), then in any git repository run `node swarm.ts 3 "fix the failing test" --budget 0.30`. The three cheapest models each work in their own worktree. You see a live table, then one patch per model and a JSON line for your agent. Ctrl-C returns the unspent budget.
4. **Get test USDC.** On `/wallet`, choose Deposit, then Get 10 test USDC. One signature and $10.00 of test USDC lands in your Meridian wallet; the faucet tops up wallets holding under $1.00. Withdraw sends it to any NEAR testnet account.

   On mainnet the same panel prices deposits from other chains: choose From another chain and SOL on Solana. The panel shows a live price: "You send 0.12 SOL on Solana. $10.00 USDC lands in your Meridian wallet." It also pays from MetaMask, Phantom or any browser wallet.
5. **Move a key's balance to your wallet.** On `/wallet`, choose Show my agents, then Move to wallet. The wallet balance rises within a minute.
6. **Recompute the index.** `/receipts` recomputes the index in your browser from the rollups on `core`.
7. **Use MetaMask or Phantom.** Choose Connect wallet and pick your wallet. Approve an agent: your wallet shows a readable message ("Set a daily limit of 5 USDC for key …"), one signature sets the limit on `core`, and Meridian pays the network fee.

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

USDC on NEAR mainnet is `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`; on testnet Meridian uses `usdc.fakes.testnet`, which anyone can `mint`.

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
apps/web/public/skills/meridian-swarm/   the swarm skill agents install
keeper/             rollups, index, liquidations, payouts
agents/demo/        an agent that buys inference from the terminal
docs/plan.md        the spec
```

## Provenance

The Hedera, 0G and World ID version of this project was built at ETHGlobal Mumbai 2026. It is imported without history at the tag `pre-hackathon`; the NEAR work starts from that commit. Built with AI coding assistants, reviewed by the team.
