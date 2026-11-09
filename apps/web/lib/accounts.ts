import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, notExists } from "drizzle-orm";
import { hashKey } from "./auth.ts";
import { db } from "./db.ts";
import { accounts, bids, keys, offers, prepaid } from "./schema.ts";
import type { KeySummary } from "./types";

export async function ensureAccount(address: string): Promise<{ id: string }> {
  const normalized = address.toLowerCase();
  const [existing] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.address, normalized))
    .limit(1);
  if (existing) return existing;
  const [created] = await db()
    .insert(accounts)
    .values({ address: normalized })
    .onConflictDoNothing()
    .returning({ id: accounts.id });
  if (created) return created;
  const [again] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.address, normalized))
    .limit(1);
  if (!again) throw new Error("account creation failed");
  return again;
}

export async function createKey(
  accountId: string,
  name: string | null,
  capKey?: string,
): Promise<{ id: string; raw: string }> {
  const raw = `rk_${randomBytes(32).toString("base64url")}`;
  const id = randomUUID();
  const [row] = await db()
    .insert(keys)
    .values({ id, accountId, name, capKey: capKey ?? id, hash: hashKey(raw), balanceUsdMicro: 0n })
    .returning({ id: keys.id });
  if (!row) throw new Error("key creation failed");
  return { id: row.id, raw };
}

export async function revokeKey(id: string): Promise<boolean> {
  const rows = await db()
    .update(keys)
    .set({ hash: randomBytes(32) })
    .where(
      and(
        eq(keys.id, id),
        eq(keys.balanceUsdMicro, 0n),
        notExists(db().select({ id: bids.id }).from(bids).where(and(eq(bids.keyId, id), eq(bids.status, "open")))),
        notExists(db().select({ id: offers.id }).from(offers).where(and(eq(offers.keyId, id), eq(offers.status, "open")))),
        notExists(
          db()
            .select({ id: prepaid.id })
            .from(prepaid)
            .where(and(eq(prepaid.keyId, id), gt(prepaid.tokensRemaining, 0n))),
        ),
      ),
    )
    .returning({ id: keys.id });
  return rows.length > 0;
}

export async function listKeys(accountId: string): Promise<KeySummary[]> {
  const rows = await db()
    .select({ id: keys.id, name: keys.name, float: keys.balanceUsdMicro, createdAt: keys.createdAt })
    .from(keys)
    .where(eq(keys.accountId, accountId))
    .orderBy(desc(keys.createdAt));
  return rows.map((row) => ({
    key_id: row.id,
    name: row.name ?? "key",
    float_usd_micro: row.float.toString(),
    created_at: row.createdAt.toISOString(),
  }));
}
