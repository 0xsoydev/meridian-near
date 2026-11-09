import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureAccount, revokeKey } from "../../../../../lib/accounts.ts";
import { expectedHost, verifySigned } from "../../../../../lib/auth.ts";
import { db } from "../../../../../lib/db.ts";
import { fail } from "../../../../../lib/errors.ts";
import { keys } from "../../../../../lib/schema.ts";

const intentSchema = z.object({ key_id: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  const signed = await verifySigned(await request.json().catch(() => null), expectedHost(request), "revoke_key");
  if (!signed) return fail(401, "invalid_api_key", "a fresh NEAR signature is required");
  const intent = intentSchema.safeParse(signed.intent);
  if (!intent.success) return fail(400, "invalid_request", "invalid revoke intent");
  const account = await ensureAccount(signed.account);
  const [row] = await db()
    .select({ id: keys.id })
    .from(keys)
    .where(and(eq(keys.id, intent.data.key_id), eq(keys.accountId, account.id)))
    .limit(1);
  if (!row) return fail(404, "invalid_request", "unknown key");
  if (!(await revokeKey(row.id))) {
    return fail(409, "invalid_request", "this key still holds bids, MTokens or offers; spend or cancel them first");
  }
  return new Response(null, { status: 204 });
}
