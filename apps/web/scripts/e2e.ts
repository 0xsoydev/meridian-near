

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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
