---
title: keys page signs list_keys once
author: 0xsoydev
date: 2026-11-09
branch: feat/web-design
cost: { minutes: 1, tokens: 0 }
id: l-37245d62
scope: repo
status: active
src: agent
touches:
  - apps/web/app/(site)/keys/page.tsx
  - "apps/web/lib/auth.ts#verifySigned"
---

The Wallet page reuses one list_keys NEP-413 envelope for four minutes because verifySigned only checks issued_at within five minutes and keeps no nonce store, so a read-only list envelope can be replayed inside its window. Create, revoke and set_cap still sign fresh. The list loads on an explicit 'Show my agents' click, not on mount: wallet signMessage opens a popup, and browsers block popups without a user gesture.
