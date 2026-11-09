import { eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "./db.ts";
import { call, coreId, nearNetwork, opsId, opsKey, usdcId, view } from "./near.ts";
import { accounts, keys, type KeyRow } from "./schema.ts";
import type { RouterError } from "./types";

export const PULL_MICRO = 500_000n;
export const DEMO_PULL_MICRO = 50_000n;
export const LOW_FLOAT_MICRO = 250_000n;

type CapView = { per_day: string; used_today: string; left: string };

export async function ownerAddress(accountId: string | null): Promise<string | null> {
  if (!accountId) return null;
  const [row] = await db()
    .select({ address: accounts.address })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return row?.address ?? null;
}

export async function walletBalance(owner: string): Promise<bigint> {
  return BigInt(await view<string>("wallet", { account: owner }));
}

export async function capOf(owner: string, capKey: string): Promise<CapView> {
  return view<CapView>("cap", { owner, key: capKey });
}

export type TopUpResult = { floatMicro: bigint } | { blocked: Response };

const inflight = new Map<string, Promise<TopUpResult>>();

export async function refill(key: KeyRow): Promise<void> {
  if (key.balanceUsdMicro >= LOW_FLOAT_MICRO) return;
  await topUp(key, PULL_MICRO);
}

export function topUp(key: KeyRow, needMicro: bigint): Promise<TopUpResult> {
  const running = inflight.get(key.id);
  if (running) return running;
  const task = pullOnce(key, needMicro).finally(() => inflight.delete(key.id));
  inflight.set(key.id, task);
  return task;
}

async function pullOnce(key: KeyRow, needMicro: bigint): Promise<TopUpResult> {
  const owner = await ownerAddress(key.accountId);
  if (!owner || !key.capKey) return { blocked: await blocked("cap", key, needMicro) };
  const [cap, wallet] = await Promise.all([capOf(owner, key.capKey), walletBalance(owner)]);
  const left = BigInt(cap.left);
  const short = needMicro - key.balanceUsdMicro;
  const target = key.capKey === "demo" ? DEMO_PULL_MICRO : PULL_MICRO;
  const amount = minBig(minBig(maxBig(target, short), left), wallet);
  if (amount < short) return { blocked: await blocked(left < short ? "cap" : "wallet", key, needMicro) };
  await call({
    accountId: opsId(),
    privateKey: opsKey(),
    method: "pull",
    args: { owner, key: key.capKey, amount: amount.toString() },
  });
  const [row] = await db()
    .update(keys)
    .set({ balanceUsdMicro: sql`${keys.balanceUsdMicro} + ${amount}` })
    .where(eq(keys.id, key.id))
    .returning({ balance: keys.balanceUsdMicro });
  return { floatMicro: row?.balance ?? key.balanceUsdMicro + amount };
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

async function blocked(kind: "cap" | "wallet", key: KeyRow, needMicro: bigint): Promise<Response> {
  const host = (process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");
  const url = `${host}/keys?key=${key.id}`;
  const qr = await QRCode.toString(url, { type: "utf8", margin: 1 });
  const name = key.name ?? "this key";
  const message =
    key.capKey === "demo"
      ? "the shared demo limit is used up today; create your own agent with POST /api/v1/device"
      : kind === "cap"
        ? `${name} used today's limit. Raise it here: ${url}`
        : `the owner's Meridian wallet is short. Fund it here: ${url}`;
  const body: RouterError = {
    error: {
      message,
      type: "permission_error",
      code: kind === "cap" ? "approval_required" : "insufficient_balance",
    },
    action: {
      url,
      code: key.capKey === "demo" ? "DEMO" : key.id.slice(0, 8).toUpperCase(),
      qr,
      near_cli:
        kind === "cap"
          ? `near contract call-function as-transaction ${coreId()} set_cap json-args '{"key":"${key.id}","per_day":"${needMicro.toString()}"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' sign-as <owner> network-config ${nearNetwork()} sign-with-keychain send`
          : `near contract call-function as-transaction ${usdcId()} ft_transfer_call json-args '{"receiver_id":"${coreId()}","amount":"${needMicro.toString()}","msg":"{\\"fund\\":{}}"}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as <owner> network-config ${nearNetwork()} sign-with-keychain send`,
      poll: "/api/v1/me",
    },
  };
  return Response.json(body, { status: kind === "cap" ? 403 : 402 });
}
