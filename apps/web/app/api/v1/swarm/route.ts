import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { returnSwarmFloats } from "../../../../lib/accounts.ts";
import { hashKey, routerKey } from "../../../../lib/auth.ts";
import { asks, type Ask } from "../../../../lib/book.ts";
import { db } from "../../../../lib/db.ts";
import { fail } from "../../../../lib/errors.ts";
import { topUp } from "../../../../lib/pay.ts";
import { formatUsd } from "../../../../lib/price.ts";
import { keys } from "../../../../lib/schema.ts";
import type { ReturnedFloat, SwarmStart, SwarmView } from "../../../../lib/types";

const MIN_SHARE = 10_000n;

const startSchema = z
  .object({
    agents: z.number().int().min(1).max(8).optional(),
    models: z.array(z.string().min(1).max(200)).min(1).max(8).optional(),
    budget_usd_micro: z.string().regex(/^\d{1,12}$/),
    minutes: z.number().int().min(5).max(240).optional(),
  })
  .strict();

const endSchema = z.object({ key_ids: z.array(z.uuid()).min(1).max(8) }).strict();

type AgentRow = {
  id: string;
  model: string | null;
  spent: string;
  remaining: string;
  requests: number;
  expires_at: Date | string;
  ended: boolean;
};

export async function POST(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  if (key.parentId) return fail(403, "invalid_request", "a swarm agent can't start a swarm");
  if (!key.accountId || !key.capKey) return fail(403, "approval_required", "this key is not approved yet");

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.agents === undefined && parsed.data.models === undefined)) {
    return fail(400, "invalid_request", "send agents (1 to 8) or models, and budget_usd_micro");
  }

  const best = new Map<string, Ask>();
  for (const ask of await asks(null)) if (!best.has(ask.model)) best.set(ask.model, ask);
  const wanted = parsed.data.models ? [...new Set(parsed.data.models)] : [...best.keys()].slice(0, parsed.data.agents);
  const missing = wanted.filter((model) => !best.has(model));
  if (missing.length > 0) return fail(404, "no_liquidity", `no live asks for ${missing.join(", ")}`);
  const chosen = wanted.flatMap((model) => best.get(model) ?? []);
  if (chosen.length === 0) return fail(404, "no_liquidity", "no model has a live ask right now");

  const share = BigInt(parsed.data.budget_usd_micro) / BigInt(chosen.length);
  if (share < MIN_SHARE) return fail(400, "invalid_request", `each agent needs at least ${formatUsd(MIN_SHARE)} of the budget`);
  const total = share * BigInt(chosen.length);
  if (key.balanceUsdMicro < total) {
    const topped = await topUp(key, total);
    if ("blocked" in topped) return topped.blocked;
  }

  const expires = new Date(Date.now() + (parsed.data.minutes ?? 60) * 60_000);
  const agents = chosen.map((ask) => ({ ask, id: randomUUID(), raw: `rk_${randomBytes(32).toString("base64url")}` }));
  const values = sql.join(
    agents.map((agent) => sql`(${agent.id}::uuid, ${agent.ask.model}::text, ${hashKey(agent.raw)}::bytea)`),
    sql`, `,
  );
  const inserted = await db().execute<{ id: string }>(sql`
    with p as (
      update keys set balance_usd_micro = balance_usd_micro - ${total}
      where id = ${key.id} and balance_usd_micro >= ${total}
      returning id, account_id, name
    )
    insert into keys (id, account_id, name, hash, balance_usd_micro, default_model, parent_id, expires_at)
    select c.id, p.account_id, coalesce(p.name, 'agent') || ' / ' || c.model, c.hash, ${share}::bigint, c.model, p.id,
      ${expires.toISOString()}::timestamptz
    from p, (values ${values}) as c(id, model, hash)
    returning id
  `);
  if (inserted.rows.length !== agents.length) {
    return fail(409, "insufficient_balance", "the key's balance changed while the swarm started; try again");
  }

  const body: SwarmStart = {
    agents: agents.map((agent) => ({
      key: agent.raw,
      key_id: agent.id,
      model: agent.ask.model,
      rail: agent.ask.rail.id,
      ask_micro_per_mtok: agent.ask.price.toString(),
    })),
    share_usd_micro: share.toString(),
    expires_at: expires.toISOString(),
  };
  return Response.json(body);
}

export async function GET(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  const result = await db().execute<AgentRow>(sql`
    select k.id, k.default_model as model,
      coalesce(sum(u.charge_usd_micro) filter (where u.status = 'settled'), 0)::text as spent,
      (k.balance_usd_micro + k.reserved_usd_micro)::text as remaining,
      (count(u.id) filter (where u.status = 'settled'))::int as requests,
      k.expires_at, k.expires_at <= now() as ended
    from keys k
    left join usage u on u.key_id = k.id
    where k.parent_id = ${key.id} and k.created_at > now() - interval '1 day'
    group by k.id
    order by k.created_at, k.id
  `);
  const body: SwarmView = {
    agents: result.rows.map((row) => ({
      key_id: row.id,
      model: row.model ?? "",
      spent_usd_micro: row.spent,
      left_usd_micro: row.remaining,
      requests: row.requests,
      expires_at: new Date(row.expires_at).toISOString(),
      ended: row.ended,
    })),
  };
  return Response.json(body);
}

export async function DELETE(request: Request): Promise<Response> {
  const key = await routerKey(request);
  if (!key) return fail(401, "invalid_api_key", "invalid router key");
  const parsed = endSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "send key_ids, the swarm agents to end");
  await db()
    .update(keys)
    .set({ expiresAt: sql`now()` })
    .where(and(eq(keys.parentId, key.id), inArray(keys.id, parsed.data.key_ids), sql`${keys.expiresAt} > now()`));
  const returned = (await returnSwarmFloats(key.id))
    .filter((row) => parsed.data.key_ids.includes(row.id))
    .reduce((sum, row) => sum + row.amount, 0n);
  const body: ReturnedFloat = { returned_usd_micro: returned.toString() };
  return Response.json(body);
}
