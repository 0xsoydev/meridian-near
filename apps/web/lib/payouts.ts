import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { call, keeperId, keeperKey } from "./near.ts";
import { accounts, payouts } from "./schema.ts";

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function closeDay(day: string): Promise<number> {
  const cutoff = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString();
  const result = await db().execute<{ created: string }>(sql`
    with u as (
      select usage.id, listings.seller_id as account_id, usage.seller_earning_usd_micro as amount
      from usage join listings on listings.id = usage.listing_id
      where usage.status = 'settled' and usage.payout_id is null
        and usage.seller_earning_usd_micro > 0 and usage.settled_at < ${cutoff}::timestamptz
    ), t as (
      select trades.id, listings.seller_id as account_id, trades.seller_earning_usd_micro as amount
      from trades join listings on listings.id = trades.listing_id
      where trades.payout_id is null and trades.seller_key_id is null
        and trades.seller_earning_usd_micro > 0 and trades.created_at < ${cutoff}::timestamptz
    ), totals as (
      select account_id, sum(amount)::bigint as amount
      from (select account_id, amount from u union all select account_id, amount from t) earned
      group by account_id
    ), p as (
      insert into payouts (account_id, day, amount_usd_micro, kind, status)
      select account_id, ${day}::date, amount, 'earnings', 'pending' from totals
      on conflict (account_id, day) where kind = 'earnings' do nothing
      returning id, account_id
    ), linked_usage as (
      update usage set payout_id = p.id
      from u join p on p.account_id = u.account_id
      where usage.id = u.id
      returning usage.id
    ), linked_trades as (
      update trades set payout_id = p.id
      from t join p on p.account_id = t.account_id
      where trades.id = t.id
      returning trades.id
    )
    select count(*)::text as created from p
  `);
  return Number(result.rows[0]?.created ?? "0");
}

export async function payPending(): Promise<string[]> {
  const lines: string[] = [];
  const rows = await db()
    .select({
      id: payouts.id,
      amount: payouts.amountUsdMicro,
      status: payouts.status,
      address: accounts.address,
    })
    .from(payouts)
    .innerJoin(accounts, eq(accounts.id, payouts.accountId))
    .where(eq(payouts.status, "pending"));

  for (const row of rows) {
    try {
      await call({
        accountId: keeperId(),
        privateKey: keeperKey(),
        method: "payout",
        args: { to: row.address, amount: row.amount.toString(), id: row.id },
      });
      await db()
        .update(payouts)
        .set({ status: "executed" })
        .where(and(eq(payouts.id, row.id), eq(payouts.status, "pending")));
      lines.push(`[payout] ${row.id}: ${row.amount} micro-USDC to ${row.address}`);
    } catch (error) {
      lines.push(`[payout] ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return lines;
}
