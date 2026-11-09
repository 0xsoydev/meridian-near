import { createKey, ensureAccount, listKeys } from "../../../../lib/accounts.ts";
import { expectedHost, verifySigned } from "../../../../lib/auth.ts";
import { fail } from "../../../../lib/errors.ts";
import { capOf } from "../../../../lib/pay.ts";
import type { CreateKeyResult } from "../../../../lib/types";

export async function POST(request: Request): Promise<Response> {
  const signed = await verifySigned(await request.json().catch(() => null), expectedHost(request), "create_key");
  if (!signed) return fail(401, "invalid_api_key", "a fresh NEAR signature is required");
  const account = await ensureAccount(signed.account);
  const key = await createKey(account.id, null);
  const result: CreateKeyResult = { key: key.raw, key_id: key.id };
  return Response.json(result);
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const signed = await verifySigned(
    {
      account_id: params.get("account_id"),
      public_key: params.get("public_key"),
      signature: params.get("signature"),
      nonce: params.get("nonce"),
      message: params.get("message"),
    },
    expectedHost(request),
    "list_keys",
  );
  if (!signed) return fail(401, "invalid_api_key", "a fresh NEAR signature is required");
  const account = await ensureAccount(signed.account);
  const listed = await listKeys(account.id);
  const keys = await Promise.all(
    listed.map(async (key) => {
      if (!key.cap_key) return key;
      const cap = await capOf(signed.account, key.cap_key).catch(() => null);
      return cap
        ? {
            ...key,
            cap: {
              per_day_usd_micro: cap.per_day,
              used_today_usd_micro: cap.used_today,
              left_usd_micro: cap.left,
            },
          }
        : key;
    }),
  );
  return Response.json({ keys });
}
