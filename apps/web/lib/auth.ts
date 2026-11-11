import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.ts";
import { verifyNearSignature } from "./near.ts";
import { keys, type KeyRow } from "./schema.ts";

export function hashKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

export async function routerKey(request: Request): Promise<KeyRow | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  if (!raw.startsWith("rk_")) return null;
  const rows = await db()
    .select()
    .from(keys)
    .where(and(eq(keys.hash, hashKey(raw)), or(isNull(keys.expiresAt), sql`${keys.expiresAt} > now()`)))
    .limit(1);
  return rows[0] ?? null;
}

export function expectedHost(request: Request): string {
  const configured = process.env.PUBLIC_HOST;
  if (configured) {
    try {
      return new URL(configured).host;
    } catch {
      return configured;
    }
  }
  return request.headers.get("host") ?? new URL(request.url).host;
}

const envelopeSchema = z.union([
  z
    .object({
      account_id: z.string().min(2).max(64),
      public_key: z.string().min(1).max(200),
      signature: z.string().min(1).max(200),
      nonce: z.string().min(1).max(100),
      message: z.string().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      account_id: z.string().regex(/^0x[0-9a-f]{40}$/),
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      message: z.string().min(1).max(4000),
    })
    .strict(),
]);

export function ethereumSigner(message: string, signature: string): string | null {
  const text = Buffer.from(message, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${text.length}`, "utf8"), text]));
  const bytes = Buffer.from(signature.replace(/^0x/, ""), "hex");
  const v = bytes[64] ?? 0;
  const recovery = v >= 27 ? v - 27 : v;
  if (bytes.length !== 65 || recovery > 1) return null;
  try {
    const point = secp256k1.Signature.fromBytes(Buffer.concat([Buffer.of(recovery), bytes.subarray(0, 64)]), "recovered").recoverPublicKey(digest);
    return `0x${Buffer.from(keccak_256(point.toBytes(false).subarray(1)).subarray(12)).toString("hex")}`;
  } catch {
    return null;
  }
}

const intentSchema = z.object({ domain: z.string(), action: z.string(), issued_at: z.string() }).passthrough();

export async function verifySigned(
  envelope: unknown,
  host: string,
  action: string,
): Promise<{ account: string; intent: Record<string, unknown> } | null> {
  const parsed = envelopeSchema.safeParse(envelope);
  if (!parsed.success) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(parsed.data.message);
  } catch {
    return null;
  }
  const intent = intentSchema.safeParse(raw);
  if (!intent.success) return null;
  if (intent.data.domain !== host || intent.data.action !== action) return null;
  const age = Date.now() - Date.parse(intent.data.issued_at);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000) return null;
  const valid =
    "public_key" in parsed.data
      ? await verifyNearSignature({
          accountId: parsed.data.account_id,
          publicKey: parsed.data.public_key,
          signature: parsed.data.signature,
          nonce: parsed.data.nonce,
          message: parsed.data.message,
          recipient: host,
        })
      : ethereumSigner(parsed.data.message, parsed.data.signature) === parsed.data.account_id;
  if (!valid) return null;
  return { account: parsed.data.account_id.toLowerCase(), intent: intent.data };
}
