import { createKey, ensureAccount, listKeys, revokeKey } from "../../../../lib/accounts.ts";
import { expectedHost, routerKey, verifySigned } from "../../../../lib/auth.ts";
import { fail } from "../../../../lib/errors.ts";
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
  return Response.json({ keys: await listKeys(account.id) });
}

export async function DELETE(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  if (!(await revokeKey(key.id))) {
    return fail(409, "invalid_request", "this key still holds a float, bids, MTokens or offers; spend or cancel them first");
  }
  return new Response(null, { status: 204 });
}
