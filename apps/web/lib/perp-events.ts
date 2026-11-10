import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.ts";
import { perpEvents } from "./schema.ts";
import type { PerpEvent } from "./types";

const int = z.string().regex(/^-?\d+$/);

const outcomeSchema = z.object({
  transaction: z.object({ hash: z.string() }).optional(),
  transaction_outcome: z.object({ id: z.string() }).optional(),
  receipts_outcome: z.array(z.object({ outcome: z.object({ executor_id: z.string(), logs: z.array(z.string()) }) })),
});

const eventSchema = z.discriminatedUnion("event", [
  z.object({
    standard: z.literal("meridian"),
    event: z.literal("position_modified"),
    data: z.object({ account: z.string(), model: z.string(), size: int, margin: int, price: int, fee: int }),
  }),
  z.object({
    standard: z.literal("meridian"),
    event: z.literal("liquidated"),
    data: z.object({ account: z.string(), model: z.string(), reward: int }),
  }),
]);

export type PerpEventRow = {
  position: number;
  account: string;
  model: string;
  kind: "modified" | "liquidated";
  size: bigint;
  margin: bigint;
  price: bigint;
  fee: bigint;
  reward: bigint;
};

function readEvent(line: string): z.infer<typeof eventSchema> | null {
  if (!line.startsWith("EVENT_JSON:")) return null;
  try {
    const parsed = eventSchema.safeParse(JSON.parse(line.slice("EVENT_JSON:".length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function txHashOf(outcome: unknown): string | null {
  const parsed = outcomeSchema.safeParse(outcome);
  if (!parsed.success) return null;
  return parsed.data.transaction?.hash ?? parsed.data.transaction_outcome?.id ?? null;
}

export function perpEventsIn(outcome: unknown, core: string, liquidationPrice = 0n): PerpEventRow[] {
  const parsed = outcomeSchema.safeParse(outcome);
  if (!parsed.success) return [];
  const events = parsed.data.receipts_outcome
    .filter((receipt) => receipt.outcome.executor_id === core)
    .flatMap((receipt) => receipt.outcome.logs.map(readEvent))
    .filter((event) => event !== null);
  return events.map((event, position) =>
    event.event === "position_modified"
      ? {
          position,
          account: event.data.account,
          model: event.data.model,
          kind: "modified",
          size: BigInt(event.data.size),
          margin: BigInt(event.data.margin),
          price: BigInt(event.data.price),
          fee: BigInt(event.data.fee),
          reward: 0n,
        }
      : {
          position,
          account: event.data.account,
          model: event.data.model,
          kind: "liquidated",
          size: 0n,
          margin: 0n,
          price: liquidationPrice,
          fee: 0n,
          reward: BigInt(event.data.reward),
        },
  );
}

export async function recordPerpEvents(txHash: string, rows: ReadonlyArray<PerpEventRow>): Promise<void> {
  if (rows.length === 0) return;
  await db()
    .insert(perpEvents)
    .values(rows.map((row) => ({ txHash, ...row })))
    .onConflictDoNothing();
}

export async function perpHistory(account: string): Promise<PerpEvent[]> {
  const rows = await db()
    .select()
    .from(perpEvents)
    .where(eq(perpEvents.account, account))
    .orderBy(desc(perpEvents.createdAt), desc(perpEvents.position))
    .limit(100);
  return rows.map((row) => ({
    tx_hash: row.txHash,
    at: row.createdAt.toISOString(),
    model: row.model,
    kind: row.kind === "liquidated" ? "liquidated" : "modified",
    size: row.size.toString(),
    margin_usd_micro: row.margin.toString(),
    price_micro_per_mtok: row.price.toString(),
    fee_usd_micro: row.fee.toString(),
    reward_usd_micro: row.reward.toString(),
  }));
}
