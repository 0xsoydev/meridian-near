import { approvalByCode } from "../../../../../lib/approvals.ts";
import { fail } from "../../../../../lib/errors.ts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userCode: string }> },
): Promise<Response> {
  const { userCode } = await params;
  const approval = await approvalByCode(userCode);
  if (!approval) return fail(404, "invalid_request", "no pending approval");
  return Response.json(approval);
}
