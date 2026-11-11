import { z } from "zod";
import { fail } from "../../../../lib/errors.ts";

const bodySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("getLatestBlockhash"), params: z.tuple([z.object({ commitment: z.literal("finalized") })]) }).strict(),
  z
    .object({
      method: z.literal("getAccountInfo"),
      params: z.tuple([z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/), z.object({ encoding: z.literal("base64") })]),
    })
    .strict(),
]);

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "only getLatestBlockhash and getAccountInfo are relayed");
  const response = await fetch(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...parsed.data }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return fail(502, "upstream_failed", "Solana's network didn't answer. Try again.");
  return new Response(await response.text(), { headers: { "content-type": "application/json" } });
}
