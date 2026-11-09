import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureAccount } from "../../../../lib/accounts.ts";
import { expectedHost, verifySigned } from "../../../../lib/auth.ts";
import { db } from "../../../../lib/db.ts";
import { fail } from "../../../../lib/errors.ts";
import { listingPriceError, parseCapacityMtok } from "../../../../lib/listings.ts";
import { catalog } from "../../../../lib/rails.ts";
import { listings } from "../../../../lib/schema.ts";

const base = {
  domain: z.string(),
  issued_at: z.string(),
  listing_id: z.uuid(),
  client_nonce: z.string().min(8).max(128),
};

const cancelSchema = z.object({ ...base, action: z.literal("cancel") }).strict();
const amendSchema = z
  .object({
    ...base,
    action: z.literal("amend"),
    price_micro_per_mtok: z.string().regex(/^\d{1,18}$/),
    capacity_mtok: z.string().regex(/^\d{1,18}$/),
  })
  .strict();

async function owned(listingId: string, account: string) {
  const owner = await ensureAccount(account);
  const [row] = await db()
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.sellerId, owner.id)))
    .limit(1);
  return row ?? null;
}

function reply(row: typeof listings.$inferSelect): Response {
  return Response.json({
    listing_id: row.id,
    rail: row.rail,
    model: row.model,
    price_micro_per_mtok: row.priceMicroPerMtok.toString(),
    capacity_tokens: row.capacityTokens.toString(),
    used_tokens: row.usedTokens.toString(),
    reserved_tokens: row.reservedTokens.toString(),
    status: row.status,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { signed?: unknown } | null;
  const signed = await verifySigned(body?.signed, expectedHost(request), "amend");
  if (!signed) return fail(401, "invalid_api_key", "invalid NEAR signature");
  const intent = amendSchema.safeParse(signed.intent);
  if (!intent.success || intent.data.listing_id !== id) return fail(400, "invalid_request", "invalid amend intent");

  const row = await owned(id, signed.account);
  if (!row) return fail(404, "invalid_request", "unknown listing");

  const rail = (await catalog()).find((entry) => entry.id === row.rail);
  const model = rail?.models.find((entry) => entry.canonical === row.model);
  if (!model) return fail(400, "invalid_request", "this listing's rail no longer serves the model");

  const price = BigInt(intent.data.price_micro_per_mtok);
  const priceError = listingPriceError(price, { prompt: model.listPrompt, completion: model.listCompletion });
  if (priceError) return fail(400, "invalid_request", priceError);

  const capacity = parseCapacityMtok(intent.data.capacity_mtok);
  if (capacity === null) return fail(400, "invalid_request", "invalid capacity");
  if (capacity < row.usedTokens + row.reservedTokens) {
    return fail(409, "invalid_request", "capacity cannot fall below what is already used or reserved");
  }

  const [updated] = await db()
    .update(listings)
    .set({ priceMicroPerMtok: price, capacityTokens: capacity, clientNonce: intent.data.client_nonce })
    .where(and(eq(listings.id, id), eq(listings.sellerId, row.sellerId)))
    .returning();
  if (!updated) return fail(404, "invalid_request", "unknown listing");
  return reply(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { signed?: unknown } | null;
  const signed = await verifySigned(body?.signed, expectedHost(request), "cancel");
  if (!signed) return fail(401, "invalid_api_key", "invalid NEAR signature");
  const intent = cancelSchema.safeParse(signed.intent);
  if (!intent.success || intent.data.listing_id !== id) return fail(400, "invalid_request", "invalid cancel intent");

  const row = await owned(id, signed.account);
  if (!row) return fail(404, "invalid_request", "unknown listing");
  if (row.reservedTokens > 0n) return fail(409, "invalid_request", "a request is in flight on this listing; retry in a moment");

  const [updated] = await db()
    .update(listings)
    .set({ status: "cancelled", clientNonce: intent.data.client_nonce })
    .where(and(eq(listings.id, id), eq(listings.sellerId, row.sellerId)))
    .returning();
  if (!updated) return fail(404, "invalid_request", "unknown listing");
  return reply(updated);
}
