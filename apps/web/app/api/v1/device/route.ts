import { z } from "zod";
import { createKey, ensureAccount } from "../../../../lib/accounts.ts";
import { startDevice } from "../../../../lib/approvals.ts";
import { fail } from "../../../../lib/errors.ts";

const schema = z
  .object({
    name: z.string().min(1).max(64),
    cap_usd_micro: z.string().regex(/^\d{1,15}$/).optional(),
    demo: z.boolean().optional(),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "invalid device request");

  if (parsed.data.demo === true && process.env.DEMO_KEYS === "1") {
    const owner = process.env.NEAR_OWNER_ID;
    if (!owner) return fail(502, "upstream_failed", "NEAR_OWNER_ID is not set");
    const account = await ensureAccount(owner);
    const key = await createKey(account.id, "demo", "demo");
    return Response.json({ key: key.raw, key_id: key.id });
  }

  const cap = parsed.data.cap_usd_micro ? BigInt(parsed.data.cap_usd_micro) : null;
  return Response.json(await startDevice(parsed.data.name, cap));
}
