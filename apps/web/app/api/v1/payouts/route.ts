import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../../../lib/db.ts";
import { fail } from "../../../../lib/errors.ts";
import { nearNetwork } from "../../../../lib/near.ts";
import { accounts, payouts } from "../../../../lib/schema.ts";
import type { SellerPayouts } from "../../../../lib/types";

export async function GET(request: Request): Promise<Response> {
  const address = (new URL(request.url).searchParams.get("seller") ?? "").toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(address)) return fail(400, "invalid_request", "seller must be a NEAR account id");

  const network = nearNetwork();
  const [account] = await db().select({ id: accounts.id }).from(accounts).where(eq(accounts.address, address)).limit(1);
  if (!account) return Response.json({ network, unpaid_usd_micro: "0", data: [] } satisfies SellerPayouts);

  const [rows, unpaid] = await Promise.all([
    db()
      .select({
        day: payouts.day,
        amount: payouts.amountUsdMicro,
        txHash: payouts.txHash,
        status: payouts.status,
      })
      .from(payouts)
      .where(eq(payouts.accountId, account.id))
      .orderBy(desc(payouts.day))
      .limit(60),
    db().execute<{ unpaid: string }>(sql`
      select coalesce(sum(amount), 0)::text as unpaid from (
        select usage.seller_earning_usd_micro as amount
        from usage join listings on listings.id = usage.listing_id
        where listings.seller_id = ${account.id} and usage.status = 'settled' and usage.payout_id is null
        union all
        select trades.seller_earning_usd_micro
        from trades join listings on listings.id = trades.listing_id
        where listings.seller_id = ${account.id} and trades.payout_id is null and trades.seller_key_id is null
      ) earned
    `),
  ]);

  const result: SellerPayouts = {
    network,
    unpaid_usd_micro: unpaid.rows[0]?.unpaid ?? "0",
    data: rows.map((row) => ({
      day: row.day,
      amount_usd_micro: row.amount.toString(),
      tx_hash: row.txHash,
      status: row.status,
    })),
  };
  return Response.json(result);
}
