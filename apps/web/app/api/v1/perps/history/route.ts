import { z } from "zod";
import { fail } from "../../../../../lib/errors.ts";
import { coreId, txOutcome } from "../../../../../lib/near.ts";
import { perpEventsIn, perpHistory, recordPerpEvents } from "../../../../../lib/perp-events.ts";

const account = z.string().regex(/^[a-z0-9._-]{2,64}$/);
const bodySchema = z.object({ account, tx_hashes: z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/)).min(1).max(4) }).strict();

export async function GET(request: Request): Promise<Response> {
  const parsed = account.safeParse((new URL(request.url).searchParams.get("account") ?? "").toLowerCase());
  if (!parsed.success) return fail(400, "invalid_request", "account must be a NEAR account id");
  return Response.json({ data: await perpHistory(parsed.data) });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "expected { account, tx_hashes } with one to four transaction hashes");
  const owner = parsed.data.account.toLowerCase();
  for (const hash of parsed.data.tx_hashes) {
    const outcome = await txOutcome(hash, owner).catch(() => null);
    if (outcome) await recordPerpEvents(hash, perpEventsIn(outcome, coreId()));
  }
  return Response.json({ data: await perpHistory(owner) });
}
