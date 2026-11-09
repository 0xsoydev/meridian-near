import { fail } from "../../../../../lib/errors.ts";
import { readAccount } from "../../../../../lib/perp.ts";

export async function GET(request: Request): Promise<Response> {
  const account = new URL(request.url).searchParams.get("account");
  if (!account) return fail(400, "invalid_request", "account is required");
  return Response.json(await readAccount(account.toLowerCase()));
}
