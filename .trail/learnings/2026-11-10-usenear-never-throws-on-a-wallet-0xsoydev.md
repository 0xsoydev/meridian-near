---
title: useNear never throws on a wallet rejection
author: 0xsoydev
date: 2026-11-10
branch: fix/wallet-rejections
cost: { minutes: 1, tokens: 0 }
id: l-d1936979
scope: repo
status: active
src: agent
touches:
  - "apps/web/app/(site)/providers.tsx#Providers"
---

`useNear` in `apps/web/app/(site)/providers.tsx` never throws: `connect` and `disconnect` swallow wallet errors and `sign` returns null, like `send` returns false. Callers on /keys and /sell set a busy state before awaiting a wallet prompt and only reset it on null or false, so a rejection that escaped left them stuck on 'Waiting for the wallet' and raised Next's error overlay. near-connect rejects with 'User rejected' when its wallet picker closes, Escape included, and with wallet-specific errors such as 'Action was cancelled' when a wallet window closes.
