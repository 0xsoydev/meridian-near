import { z } from "zod";
import { fail } from "../../../../../lib/errors.ts";
import { quoteStatus, submitDeposit } from "../../../../../lib/intents.ts";

type Context = { params: Promise<{ depositAddress: string }> };

const submitSchema = z.object({ tx_hash: z.string().min(1).max(200), memo: z.string().min(1).max(200).optional() }).strict();

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { depositAddress } = await params;
  try {
    return Response.json({ status: await quoteStatus(depositAddress, new URL(request.url).searchParams.get("memo")) });
  } catch (error) {
    return fail(502, "upstream_failed", error instanceof Error ? error.message : "1Click is unavailable");
  }
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { depositAddress } = await params;
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "send tx_hash, and memo when the quote had one");
  try {
    await submitDeposit(parsed.data.tx_hash, depositAddress, parsed.data.memo ?? null);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fail(502, "upstream_failed", error instanceof Error ? error.message : "1Click is unavailable");
  }
}
