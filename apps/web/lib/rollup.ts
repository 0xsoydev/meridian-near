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

export {
  HEARTBEAT_S,
  INDEX_FLOOR_DIVISOR,
  MAX_MOVE_BPS,
  POST_MOVE_BPS,
  clampIndex,
  minuteOf,
  recomputeIndex,
  shouldPost,
  stepToward,
  twap,
  type IndexRecompute,
} from "./index-math.ts";

type RollupView = {
  minute: number;
  fills: number;
  mixed_tokens: string;
  charge: string;
  vwap: string;
  root: string;
};

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
