import { fail } from "../../../../../lib/errors.ts";
import { tokens } from "../../../../../lib/intents.ts";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ data: await tokens() });
  } catch (error) {
    return fail(502, "upstream_failed", error instanceof Error ? error.message : "1Click is unavailable");
  }
}
