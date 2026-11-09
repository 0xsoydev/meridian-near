# Meridian

> A market for spare LLM capacity on NEAR. Sellers list provider keys they don't fully use as MTokens (one MToken = 1,000,000 mixed tokens, three input to one output). Agents spend MTokens through an OpenAI-compatible router that takes the cheapest ask, pay in USDC from a NEAR wallet inside a daily limit the owner sets on chain, sell back what they don't use, and hedge the price with perps on the venue's index.

All endpoints are under `/api/v1`. Authenticate with `Authorization: Bearer rk_…`, a router key. Amounts are integer strings: USD in micro-dollars (1 USD = 1000000), prices in micro-USD per MTok, sizes in tokens. Errors use the OpenAI shape `{ "error": { "message", "type", "code" } }`. An agent never holds a NEAR key: its owner funds the wallet and sets its daily limit with `set_cap` on `core.<team>.near`.

## Get a key

- [Start the device flow](/api/v1/device): `POST { name, cap_usd_micro? }` answers `{ device_code, user_code, verification_uri_complete, qr, expires_at, interval }`. Show the link or the QR to your human. They open it with a NEAR wallet, optionally fund the wallet, and set your daily limit on chain.
- [Poll for the key](/api/v1/device/DEVICE_CODE): `GET` every `interval` seconds until `status` is `approved`, `denied` or `expired`. The approved answer carries `{ key, key_id }` once. Store the key; it is not shown again.
- [Default model](/api/v1/keys/settings): `PATCH { default_model }` sets the model used when a request omits `model`.

## Inference

- [Chat completions](/api/v1/chat/completions): OpenAI-compatible, `stream: true` supported. Set `OPENAI_BASE_URL` to `$MERIDIAN/api/v1` and `OPENAI_API_KEY` to the router key. `model` is an id from the model list, or `cheapest:a,b,c` to route to the cheapest live ask among a shortlist (the `X-Router-Model` header names the pick). A request spends MTokens the key holds first, then the key's float, then pulls from the wallet within the daily limit.
- [Models](/api/v1/models): every model with its rails, list price (`reference_blended_micro_per_mtok`), list ceiling, best ask and available tokens. Rails with `verifiability: "tee"` are served through NEAR AI and come back with signed proofs.
- [Usage](/api/v1/usage): the key's last 100 calls with tokens, rail, charge, whether prepaid MTokens or the float paid, and whether a proof was recorded.
- [Account](/api/v1/me): wallet, float, reserved amount, today's limit (`cap.per_day_usd_micro`, `cap.used_today_usd_micro`, `cap.left_usd_micro`), prepaid tokens and open orders.

## When a human is needed

- A request today's limit can't cover answers 403 `approval_required`; one the wallet can't cover answers 402 `insufficient_balance`. Both carry `action: { url, code, qr, near_cli, poll }`. Show the human `url` or the `qr`, or give them `near_cli` to run in a terminal. Then poll `action.poll` (`/api/v1/me`) until `cap.left_usd_micro` and `wallet_usd_micro` cover the request, and retry.
- Never ask a human for a NEAR private key, seed phrase or wallet password. The router key is the only secret an agent holds.

## Trade MTokens

- [Book](/api/v1/book?model=glm-5.3): asks (provider listings and resale offers, `kind`), bids by price level and the last 50 fills.
- [Buy](/api/v1/trades): `POST { model, tokens, limit_price_micro_per_mtok? }` walks the asks cheapest first and answers `{ fills, bid, prepaid_tokens }`. A limit stops at the first ask above it and rests the rest as a bid that holds its exact cost. A limit above the model's list ceiling is refused.
- [Sell](/api/v1/sells): `POST { model, tokens, limit_price_micro_per_mtok? }` sells MTokens the key holds into bids and answers `{ fills, offers, holding_tokens }`. With a limit the rest rests as a resale offer. Proceeds, less the 10% venue fee, go to the key's float.
- [Holdings](/api/v1/holdings), [open bids](/api/v1/bids), [open offers](/api/v1/offers): the key's MTokens and orders, filterable with `?model=`. [Fills](/api/v1/fills) lists its trades. `DELETE /api/v1/bids/:id` and `DELETE /api/v1/offers/:id` cancel and return the hold or the MTokens.

## Perps

- Perps are cash-settled in USDC on `core.<team>.near` against the venue index, up to 5x. A NEAR wallet trades them by calling `modify { model, size_delta, margin_delta }` on core; the index is posted by the keeper from on-chain fill rollups, clamped between a tenth of list price and list price. Trading pauses when the index is more than 10 minutes old.
- [Market](/api/v1/perps/market?model=glm-5.3): index, funding rate per hour (scaled 1e18), open interest, max leverage and recent index posts.
- [Account](/api/v1/perps/account?account=ACCOUNT.near): an account's wallet and open positions with equity and liquidation price.
- [Venue status](/api/v1/status): each market's index and age, the keeper's latest post, payouts and 24 h volume.

## Optional

- [Receipts](/receipts): per-minute fill rollups read from core, an index recompute that runs in the browser over public NEAR RPC, NEAR AI proofs and payout transactions.
- [Agents](/agents): the device flow and the two environment variables, step by step.
