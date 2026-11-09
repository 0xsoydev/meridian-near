import { and, count, eq } from "drizzle-orm";
import { routerKey } from "../../../../lib/auth.ts";
import { db } from "../../../../lib/db.ts";
import { fail } from "../../../../lib/errors.ts";
import { prepaidTotal } from "../../../../lib/ledger.ts";
import { capOf, ownerAddress, walletBalance } from "../../../../lib/pay.ts";
import { formatMtok, formatUsd } from "../../../../lib/price.ts";
import { bids, offers } from "../../../../lib/schema.ts";
import type { Me } from "../../../../lib/types";

export async function GET(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  const owner = await ownerAddress(key.accountId);
  if (!owner || !key.capKey) return fail(403, "approval_required", "this key is not approved yet");

  const [wallet, cap, prepaid, bidRows, offerRows] = await Promise.all([
    walletBalance(owner),
    capOf(owner, key.capKey),
    prepaidTotal(key.id),
    db().select({ n: count() }).from(bids).where(and(eq(bids.keyId, key.id), eq(bids.status, "open"))),
    db().select({ n: count() }).from(offers).where(and(eq(offers.keyId, key.id), eq(offers.status, "open"))),
  ]);

  const me: Me = {
    owner,
    wallet_usd_micro: wallet.toString(),
    float_usd_micro: key.balanceUsdMicro.toString(),
    reserved_usd_micro: key.reservedUsdMicro.toString(),
    cap: {
      per_day_usd_micro: cap.per_day,
      used_today_usd_micro: cap.used_today,
      left_usd_micro: cap.left,
    },
    default_model: key.defaultModel,
    prepaid_tokens: prepaid.toString(),
    open_bids: Number(bidRows[0]?.n ?? 0),
    open_offers: Number(offerRows[0]?.n ?? 0),
  };

  if (new URL(request.url).searchParams.get("format") === "text") {
    const line = `${owner} holds ${formatUsd(wallet)} · ${formatUsd(BigInt(cap.left))} of today's ${formatUsd(BigInt(cap.per_day))} left · float ${formatUsd(key.balanceUsdMicro)} · ${formatMtok(prepaid)} MTok prepaid\n`;
    return new Response(line);
  }
  return Response.json(me);
}
