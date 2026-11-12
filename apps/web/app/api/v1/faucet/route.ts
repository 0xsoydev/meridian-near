import { expectedHost, verifySigned } from "../../../../lib/auth.ts";
import { usd } from "../../../../lib/client.ts";
import { fail } from "../../../../lib/errors.ts";
import { call, coreId, faucetId, faucetKey, nearNetwork, usdcId } from "../../../../lib/near.ts";
import { walletBalance } from "../../../../lib/pay.ts";
import { txHashOf } from "../../../../lib/perp-events.ts";
import type { FaucetResult } from "../../../../lib/types";

const GRANT = 10_000_000n;
const FLOOR = 1_000_000n;

export async function POST(request: Request): Promise<Response> {
  if (nearNetwork() !== "testnet") return fail(404, "invalid_request", "the faucet runs on testnet only");
  const signed = await verifySigned(await request.json().catch(() => null), expectedHost(request), "faucet");
  if (!signed) return fail(401, "invalid_api_key", "sign the request with your wallet to get test USDC");
  const held = await walletBalance(signed.account);
  if (held >= FLOOR) {
    return fail(409, "invalid_request", `Your wallet already holds ${usd(held)}. The faucet tops up wallets under ${usd(FLOOR)}.`);
  }
  try {
    const outcome = await call({
      accountId: faucetId(),
      privateKey: faucetKey(),
      contractId: usdcId(),
      method: "ft_transfer_call",
      args: { receiver_id: coreId(), amount: GRANT.toString(), msg: JSON.stringify({ fund: { to: signed.account } }) },
      gas: "100000000000000",
      deposit: 1n,
    });
    if ((await walletBalance(signed.account)) <= held) {
      return fail(502, "upstream_failed", "Meridian returned the test USDC, so your wallet is unchanged.");
    }
    const body: FaucetResult = { tx: txHashOf(outcome), amount_usd_micro: GRANT.toString() };
    return Response.json(body);
  } catch {
    return fail(503, "upstream_failed", "The faucet couldn't send test USDC. Try again in a minute.");
  }
}
