import { randomBytes, randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { hashKey } from "./auth.ts";
import { db } from "./db.ts";
import { accounts, keys } from "./schema.ts";
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
  const result = await db().execute<{ revoked: number }>(sql`
    with old as (
      select id, account_id, balance_usd_micro
      from keys
      where id = ${id}
        and not exists (select 1 from bids where key_id = ${id} and status = 'open')
        and not exists (select 1 from offers where key_id = ${id} and status = 'open')
        and not exists (select 1 from prepaid where key_id = ${id} and tokens_remaining > 0)
      for update
    ), upd as (
      update keys set hash = ${randomBytes(32)}, balance_usd_micro = 0
      where id = (select id from old)
      returning id
    ), refund as (
      insert into payouts (account_id, day, amount_usd_micro, kind, status)
      select account_id, (now() at time zone 'utc')::date, balance_usd_micro, 'refund', 'pending'
      from old
      where balance_usd_micro > 0 and exists (select 1 from upd)
      returning id
    )
    select (select count(*) from upd)::int as revoked
  `);
  return (result.rows[0]?.revoked ?? 0) === 1;
}

export async function listKeys(accountId: string): Promise<KeySummary[]> {
  const rows = await db()
    .select({ id: keys.id, name: keys.name, float: keys.balanceUsdMicro, capKey: keys.capKey, createdAt: keys.createdAt })
    .from(keys)
    .where(eq(keys.accountId, accountId))
    .orderBy(desc(keys.createdAt));
  return rows.map((row) => ({
    key_id: row.id,
    name: row.name ?? "key",
    float_usd_micro: row.float.toString(),
    cap_key: row.capKey,
    cap: null,
    created_at: row.createdAt.toISOString(),
  }));
}
