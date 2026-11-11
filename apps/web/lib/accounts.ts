import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { hashKey } from "./auth.ts";
import { db } from "./db.ts";
import { accounts, keys, listings, usage } from "./schema.ts";
import type { KeySummary, OwnerUsage } from "./types";

export async function recentUsage(accountId: string): Promise<OwnerUsage[]> {
  const rows = await db()
    .select({
      keyId: keys.id,
      keyName: keys.name,
      at: usage.createdAt,
      model: listings.model,
      rail: usage.rail,
      status: usage.status,
      prompt: usage.promptTokens,
      completion: usage.completionTokens,
      mixed: usage.mixedTokens,
      charge: usage.chargeUsdMicro,
      prepaidId: usage.prepaidId,
      requestId: usage.upstreamRequestId,
      proof: usage.proof,
    })
    .from(usage)
    .innerJoin(keys, eq(keys.id, usage.keyId))
    .innerJoin(listings, eq(listings.id, usage.listingId))
    .where(eq(keys.accountId, accountId))
    .orderBy(desc(usage.createdAt))
    .limit(50);
  return rows.map((row) => ({
    key_id: row.keyId,
    key_name: row.keyName ?? "key",
    at: row.at.toISOString(),
    model: row.model,
    rail: row.rail,
    status: row.status,
    prompt_tokens: row.prompt,
    completion_tokens: row.completion,
    mixed_tokens: row.mixed.toString(),
    charge_usd_micro: row.charge.toString(),
    paid_from: row.prepaidId ? "prepaid" : "float",
    upstream_request_id: row.requestId,
    proof: row.proof !== null,
  }));
}

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
        and not exists (
          select 1 from keys c
          where c.parent_id = ${id}
            and (c.expires_at > now() or c.balance_usd_micro > 0 or c.reserved_usd_micro > 0)
        )
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

export async function returnFloat(id: string): Promise<bigint> {
  const result = await db().execute<{ moved: string }>(sql`
    with old as (
      select id, account_id, balance_usd_micro
      from keys
      where id = ${id} and balance_usd_micro > 0
      for update
    ), upd as (
      update keys set balance_usd_micro = 0
      where id = (select id from old)
      returning id
    ), refund as (
      insert into payouts (account_id, day, amount_usd_micro, kind, status)
      select account_id, (now() at time zone 'utc')::date, balance_usd_micro, 'refund', 'pending'
      from old
      where exists (select 1 from upd)
      returning amount_usd_micro
    )
    select coalesce((select amount_usd_micro from refund), 0)::text as moved
  `);
  return BigInt(result.rows[0]?.moved ?? "0");
}

export async function returnSwarmFloats(parentId: string | null): Promise<Array<{ id: string; amount: bigint }>> {
  const result = await db().execute<{ id: string; amount: string }>(sql`
    with ended as (
      select id, parent_id, balance_usd_micro as amount
      from keys
      where parent_id is not null
        and expires_at <= now()
        and balance_usd_micro > 0
        and (${parentId}::uuid is null or parent_id = ${parentId}::uuid)
      for update
    ), emptied as (
      update keys set balance_usd_micro = 0
      from ended
      where keys.id = ended.id
      returning keys.id
    ), totals as (
      select parent_id, sum(amount)::bigint as amount
      from ended
      group by parent_id
    ), credited as (
      update keys set balance_usd_micro = keys.balance_usd_micro + totals.amount
      from totals
      where keys.id = totals.parent_id
      returning keys.id
    )
    select id, amount::text as amount from ended
  `);
  return result.rows.map((row) => ({ id: row.id, amount: BigInt(row.amount) }));
}

export async function listKeys(accountId: string): Promise<KeySummary[]> {
  const rows = await db()
    .select({
      id: keys.id,
      name: keys.name,
      float: keys.balanceUsdMicro,
      capKey: keys.capKey,
      parentId: keys.parentId,
      expiresAt: keys.expiresAt,
      createdAt: keys.createdAt,
    })
    .from(keys)
    .where(
      and(
        eq(keys.accountId, accountId),
        or(isNull(keys.parentId), sql`${keys.expiresAt} > now()`, gt(keys.balanceUsdMicro, 0n), gt(keys.reservedUsdMicro, 0n)),
      ),
    )
    .orderBy(desc(keys.createdAt));
  return rows.map((row) => ({
    key_id: row.id,
    name: row.name ?? "key",
    float_usd_micro: row.float.toString(),
    cap_key: row.capKey,
    cap: null,
    parent_id: row.parentId,
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }));
}
