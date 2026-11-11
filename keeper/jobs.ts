import { returnSwarmFloats } from "../apps/web/lib/accounts.ts";
import { matchAllBids } from "../apps/web/lib/bids.ts";
import { asks } from "../apps/web/lib/book.ts";
import { releaseStale } from "../apps/web/lib/ledger.ts";
import { call, coreId, keeperId, keeperKey, view } from "../apps/web/lib/near.ts";
import { closeDay, payPending, utcDay } from "../apps/web/lib/payouts.ts";
import { perpEventsIn, recordPerpEvents, txHashOf } from "../apps/web/lib/perp-events.ts";
import { MARKETS, readMarket } from "../apps/web/lib/perp.ts";
import { blended, referenceFor } from "../apps/web/lib/price.ts";
import { catalog } from "../apps/web/lib/rails.ts";
import {
  buildRollups,
  clampIndex,
  minuteFills,
  minuteOf,
  readRollups,
  shouldPost,
  stepToward,
  twap,
} from "../apps/web/lib/rollup.ts";

const SETTLE_GRACE_MS = 5_000;

function windowMinutes(): number {
  const value = Number(process.env.INDEX_WINDOW_MIN ?? "60");
  if (!Number.isInteger(value) || value <= 0) throw new Error("INDEX_WINDOW_MIN must be a positive integer");
  return value;
}

async function keeperCall(method: string, args: Record<string, unknown>): Promise<void> {
  await call({ accountId: keeperId(), privateKey: keeperKey(), method, args });
}

let lastMinute: number | null = null;

export async function publishRollups(): Promise<boolean> {
  const closed = minuteOf(Date.now() - SETTLE_GRACE_MS) - 1;
  if (lastMinute === null) {
    const recent = await Promise.all(MARKETS.map((model) => readRollups(model, closed - 120).catch(() => [])));
    lastMinute = recent.flat().reduce((max, rollup) => Math.max(max, rollup.minute), closed - 121);
  }
  let filled = false;
  for (let minute = lastMinute + 1; minute <= closed; minute++) {
    const fills = await minuteFills(minute);
    const rollups = buildRollups(minute, fills);
    if (rollups.length > 0) {
      await keeperCall("log_rollups", {
        rollups: rollups.map((rollup) => ({
          model: rollup.model,
          minute: rollup.minute,
          fills: rollup.fills,
          mixed_tokens: rollup.mixed_tokens,
          charge: rollup.charge_usd_micro,
          vwap: rollup.vwap_micro_per_mtok,
          usage_root: rollup.usage_root,
        })),
      });
      console.log(`[rollup] minute ${minute}: ${rollups.length} models, ${fills.length} fills`);
    }
    filled ||= fills.length > 0;
    lastMinute = minute;
  }
  return filled;
}

export async function postIndexes(): Promise<void> {
  const rails = await catalog();
  const now = Math.floor(Date.now() / 1000);
  for (const model of MARKETS) {
    try {
      const reference = referenceFor(model, rails);
      if (!reference) {
        console.log(`[index] ${model}: no reference price, skipped`);
        continue;
      }
      const market = await readMarket(model);
      if (!market.listed) continue;
      const rollups = await readRollups(model, minuteOf(Date.now()) - windowMinutes());
      const source = twap(rollups) ?? (await asks(model))[0]?.price ?? null;
      if (source === null) {
        console.log(`[index] ${model}: no bid, nothing to post`);
        continue;
      }
      const target = clampIndex(source, blended(reference.pricing));
      const next = stepToward(target, market.price);
      if (!shouldPost(next, market.price, market.updatedAt, BigInt(now))) continue;
      await keeperCall("post", { model, price: next.toString() });
      console.log(`[index] ${model}: ${market.price} -> ${next} (target ${target})`);
    } catch (error) {
      console.error(`[index] ${model}:`, error instanceof Error ? error.message : error);
    }
  }
}

export async function liquidateUnderwater(): Promise<void> {
  let from = 0;
  for (;;) {
    const rows = await view<[string, string][]>("liquidatable", { from, limit: 100 });
    for (const [account, model] of rows) {
      try {
        const price = (await readMarket(model)).price;
        const outcome = await call({ accountId: keeperId(), privateKey: keeperKey(), method: "liquidate", args: { account, model } });
        const hash = txHashOf(outcome);
        if (hash) await recordPerpEvents(hash, perpEventsIn(outcome, coreId(), price)).catch(() => undefined);
        console.log(`[liquidate] ${account} on ${model}`);
      } catch (error) {
        console.log(`[liquidate] ${account} on ${model}: ${error instanceof Error ? error.message : "skipped"}`);
      }
    }
    if (rows.length < 100) return;
    from += rows.length;
  }
}

export async function sweepStale(): Promise<void> {
  const released = await releaseStale();
  if (released > 0) console.log(`[sweep] released ${released} stale usage rows`);
  const returned = (await returnSwarmFloats(null)).reduce((sum, row) => sum + row.amount, 0n);
  if (returned > 0n) console.log(`[swarm] returned ${returned} micro-USDC from ended swarms`);
}

export async function matchRestingBids(): Promise<void> {
  const filled = await matchAllBids();
  if (filled > 0) console.log(`[match] ${filled} resting bid fills`);
}

const printed = new Set<string>();

export async function dailyClose(): Promise<void> {
  const now = Date.now();
  const yesterday = utcDay(now - 86_400_000);
  const created = await closeDay(yesterday);
  if (created > 0) console.log(`[payout] closed ${yesterday}: ${created} payouts pending`);
  for (const line of await payPending()) {
    if (printed.has(line)) continue;
    printed.add(line);
    console.log(line);
  }
}

export async function settleStreams(): Promise<void> {
  await sweepStale();
}
