import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { ensureAccount } from "./accounts.ts";
import { hashKey } from "./auth.ts";
import { db } from "./db.ts";
import { capOf } from "./pay.ts";
import { approvals, keys } from "./schema.ts";
import { open, seal } from "./secrets.ts";
import type { DeviceStart, DeviceStatus } from "./types";

const TTL_MS = 600_000;
const INTERVAL_S = 3;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function userCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += ALPHABET.charAt(byte % ALPHABET.length);
  return code;
}

export async function startDevice(name: string, capMicro: bigint | null): Promise<DeviceStart> {
  const deviceCode = randomBytes(32).toString("base64url");
  const [reserved] = await db()
    .insert(keys)
    .values({ name, hash: randomBytes(32), balanceUsdMicro: 0n })
    .returning({ id: keys.id });
  if (!reserved) throw new Error("key reservation failed");
  const code = userCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db().insert(approvals).values({
    kind: "create_key",
    keyId: reserved.id,
    capUsdMicro: capMicro,
    deviceCodeHash: hashKey(deviceCode),
    userCode: code,
    expiresAt,
    status: "pending",
  });
  const host = (process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");
  const url = `${host}/a/${code}`;
  return {
    device_code: deviceCode,
    user_code: code,
    verification_uri_complete: url,
    qr: await QRCode.toString(url, { type: "utf8" }),
    expires_at: expiresAt.toISOString(),
    interval: INTERVAL_S,
  };
}

export async function pollDevice(deviceCode: string): Promise<DeviceStatus | null> {
  const [row] = await db()
    .select()
    .from(approvals)
    .where(eq(approvals.deviceCodeHash, hashKey(deviceCode)))
    .limit(1);
  if (!row) return null;
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) {
    await db()
      .update(approvals)
      .set({ status: "expired" })
      .where(and(eq(approvals.id, row.id), eq(approvals.status, "pending")));
    return { status: "expired" };
  }
  if (row.status !== "approved" || !row.keyCiphertext) {
    return { status: row.status === "approved" ? "expired" : (row.status as DeviceStatus["status"]) };
  }
  const [claimed] = await db()
    .update(approvals)
    .set({ keyCiphertext: null })
    .where(and(eq(approvals.id, row.id), eq(approvals.status, "approved")))
    .returning({ id: approvals.id });
  if (!claimed) return { status: "expired" };
  return { status: "approved", key: open(row.keyCiphertext), key_id: row.keyId };
}

export async function confirmDevice(code: string, account: string): Promise<boolean> {
  const [row] = await db()
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.userCode, code),
        eq(approvals.status, "pending"),
        gt(approvals.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return false;
  const owner = await ensureAccount(account);
  const cap = await capOf(account.toLowerCase(), row.keyId);
  if (BigInt(cap.left) <= 0n) return false;
  const raw = `rk_${randomBytes(32).toString("base64url")}`;
  const [claimed] = await db()
    .update(keys)
    .set({ accountId: owner.id, capKey: row.keyId, hash: hashKey(raw) })
    .where(and(eq(keys.id, row.keyId), isNull(keys.accountId)))
    .returning({ id: keys.id });
  if (!claimed) return false;
  await db()
    .update(approvals)
    .set({ status: "approved", keyCiphertext: seal(raw) })
    .where(and(eq(approvals.id, row.id), eq(approvals.status, "pending")));
  return true;
}

export async function denyDevice(code: string): Promise<boolean> {
  const rows = await db()
    .update(approvals)
    .set({ status: "denied" })
    .where(and(eq(approvals.userCode, code), eq(approvals.status, "pending")))
    .returning({ id: approvals.id });
  return rows.length > 0;
}

export async function approvalByCode(
  code: string,
): Promise<{ key_id: string; name: string; cap_usd_micro: string | null } | null> {
  const [row] = await db()
    .select({ keyId: approvals.keyId, cap: approvals.capUsdMicro, name: keys.name })
    .from(approvals)
    .innerJoin(keys, eq(keys.id, approvals.keyId))
    .where(
      and(
        eq(approvals.userCode, code),
        eq(approvals.status, "pending"),
        gt(approvals.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { key_id: row.keyId, name: row.name ?? "agent", cap_usd_micro: row.cap?.toString() ?? null };
}
