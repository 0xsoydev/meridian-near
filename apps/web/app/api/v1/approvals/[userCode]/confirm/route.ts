import { z } from "zod";
import { confirmDevice } from "../../../../../../lib/approvals.ts";
import { fail } from "../../../../../../lib/errors.ts";

const schema = z.object({ account_id: z.string().min(2).max(64) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userCode: string }> },
): Promise<Response> {
  const { userCode } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "invalid account");
  const approved = await confirmDevice(userCode, parsed.data.account_id);
  if (!approved) return fail(409, "invalid_request", "set the on-chain limit for this key first");
  return Response.json({ status: "approved" });
}
