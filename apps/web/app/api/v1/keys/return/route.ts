import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureAccount, returnFloat } from "../../../../../lib/accounts.ts";
import { expectedHost, verifySigned } from "../../../../../lib/auth.ts";
import { db } from "../../../../../lib/db.ts";
import { fail } from "../../../../../lib/errors.ts";
import { keys } from "../../../../../lib/schema.ts";
import type { ReturnedFloat } from "../../../../../lib/types";

const intentSchema = z.object({ key_id: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  const signed = await verifySigned(await request.json().catch(() => null), expectedHost(request), "return_float");
  if (!signed) return fail(401, "invalid_api_key", "a fresh NEAR signature is required");
  const intent = intentSchema.safeParse(signed.intent);
  if (!intent.success) return fail(400, "invalid_request", "invalid return intent");
  const account = await ensureAccount(signed.account);
  const [row] = await db()
    .select({ id: keys.id })
    .from(keys)
    .where(and(eq(keys.id, intent.data.key_id), eq(keys.accountId, account.id)))
    .limit(1);
  if (!row) return fail(404, "invalid_request", "unknown key");
  const returned = await returnFloat(row.id);
  if (returned === 0n) return fail(409, "invalid_request", "this key has nothing to move");
  const body: ReturnedFloat = { returned_usd_micro: returned.toString() };
  return Response.json(body);
}
