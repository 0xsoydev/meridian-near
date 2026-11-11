import { nearProvider, usdcId, view } from "../../../../lib/near.ts";
import { walletBalance } from "../../../../lib/pay.ts";
import type { WalletView } from "../../../../lib/types";

export async function GET(request: Request): Promise<Response> {
  const account = new URL(request.url).searchParams.get("account");
  if (!account) return Response.json({ error: { message: "account is required" } }, { status: 400 });
  const owner = account.toLowerCase();
  const [wallet, held, near] = await Promise.all([
    walletBalance(owner),
    view<string>("ft_balance_of", { account_id: owner }, usdcId()).catch(() => "0"),
    nearProvider()
      .viewAccount({ accountId: owner })
      .then((found) => String(found.amount))
      .catch(() => "0"),
  ]);
  const digits = (value: string) => (/^\d+$/.test(value) ? value : "0");
  const result: WalletView = { wallet_usd_micro: wallet.toString(), near_usdc_micro: digits(held), near_yocto: digits(near) };
  return Response.json(result);
}
