import { createHash } from "node:crypto";
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

const envelopeSchema = z
  .object({
    account_id: z.string().min(2).max(64),
    public_key: z.string().min(1).max(200),
    signature: z.string().min(1).max(200),
    nonce: z.string().min(1).max(100),
    message: z.string().min(1).max(4000),
  })
  .strict();

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
  const valid = await verifyNearSignature({
    accountId: parsed.data.account_id,
    publicKey: parsed.data.public_key,
    signature: parsed.data.signature,
    nonce: parsed.data.nonce,
    message: parsed.data.message,
    recipient: host,
  });
  if (!valid) return null;
  return { account: parsed.data.account_id.toLowerCase(), intent: intent.data };
}
