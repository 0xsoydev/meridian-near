import assert from "node:assert/strict";
import test from "node:test";
import { baseDecode, baseEncode } from "near-api-js";
import { associatedAccount, solTransfer, splTransfer } from "./solana.ts";

const OWNER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BLOCKHASH = "11111111111111111111111111111111";

test("associatedAccount finds the token account Solana derives for an owner and mint", () => {
  assert.equal(baseEncode(associatedAccount(baseDecode(OWNER), baseDecode(USDC), baseDecode(TOKEN))), "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B");
});

test("solTransfer and splTransfer lay out one signer and their instructions", () => {
  const sol = solTransfer(OWNER, USDC, 1_000_000n, BLOCKHASH);
  assert.deepEqual([...sol.slice(0, 1)], [1]);
  assert.deepEqual([...sol.slice(65, 69)], [1, 0, 1, 3]);
  assert.deepEqual([...sol.slice(-12)], [2, 0, 0, 0, 64, 66, 15, 0, 0, 0, 0, 0]);
  const spl = splTransfer(OWNER, USDC, USDC, TOKEN, 2_500_000n, 6, BLOCKHASH);
  assert.deepEqual([...spl.slice(65, 69)], [1, 0, 5, 8]);
  assert.deepEqual([...spl.slice(-10)], [12, 160, 37, 38, 0, 0, 0, 0, 0, 6]);
});
