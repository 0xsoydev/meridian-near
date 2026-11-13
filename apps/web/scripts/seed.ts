import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureAccount } from "../lib/accounts.ts";
import { db } from "../lib/db.ts";
import { listings } from "../lib/schema.ts";
import { seal } from "../lib/secrets.ts";
import { coreId, usdcId } from "../lib/near.ts";
import { MARKETS } from "../lib/perp.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const CAPACITY = 100n * 1_000_000n;

async function listing(input: {
  sellerId: string;
  rail: string;
  model: string;
  price: bigint;
  key: string;
  nonce: string;
}): Promise<void> {
  const existing = await db()
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.clientNonce, input.nonce))
    .limit(1);
  if (existing[0]) {
    console.log(`seed: ${input.rail} listing already exists (${existing[0].id})`);
    return;
  }
  const [row] = await db()
    .insert(listings)
    .values({
      sellerId: input.sellerId,
      rail: input.rail,
      model: input.model,
      credentialCiphertext: seal(input.key),
      priceMicroPerMtok: input.price,
      capacityTokens: CAPACITY,
      status: "active",
      clientNonce: input.nonce,
    })
    .returning({ id: listings.id });
  console.log(`seed: ${input.rail} listing ${row?.id ?? "?"} on ${input.model} at ${input.price} micro/MTok`);
}

async function main(): Promise<void> {
  const owner = required("NEAR_OWNER_ID").toLowerCase();
  const account = await ensureAccount(owner);

  const nearai = process.env.NEARAI_API_KEY;
  if (nearai) {
    const model = process.env.SEED_MODEL ?? "glm-5.3-flash";
    await listing({
      sellerId: account.id,
      rail: "near-ai",
      model,
      price: BigInt(process.env.SEED_PRICE_MICRO ?? "180000"),
      key: nearai,
      nonce: `seed-near-ai-${model}`,
    });
  } else {
    console.log("seed: NEARAI_API_KEY missing, skipping the house listing");
  }

  if (process.env.STUB_RAIL_URL) {
    const stubs = [
      ["glm-5.3", 180_000n, "seed-stub-house"],
      ["deepseek-v4.1-flash", 140_000n, "seed-stub-deepseek-v4.1-flash"],
      ["gpt-6-sol", 210_000n, "seed-stub-gpt-6-sol"],
      ["claude-opus-5.5", 260_000n, "seed-stub-claude-opus-5.5"],
    ] as const;
    for (const [model, price, nonce] of stubs) {
      await listing({ sellerId: account.id, rail: "stub", model, price, key: "sk-stub", nonce });
    }
  }

  const core = coreId();
  const usdc = usdcId();
  const network = process.env.NEAR_NETWORK ?? "testnet";
  console.log(`\nOwner commands (run these once, from the team wallet):\n`);
  for (const market of MARKETS) {
    console.log(
      `near contract call-function as-transaction ${core} list_market json-args '{"model":"${market}","max_leverage":5,"max_oi":"1000000000000","funding_k":"277777777778"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${owner} network-config ${network} sign-with-keychain send`,
    );
  }
  console.log(
    `near contract call-function as-transaction ${usdc} ft_transfer_call json-args '{"receiver_id":"${core}","amount":"20000000","msg":"{\\"fund_vault\\":{}}"}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${owner} network-config ${network} sign-with-keychain send`,
  );
  console.log(
    `near contract call-function as-transaction ${core} set_cap json-args '{"key":"demo","per_day":"2000000"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${owner} network-config ${network} sign-with-keychain send`,
  );
  console.log(`\nnonce ${randomUUID()}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
