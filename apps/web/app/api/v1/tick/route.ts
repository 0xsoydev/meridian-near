import { dailyClose, liquidateUnderwater, matchRestingBids, postIndexes, publishRollups, sweepStale } from "../../../../../../keeper/jobs.ts";
import { fail } from "../../../../lib/errors.ts";

export const maxDuration = 60;

const JOBS: ReadonlyArray<[string, () => Promise<unknown>]> = [
  ["rollup", publishRollups],
  ["index", postIndexes],
  ["sweep", sweepStale],
  ["match", matchRestingBids],
  ["liquidate", liquidateUnderwater],
  ["payouts", dailyClose],
];

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "invalid_api_key", "the cron secret is required");
  const ran: Record<string, string> = {};
  for (const [name, job] of JOBS) {
    ran[name] = await job().then(
      () => "ok",
      (error: unknown) => (error instanceof Error ? error.message : "failed"),
    );
  }
  return Response.json(ran);
}
