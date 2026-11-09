---
title: receipts recompute mirrors the keeper
author: 0xsoydev
date: 2026-11-09
branch: feat/web-design
cost: { minutes: 1, tokens: 0 }
id: l-08a98477
scope: repo
status: active
src: agent
touches:
  - keeper/jobs.ts
---

The browser recompute on /receipts runs the keeper's postIndexes math, stepToward(clampIndex(twap of rollups in INDEX_WINDOW_MIN, list price), last post), reading rollups and market straight from core over public FastNEAR RPC, which allows CORS from any origin. With no rollups in the window the keeper posts the best ask, which lives off chain, so the page says that instead of claiming a match. Keep index-math.ts free of db and RPC imports; the browser bundle imports it.
