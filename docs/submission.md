# Submission

## Tracks

- `defi` — a venue with a spot book, a resale book and cash-settled perps on a token-capacity index, settled in USDC on NEAR.
- `agents` — an agent buys its own inference from a terminal, with an on-chain daily limit and no NEAR key.
- `privacy` — only if the NEAR AI proof path ships; the TEE rail and the signed responses are the evidence.

## Links

- Repository: https://github.com/0xsoydev/meridian-near
- Demo post: the human publishes it and pastes the URL here.
- Contract: `core.meridian-near.testnet` on NEAR testnet, linked on NearBlocks.

## Demo post

The human writes and publishes this on X, with the video attached:

> Agents need to buy inference, and API credits expire. Meridian is a market for LLM capacity on NEAR: sellers list what they won't use, agents buy it with USDC, and an on-chain daily limit caps what each agent can spend.
>
> Built at NEAR HACKATHON. @NEARProtocol #NEARHackathon
>
> Repo: <link>

## Payload

| Field | Value |
|---|---|
| projectName | Meridian |
| tracks | `["defi","agents"]` (+ `"privacy"` if the proofs ship) |
| projectUrl | the repository |
| demoUrl | the X post |
| nearAddress | the team's mainnet NEAR account |
| idea | the problem, the product, and how NEAR fits: `core` wallets and limits, USDC, NEP-413, Intents, NEAR AI |

Print the payload, get the human's confirmation, send it once.

## Checklist

- [ ] Repository public, `LICENSE` present
- [ ] README covers what it is, how NEAR fits, and how to try it
- [ ] `pnpm typecheck`, `pnpm build`, `pnpm --filter web test`, `cargo test` green
- [ ] Testnet rehearsal from `docs/runbook.md`
- [ ] Video 2:30–3:00, human voice
- [ ] X post published
- [ ] Tag `hackathon-submission` at the submitted commit
- [ ] Hosted demo stays up until 2026-11-25
