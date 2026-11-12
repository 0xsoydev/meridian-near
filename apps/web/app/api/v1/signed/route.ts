import { z } from "zod";
import { signedBy } from "../../../../lib/auth.ts";
import { NEAR_ACCOUNT } from "../../../../lib/client.ts";
import { fail } from "../../../../lib/errors.ts";
import { call, coreId, nearProvider, opsId, relayKey, view } from "../../../../lib/near.ts";
import { orderText, type Order } from "../../../../lib/orders.ts";
import { txHashOf } from "../../../../lib/perp-events.ts";
import type { SignedNonce, SignedResult } from "../../../../lib/types";

const owner = z.string().regex(/^(0x[0-9a-f]{40}|[0-9a-f]{64})$/);
const micro = z.string().regex(/^\d{1,20}$/);
const delta = z.string().regex(/^-?\d{1,30}$/);
const common = { owner, nonce: z.number().int().nonnegative(), valid_until: z.number().int().positive() };

const orderSchema: z.ZodType<Order> = z.discriminatedUnion("method", [
  z.object({ method: z.literal("set_cap_signed"), key: z.string().min(1).max(64), per_day: micro, ...common }).strict(),
  z.object({ method: z.literal("withdraw_signed"), amount: micro, to: z.string().regex(NEAR_ACCOUNT), ...common }).strict(),
  z.object({ method: z.literal("modify_signed"), model: z.string().min(1).max(64), size_delta: delta, margin_delta: delta, ...common }).strict(),
]);

const bodySchema = z.object({ order: orderSchema, signature: z.string().min(1).max(200) }).strict();

export async function GET(request: Request): Promise<Response> {
  const parsed = owner.safeParse(new URL(request.url).searchParams.get("owner"));
  if (!parsed.success) return fail(400, "invalid_request", "owner must be a 0x address or a 64-character hex key");
  const body: SignedNonce = { nonce: await view<number>("nonce_of", { owner: parsed.data }) };
  return Response.json(body);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "send an order and its signature");
  const { order, signature } = parsed.data;
  const now = Date.now();
  if (order.valid_until <= now || order.valid_until > now + 3_600_000) {
    return fail(400, "invalid_request", "the signature must expire within the next hour");
  }
  if (!signedBy(order.owner, orderText(coreId(), order), signature)) {
    return fail(401, "invalid_api_key", "the signature doesn't match this account");
  }
  if (order.method === "withdraw_signed" && !/^([0-9a-f]{64}|0x[0-9a-f]{40})$/.test(order.to)) {
    const exists = await nearProvider()
      .viewAccount({ accountId: order.to })
      .then(
        () => true,
        () => false,
      );
    if (!exists) return fail(400, "invalid_request", `There is no NEAR account named ${order.to}.`);
  }
  if ((await view<number>("nonce_of", { owner: order.owner })) !== order.nonce) {
    return fail(409, "invalid_request", "this signature was already used; sign again");
  }
  const { method, ...args } = order;
  try {
    const outcome = await call({ accountId: opsId(), privateKey: relayKey(), method, args: { ...args, signature }, gas: "150000000000000" });
    const body: SignedResult = { tx: txHashOf(outcome) };
    return Response.json(body);
  } catch (error) {
    const reason = /panicked: ([^"\n]+)/.exec(error instanceof Error ? error.message : "")?.[1];
    return fail(400, "invalid_request", reason ?? "the contract refused it");
  }
}
