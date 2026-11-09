import { denyDevice } from "../../../../../../lib/approvals.ts";
import { fail } from "../../../../../../lib/errors.ts";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userCode: string }> },
): Promise<Response> {
  const { userCode } = await params;
  if (!(await denyDevice(userCode))) return fail(404, "invalid_request", "no pending approval");
  return Response.json({ status: "denied" });
}
