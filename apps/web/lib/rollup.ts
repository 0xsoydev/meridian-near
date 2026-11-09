import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.ts";
import { view } from "./near.ts";
import type { Rollup } from "./types";

export type Fill = {
  id: string;
  keyId: string;
  model: string;
  price: bigint;
  charge: bigint;
  tokens: bigint;
  usage: boolean;
};

const fillRowSchema = z.object({
  id: z.string().uuid(),
  key_id: z.string().uuid(),
  model: z.string(),
  price: z.string().regex(/^\d+$/),
  charge: z.string().regex(/^\d+$/),
  tokens: z.string().regex(/^\d+$/),
  source: z.enum(["usage", "trade"]),
});

export async function minuteFills(minute: number): Promise<Fill[]> {
  const from = new Date(minute * 60_000).toISOString();
  const to = new Date((minute + 1) * 60_000).toISOString();
  const result = await db().execute(sql`
    select u.id, u.key_id, l.model, u.price_micro_per_mtok::text as price, u.charge_usd_micro::text as charge, u.mixed_tokens::text as tokens, 'usage' as source
    from usage u join listings l on l.id = u.listing_id
    where u.status = 'settled' and u.charge_usd_micro > 0 and u.mixed_tokens > 0
      and u.settled_at >= ${from}::timestamptz and u.settled_at < ${to}::timestamptz
    union all
    select t.id, t.key_id, t.model, t.price_micro_per_mtok::text, t.charge_usd_micro::text, t.tokens::text, 'trade'
    from trades t
    where t.created_at >= ${from}::timestamptz and t.created_at < ${to}::timestamptz
    order by id
  `);
  return result.rows.map((raw) => {
    const row = fillRowSchema.parse(raw);
    return {
      id: row.id,
      keyId: row.key_id,
      model: row.model,
      price: BigInt(row.price),
      charge: BigInt(row.charge),
      tokens: BigInt(row.tokens),
      usage: row.source === "usage",
    };
  });
}

function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function merkleRoot(fills: ReadonlyArray<Fill>): string {
  let level = fills.map((fill) => sha256(`${fill.id}|${fill.keyId}|${fill.charge}|${fill.tokens}`));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];
      if (left) next.push(right ? sha256(Buffer.concat([left, right])) : left);
    }
    level = next;
  }
  return (level[0] ?? sha256("")).toString("hex");
}

export function buildRollups(minute: number, fills: ReadonlyArray<Fill>): Rollup[] {
  const byModel = Map.groupBy(fills, (fill) => fill.model);
  return [...byModel].map(([model, group]) => {
    const charge = group.reduce((sum, fill) => sum + fill.charge, 0n);
    const tokens = group.reduce((sum, fill) => sum + fill.tokens, 0n);
    const notional = group.reduce((sum, fill) => sum + fill.price * fill.tokens, 0n);
    return {
      v: 1,
      model,
      minute,
      fills: group.length,
      mixed_tokens: tokens.toString(),
      charge_usd_micro: charge.toString(),
      vwap_micro_per_mtok: (notional / tokens).toString(),
      usage_root: merkleRoot(group),
    };
  });
}

export const MAX_MOVE_BPS = 1000n;
export const POST_MOVE_BPS = 10n;
export const HEARTBEAT_S = 300n;
export const INDEX_FLOOR_DIVISOR = 10n;

type RollupView = {
  minute: number;
  fills: number;
  mixed_tokens: string;
  charge: string;
  vwap: string;
  root: string;
};

export function minuteOf(ms: number): number {
  return Math.floor(ms / 60_000);
}

export function twap(rollups: ReadonlyArray<Rollup>): bigint | null {
  if (rollups.length === 0) return null;
  const total = rollups.reduce((sum, rollup) => sum + BigInt(rollup.vwap_micro_per_mtok), 0n);
  return total / BigInt(rollups.length);
}

export function clampIndex(price: bigint, referenceBlended: bigint): bigint {
  const floor = referenceBlended / INDEX_FLOOR_DIVISOR;
  return price < floor ? floor : price > referenceBlended ? referenceBlended : price;
}

export function stepToward(target: bigint, last: bigint): bigint {
  if (last === 0n) return target;
  const band = (last * MAX_MOVE_BPS) / 10_000n;
  return target > last + band ? last + band : target < last - band ? last - band : target;
}

export function shouldPost(next: bigint, last: bigint, updatedAt: bigint, nowS: bigint): boolean {
  if (last === 0n) return true;
  const move = next > last ? next - last : last - next;
  return move * 10_000n >= last * POST_MOVE_BPS || nowS - updatedAt >= HEARTBEAT_S;
}

export type IndexRecompute =
  | { state: "no-post"; twap: bigint | null; band: [bigint, bigint] | null }
  | { state: "no-input"; latest: bigint }
  | { state: "sync"; twap: bigint; band: [bigint, bigint]; next: bigint; latest: bigint }
  | { state: "pending"; twap: bigint; band: [bigint, bigint]; next: bigint; latest: bigint; diffBps: bigint };

export function recomputeIndex(input: {
  rollups: ReadonlyArray<Rollup>;
  reference: bigint;
  latest: bigint;
}): IndexRecompute {
  const band: [bigint, bigint] = [input.reference / INDEX_FLOOR_DIVISOR, input.reference];
  const average = twap(input.rollups);
  if (input.latest === 0n) return { state: "no-post", twap: average, band };
  if (average === null) return { state: "no-input", latest: input.latest };
  const next = stepToward(clampIndex(average, input.reference), input.latest);
  if (next === input.latest) return { state: "sync", twap: average, band, next, latest: input.latest };
  const diff = next > input.latest ? next - input.latest : input.latest - next;
  return { state: "pending", twap: average, band, next, latest: input.latest, diffBps: (diff * 10_000n) / input.latest };
}

export async function readRollups(model: string, sinceMinute: number): Promise<Rollup[]> {
  const rows = await view<RollupView[]>("rollups", { model, since_minute: sinceMinute });
  return rows.map((row) => ({
    v: 1,
    model,
    minute: row.minute,
    fills: row.fills,
    mixed_tokens: row.mixed_tokens,
    charge_usd_micro: row.charge,
    vwap_micro_per_mtok: row.vwap,
    usage_root: row.root,
  }));
}
