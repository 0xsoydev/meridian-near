---
title: Deposits under 0.10 USDC bounce silently
author: 0xsoydev
date: 2026-11-10
branch: feat/nine-pass
cost: { minutes: 1, tokens: 0 }
id: l-68311d9d
scope: repo
status: active
src: agent
touches:
  - "contracts/core/src/lib.rs#ft_on_transfer"
  - apps/web/app/(site)/wallet/page.tsx
  - "apps/web/app/a/[code]/page.tsx"
---

core's ft_on_transfer refunds the full amount when it is below MIN_FUND (100_000 micro, 0.10 USDC) or the msg doesn't parse as FundMsg. The ft_transfer_call transaction still reports success (top-level SuccessValue is the refunded amount), so a wallet's success flag doesn't prove a deposit landed. The Wallet and approval pages reject deposits under 0.10 before signing, and the Wallet page re-reads the balance after a deposit and says so if it didn't rise. Found while testing with the meridian-e2e.testnet harness: a 1-micro probe was refunded although the message {"fund":{}} is correct.
