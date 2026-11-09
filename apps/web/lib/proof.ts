import { createPublicKey, randomBytes, verify } from "node:crypto";
import { baseDecode } from "near-api-js";
import { z } from "zod";

const proofSchema = z.object({
  text: z.string().min(1),
  signature: z.string().min(1),
  signing_address: z.string().min(1),
  signing_algo: z.string().optional(),
  signature_kind: z.string().optional(),
});

const attestationSchema = z.object({
  gateway_attestation: z.object({ signing_address: z.string() }),
});

export type Proof = z.infer<typeof proofSchema>;

const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

function base58(value: string): Buffer | null {
  try {
    return Buffer.from(baseDecode(value));
  } catch {
    return null;
  }
}

function publicKey(address: string): ReturnType<typeof createPublicKey> | null {
  const hex = address.replace(/^0x/, "");
  const raw = /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, "hex") : base58(address);
  if (!raw || raw.length !== 32) return null;
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI, raw]), format: "der", type: "spki" });
}

function signatureBytes(signature: string): Buffer | null {
  const hex = signature.replace(/^0x/, "");
  const raw = /^[0-9a-fA-F]{128}$/.test(hex) ? Buffer.from(hex, "hex") : base58(signature);
  return raw && raw.length === 64 ? raw : null;
}

export function readProof(raw: string | null): Proof | null {
  if (!raw) return null;
  try {
    const parsed = proofSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function proofValid(proof: Proof): boolean {
  if (proof.signing_algo !== undefined && proof.signing_algo !== "ed25519") return false;
  const key = publicKey(proof.signing_address);
  const signature = signatureBytes(proof.signature);
  if (!key || !signature) return false;
  try {
    return verify(null, Buffer.from(proof.text, "utf8"), key, signature);
  } catch {
    return false;
  }
}

export async function fetchProof(baseUrl: string, key: string, chatId: string): Promise<Proof | null> {
  const response = await fetch(`${baseUrl}/signature/${encodeURIComponent(chatId)}?signing_algo=ed25519`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const parsed = proofSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export async function attestedSigner(baseUrl: string): Promise<string | null> {
  const nonce = randomBytes(32).toString("hex");
  const response = await fetch(`${baseUrl}/attestation/report?signing_algo=ed25519&nonce=${nonce}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const parsed = attestationSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.gateway_attestation.signing_address : null;
}
