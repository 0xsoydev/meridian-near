import { walletBalance } from "../../../../lib/pay.ts";

export async function GET(request: Request): Promise<Response> {
  const account = new URL(request.url).searchParams.get("account");
  if (!account) return Response.json({ error: { message: "account is required" } }, { status: 400 });
  const wallet = await walletBalance(account.toLowerCase());
  return Response.json({ wallet_usd_micro: wallet.toString() });
}
