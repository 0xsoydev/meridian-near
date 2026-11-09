import { fail } from "../../../../../lib/errors.ts";
import { quoteStatus } from "../../../../../lib/intents.ts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ depositAddress: string }> },
): Promise<Response> {
  const { depositAddress } = await params;
  try {
    return Response.json({ status: await quoteStatus(depositAddress) });
  } catch (error) {
    return fail(502, "upstream_failed", error instanceof Error ? error.message : "1Click is unavailable");
  }
}
