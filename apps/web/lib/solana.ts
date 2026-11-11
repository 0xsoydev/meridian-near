import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { baseDecode } from "near-api-js";
import { z } from "zod";

const SYSTEM = new Uint8Array(32);
const ASSOCIATED = baseDecode("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PDA = new TextEncoder().encode("ProgramDerivedAddress");

type Instruction = { program: number; accounts: number[]; data: number[] };

function compact(length: number): number[] {
  const out: number[] = [];
  let rest = length;
  for (;;) {
    const byte = rest & 0x7f;
    rest >>= 7;
    if (rest === 0) return [...out, byte];
    out.push(byte | 0x80);
  }
}

function u64(value: bigint): number[] {
  return Array.from({ length: 8 }, (_, at) => Number((value >> BigInt(8 * at)) & 0xffn));
}

function transaction(keys: Uint8Array[], header: [number, number, number], blockhash: string, instructions: Instruction[]): Uint8Array {
  const message = [
    ...header,
    ...compact(keys.length),
    ...keys.flatMap((key) => [...key]),
    ...baseDecode(blockhash),
    ...compact(instructions.length),
    ...instructions.flatMap((item) => [item.program, ...compact(item.accounts.length), ...item.accounts, ...compact(item.data.length), ...item.data]),
  ];
  return Uint8Array.from([...compact(header[0]), ...new Array<number>(64 * header[0]).fill(0), ...message]);
}

export function associatedAccount(owner: Uint8Array, mint: Uint8Array, program: Uint8Array): Uint8Array {
  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = sha256(Uint8Array.from([...owner, ...program, ...mint, bump, ...ASSOCIATED, ...PDA]));
    try {
      ed25519.Point.fromBytes(hash, true);
    } catch {
      return hash;
    }
  }
  throw new Error("no associated token account");
}

export function solTransfer(from: string, to: string, lamports: bigint, blockhash: string): Uint8Array {
  return transaction([baseDecode(from), baseDecode(to), SYSTEM], [1, 0, 1], blockhash, [{ program: 2, accounts: [0, 1], data: [2, 0, 0, 0, ...u64(lamports)] }]);
}

export function splTransfer(from: string, to: string, mint: string, program: string, amount: bigint, decimals: number, blockhash: string): Uint8Array {
  const owner = baseDecode(from);
  const recipient = baseDecode(to);
  const token = baseDecode(mint);
  const tokenProgram = baseDecode(program);
  const source = associatedAccount(owner, token, tokenProgram);
  const target = associatedAccount(recipient, token, tokenProgram);
  return transaction([owner, source, target, recipient, token, SYSTEM, tokenProgram, ASSOCIATED], [1, 0, 5], blockhash, [
    { program: 7, accounts: [0, 2, 3, 4, 5, 6], data: [1] },
    { program: 6, accounts: [1, 4, 2, 0], data: [12, ...u64(amount), decimals] },
  ]);
}

const blockhashSchema = z.object({ result: z.object({ value: z.object({ blockhash: z.string() }) }) });
const ownerSchema = z.object({ result: z.object({ value: z.object({ owner: z.string() }) }) });

async function rpc<T>(schema: z.ZodType<T>, method: string, params: unknown[]): Promise<T> {
  const response = await fetch("/api/v1/solana", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  }).catch(() => null);
  const parsed = schema.safeParse(await response?.json().catch(() => null));
  if (!parsed.success) throw new Error("Solana's network didn't answer. Try again");
  return parsed.data;
}

export async function latestBlockhash(): Promise<string> {
  return (await rpc(blockhashSchema, "getLatestBlockhash", [{ commitment: "finalized" }])).result.value.blockhash;
}

export async function tokenProgram(mint: string): Promise<string> {
  return (await rpc(ownerSchema, "getAccountInfo", [mint, { encoding: "base64" }])).result.value.owner;
}
