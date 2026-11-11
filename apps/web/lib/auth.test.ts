import assert from "node:assert/strict";
import test from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { ethereumSigner, verifySigned } from "./auth.ts";

const secret = keccak_256(Buffer.from("meridian auth test", "utf8"));
const address = `0x${Buffer.from(keccak_256(secp256k1.getPublicKey(secret, false).subarray(1)).subarray(12)).toString("hex")}`;

function personalSign(message: string): string {
  const text = Buffer.from(message, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${text.length}`, "utf8"), text]));
  const signature = secp256k1.sign(digest, secret, { prehash: false, format: "recovered" });
  return `0x${Buffer.from(signature.subarray(1)).toString("hex")}${(27 + (signature[0] ?? 0)).toString(16)}`;
}

function intent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ domain: "meridian.test", action: "list_keys", issued_at: new Date().toISOString(), ...overrides });
}

test("ethereumSigner recovers the address that signed, matching web3.js", () => {
  const signer = "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23";
  const signature =
    "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c";
  assert.equal(ethereumSigner("Some data", signature), signer);
  assert.notEqual(ethereumSigner("Some other data", signature), signer);
  assert.equal(ethereumSigner("Some data", `${signature.slice(0, -2)}1d`), null);
  const message = intent();
  assert.equal(ethereumSigner(message, personalSign(message)), address);
});

test("verifySigned accepts an Ethereum signature only from the 0x account it names", async () => {
  const message = intent({ key_id: "k1" });
  const signature = personalSign(message);
  const signed = await verifySigned({ account_id: address, signature, message }, "meridian.test", "list_keys");
  assert.equal(signed?.account, address);
  assert.equal(signed?.intent.key_id, "k1");

  const other = "0x0000000000000000000000000000000000000001";
  assert.equal(await verifySigned({ account_id: other, signature, message }, "meridian.test", "list_keys"), null);
  assert.equal(await verifySigned({ account_id: address.toUpperCase().replace("0X", "0x"), signature, message }, "meridian.test", "list_keys"), null);
  assert.equal(await verifySigned({ account_id: address, signature, message: intent({ key_id: "k2" }) }, "meridian.test", "list_keys"), null);
  assert.equal(await verifySigned({ account_id: address, signature, message }, "evil.test", "list_keys"), null);
  assert.equal(await verifySigned({ account_id: address, signature, message }, "meridian.test", "revoke_key"), null);

  const stale = intent({ issued_at: new Date(Date.now() - 600_000).toISOString() });
  assert.equal(await verifySigned({ account_id: address, signature: personalSign(stale), message: stale }, "meridian.test", "list_keys"), null);
  assert.equal(await verifySigned({ account_id: address, signature, message, public_key: "x" }, "meridian.test", "list_keys"), null);
});
