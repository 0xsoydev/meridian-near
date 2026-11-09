import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { proofValid, type Proof } from "./proof.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const spki = publicKey.export({ format: "der", type: "spki" });
const address = Buffer.from(spki).subarray(12).toString("hex");
const text = "z-ai/glm-5.3-flash:abc:def";
const signature = sign(null, Buffer.from(text, "utf8"), privateKey).toString("hex");

const proof: Proof = {
  text,
  signature,
  signing_address: address,
  signing_algo: "ed25519",
  signature_kind: "provider_tee",
};

test("an ed25519 proof over the signed text verifies", () => {
  assert.equal(proofValid(proof), true);
});

test("a tampered text or signature fails", () => {
  assert.equal(proofValid({ ...proof, text: `${text} ` }), false);
  assert.equal(proofValid({ ...proof, signature: "00".repeat(64) }), false);
});

test("an address that is not a public key fails", () => {
  assert.equal(proofValid({ ...proof, signing_address: "not-a-key" }), false);
});
