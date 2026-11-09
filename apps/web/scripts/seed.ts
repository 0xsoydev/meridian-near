import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureAccount } from "../lib/accounts.ts";
import { db } from "../lib/db.ts";
import { listings } from "../lib/schema.ts";
import { seal } from "../lib/secrets.ts";
import { coreId, usdcId } from "../lib/near.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const MODEL = process.env.SEED_MODEL ?? "glm-5.3-flash";
const PRICE = BigInt(process.env.SEED_PRICE_MICRO ?? "180000");
const CAPACITY_MTOK = process.env.SEED_CAPACITY_MTOK ?? "100";
const NONCE = "seed-near-ai-house";

async function main(): Promise<void> {
  const owner = required("NEAR_OWNER_ID").toLowerCase();
  const account = await ensureAccount(owner);
  const existing = await db().select({ id: listings.id }).from(listings).where(eq(listings.clientNonce, NONCE)).limit(1);
  if (existing[0]) {
    console.log(`seed: house listing already exists (${existing[0].id})`);
  } else {
    const [row] = await db()
      .insert(listings)
      .values({
        sellerId: account.id,
        rail: "near-ai",
        model: MODEL,
        credentialCiphertext: seal(required("NEARAI_API_KEY")),
        priceMicroPerMtok: PRICE,
        capacityTokens: BigInt(CAPACITY_MTOK) * 1_000_000n,
        status: "active",
        clientNonce: NONCE,
      })
      .returning({ id: listings.id });
    console.log(`seed: house listing ${row?.id ?? "?"} at ${PRICE} micro/MTok`);
  }

  const core = coreId();
  const usdc = usdcId();
  console.log(`\nOwner commands (run these once, from the team wallet):\n`);
  console.log(
    `near contract call-function as-transaction ${core} list_market json-args '{"model":"${MODEL}","max_leverage":5,"max_oi":"1000000000000","funding_k":"277777777778"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${owner} network-config ${process.env.NEAR_NETWORK ?? "testnet"} sign-with-keychain send`,
  );
  console.log(
    `near contract call-function as-transaction ${core} list_market json-args '{"model":"glm-5.3","max_leverage":5,"max_oi":"1000000000000","funding_k":"277777777778"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${owner} network-config ${process.env.NEAR_NETWORK ?? "testnet"} sign-with-keychain send`,
  );
  console.log(
    `near contract call-function as-transaction ${usdc} ft_transfer_call json-args '{"receiver_id":"${core}","amount":"25000000","msg":"{\\"fund_vault\\":{}}"}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${owner} network-config ${process.env.NEAR_NETWORK ?? "testnet"} sign-with-keychain send`,
  );
  console.log(
    `near contract call-function as-transaction ${core} set_cap json-args '{"key":"demo","per_day":"2000000"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${owner} network-config ${process.env.NEAR_NETWORK ?? "testnet"} sign-with-keychain send`,
  );
  console.log(`\nnonce ${randomUUID()}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
