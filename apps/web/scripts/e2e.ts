import assert from "node:assert/strict";
import { z } from "zod";

const ROUTER = (process.env.ROUTER_URL ?? process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");
const KEY = process.env.RK_KEY;
const MODEL = process.env.MODEL ?? "glm-5.3-flash";

async function main(): Promise<void> {
  if (!KEY) throw new Error("RK_KEY is required");
  const headers = { authorization: `Bearer ${KEY}` };

  const models = await fetch(`${ROUTER}/api/v1/models`);
  console.log(`models ${models.status} ${(await models.text()).slice(0, 200)}`);

  const me = await fetch(`${ROUTER}/api/v1/me?format=text`, { headers });
  console.log(`me     ${me.status} ${(await me.text()).trim()}`);

  const chat = await fetch(`${ROUTER}/api/v1/chat/completions`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "Say pong." }], max_tokens: 16 }),
  });
  const reply = (await chat.json()) as { choices?: { message?: { content?: string } }[]; error?: { message: string } };
  console.log(`chat   ${chat.status} "${reply.choices?.[0]?.message?.content ?? reply.error?.message ?? ""}"`);

  const book = await fetch(`${ROUTER}/api/v1/book?model=${encodeURIComponent(MODEL)}`);
  console.log(`book   ${book.status} ${(await book.text()).slice(0, 200)}`);

  await swarm(headers);
}

const startSchema = z.object({
  agents: z.array(z.object({ key: z.string(), key_id: z.string(), model: z.string() })).min(1),
  share_usd_micro: z.string(),
});
const viewSchema = z.object({ agents: z.array(z.object({ key_id: z.string(), spent_usd_micro: z.string() })) });
const returnedSchema = z.object({ returned_usd_micro: z.string() });
const floatSchema = z.object({ float_usd_micro: z.string() });

async function swarm(headers: Record<string, string>): Promise<void> {
  const json = { ...headers, "content-type": "application/json" };
  const float = async () => BigInt(floatSchema.parse(await (await fetch(`${ROUTER}/api/v1/me`, { headers })).json()).float_usd_micro);

  const start = await fetch(`${ROUTER}/api/v1/swarm`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ agents: 2, budget_usd_micro: "20000", minutes: 5 }),
  });
  assert.equal(start.status, 200, "a swarm starts");
  const started = startSchema.parse(await start.json());
  const first = started.agents[0];
  assert.ok(first);
  const afterStart = await float();

  const child = (content: string) =>
    fetch(`${ROUTER}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${first.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: first.model, messages: [{ role: "user", content }], max_tokens: 16 }),
    });
  assert.equal((await child("Say pong.")).status, 200, "a swarm agent runs inference");
  assert.equal((await child("a".repeat(300_000))).status, 402, "a swarm agent stops at its share");
  const trade = await fetch(`${ROUTER}/api/v1/trades`, {
    method: "POST",
    headers: { authorization: `Bearer ${first.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: first.model, tokens: "1000" }),
  });
  assert.equal(trade.status, 403, "a swarm agent can't trade");

  const ids = started.agents.map((agent) => agent.key_id);
  const view = viewSchema.parse(await (await fetch(`${ROUTER}/api/v1/swarm`, { headers })).json());
  const spent = view.agents.filter((agent) => ids.includes(agent.key_id)).reduce((sum, agent) => sum + BigInt(agent.spent_usd_micro), 0n);
  const end = await fetch(`${ROUTER}/api/v1/swarm`, { method: "DELETE", headers: json, body: JSON.stringify({ key_ids: ids }) });
  const returned = BigInt(returnedSchema.parse(await end.json()).returned_usd_micro);

  assert.equal(returned + spent, BigInt(started.share_usd_micro) * BigInt(ids.length), "the budget is what was spent plus what came back");
  assert.equal((await float()) - afterStart, returned, "the parent key got the rest back");
  assert.equal((await child("Say pong.")).status, 401, "an ended swarm agent is refused");
  console.log(`swarm  ok: ${ids.length} agents, spent ${spent}, returned ${returned} micro-USD`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
