import { z } from "zod";
import { fail } from "../../../../lib/errors.ts";
import { quote } from "../../../../lib/intents.ts";

const schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fund"),
      owner: z.string().min(2).max(64),
      originAsset: z.string().min(1),
      amount: z.string().regex(/^\d{1,30}$/),
      refundTo: z.string().min(1).max(128).optional(),
      dry: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("withdraw"),
      account: z.string().min(2).max(64),
      destinationAsset: z.string().min(1),
      amount: z.string().regex(/^\d{1,30}$/),
      recipient: z.string().min(1).max(128),
      dry: z.boolean().optional(),
    })
    .strict(),
]);

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "invalid quote request");
  const input = parsed.data;
  if (input.kind === "fund" && !input.refundTo && !input.dry) {
    return fail(400, "invalid_request", "send refundTo, your address on that chain, so a failed deposit can come back");
  }
  try {
    const result =
      input.kind === "fund"
        ? await quote({
            kind: "fund",
            owner: input.owner.toLowerCase(),
            originAsset: input.originAsset,
            amount: BigInt(input.amount),
            refundTo: input.refundTo ?? null,
            dry: input.dry ?? false,
          })
        : await quote({
            kind: "withdraw",
            account: input.account.toLowerCase(),
            destinationAsset: input.destinationAsset,
            amount: BigInt(input.amount),
            recipient: input.recipient,
            dry: input.dry ?? false,
          });
    return Response.json(result);
  } catch (error) {
    return fail(502, "upstream_failed", error instanceof Error ? error.message : "1Click is unavailable");
  }
}
