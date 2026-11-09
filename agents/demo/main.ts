import OpenAI from "openai";

const ROUTER = (process.env.ROUTER_URL ?? process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");
const MODEL = process.env.MODEL ?? "glm-5.3-flash";
const CAP_MICRO = process.env.CAP_MICRO ?? "5000000";
const BUY_TOKENS = process.env.BUY_TOKENS ?? "1000000";
const EXISTING_KEY = process.env.RK_KEY;

type DeviceStart = {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  qr: string;
  interval: number;
};

type DeviceStatus = { status: string; key?: string; key_id?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function device(): Promise<string> {
  const response = await fetch(`${ROUTER}/api/v1/device`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "demo agent", cap_usd_micro: CAP_MICRO }),
  });
  if (!response.ok) throw new Error(`device start answered ${response.status}`);
  const start = (await response.json()) as DeviceStart;
  console.log(`approve ${start.verification_uri_complete}`);
  console.log(`code    ${start.user_code}`);
  console.log(start.qr);
  for (;;) {
    await sleep(start.interval * 1000);
    const poll = await fetch(`${ROUTER}/api/v1/device/${start.device_code}`);
    if (!poll.ok) throw new Error(`device poll answered ${poll.status}`);
    const status = (await poll.json()) as DeviceStatus;
    if (status.status === "approved" && status.key) {
      console.log(`key     ${status.key_id}`);
      return status.key;
    }
    if (status.status === "denied" || status.status === "expired") throw new Error(`approval ${status.status}`);
  }
}

async function me(key: string, label: string): Promise<void> {
  const response = await fetch(`${ROUTER}/api/v1/me?format=text`, { headers: { authorization: `Bearer ${key}` } });
  console.log(`${label} ${(await response.text()).trim()}`);
}

async function trade(key: string, path: string, tokens: string): Promise<void> {
  const response = await fetch(`${ROUTER}/api/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, tokens }),
  });
  const body: unknown = await response.json().catch(() => null);
  console.log(`${path} ${response.status} ${JSON.stringify(body).slice(0, 160)}`);
}

async function main(): Promise<void> {
  const key = EXISTING_KEY ?? (await device());
  await me(key, "before ");

  const client = new OpenAI({ baseURL: `${ROUTER}/api/v1`, apiKey: key });
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: "In one sentence, what does a router do?" }],
    stream: true,
    max_tokens: 128,
  });
  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      process.stdout.write(delta);
    }
  }
  process.stdout.write(`\nstream ${text.length} chars\n`);

  await trade(key, "trades", BUY_TOKENS);
  await trade(key, "sells", (BigInt(BUY_TOKENS) / 2n).toString());
  await me(key, "after  ");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
