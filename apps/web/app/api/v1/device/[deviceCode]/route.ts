import { pollDevice } from "../../../../../lib/approvals.ts";
import { fail } from "../../../../../lib/errors.ts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceCode: string }> },
): Promise<Response> {
  const { deviceCode } = await params;
  const status = await pollDevice(deviceCode);
  if (!status) return fail(404, "invalid_request", "unknown device code");
  return Response.json(status);
}
