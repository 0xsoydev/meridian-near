---
title: kit button variants
author: 0xsoydev
date: 2026-11-09
branch: feat/web-design
cost: { minutes: 1, tokens: 0 }
id: l-30df721b
scope: repo
status: active
src: agent
---

In `apps/web/components/kit.tsx`, `SECONDARY`, `DANGER` and `ICON` share the `BOX` base, which has no padding or text color; each variant adds its own. Appending an override to a variant (`SECONDARY` plus `px-0` or `text-down`) stacks two Tailwind utilities for one property, and Tailwind v4 doesn't promise which wins, so add a variant to kit.tsx instead.
