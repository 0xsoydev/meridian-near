import assert from "node:assert/strict";
import test from "node:test";
import {
  exchange,
  maskAccount,
  OAuthError,
  parseCredential,
  readCode,
  readCredential,
  refreshBundle,
  sealCredential,
  startOAuth,
  type OAuthBundle,
} from "./oauth.ts";

process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

const idToken = [
  "e30",
  Buffer.from(
    JSON.stringify({
      email: "seller@example.com",
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_1", chatgpt_plan_type: "pro" },
    }),
  ).toString("base64url"),
  "sig",
].join(".");

function stub(answer: unknown): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(answer);
  return () => {
    globalThis.fetch = original;
  };
}

test("a pasted Claude code carries its state", () => {
  assert.deepEqual(readCode("claude-code", "abc123#state456"), { code: "abc123", state: "state456" });
  assert.deepEqual(readCode("codex", "http://localhost:1455/auth/callback?code=xyz&state=s1"), { code: "xyz", state: "s1" });
  assert.equal(readCode("claude-code", "abc123"), null);
  assert.equal(readCode("codex", "xyz"), null);
});

test("stored credentials round-trip and keep their kind", () => {
  const bundle: OAuthBundle = {
    kind: "oauth",
    rail: "codex",
    access: "access-1",
    refresh: "refresh-1",
    expiresAt: "2026-11-12T00:00:00.000Z",
    account: "seller@example.com",
    accountId: "acct_1",
    plan: "pro",
  };
  assert.deepEqual(parseCredential(JSON.stringify(bundle)), bundle);
  assert.deepEqual(readCredential(sealCredential(bundle)), bundle);
  assert.deepEqual(readCredential(sealCredential({ kind: "api_key", key: "sk-live" })), { kind: "api_key", key: "sk-live" });
});

test("a bad stored shape is rejected, and a raw key that looks like JSON is not", () => {
  assert.throws(() => parseCredential('{"kind":"oauth","rail":"codex"}'));
  assert.deepEqual(parseCredential("{not-json"), { kind: "api_key", key: "{not-json" });
});

test("the public account label is masked", () => {
  assert.equal(maskAccount("seller@example.com"), "s***@example.com");
  assert.equal(maskAccount("Acme Org"), "A***");
  assert.equal(maskAccount(null), null);
});

test("the Claude connect uses the current subscription endpoints", () => {
  const { url } = startOAuth("claude-code");
  assert.ok(url.startsWith("https://claude.com/cai/oauth/authorize?"));
  assert.ok(url.includes("code_challenge_method=S256"));
  assert.ok(url.includes("user%3Asessions%3Aclaude_code"));
});

test("the Claude exchange sends state to the platform token endpoint", async () => {
  const seen: { url: string; body: Record<string, unknown> | null } = { url: "", body: null };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    seen.url = String(input);
    seen.body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return Response.json({ access_token: "a", refresh_token: "r", expires_in: 3600 });
  };
  try {
    await exchange("claude-code", "code", "verifier", "state-1");
    assert.equal(seen.url, "https://platform.claude.com/v1/oauth/token");
    assert.equal(seen.body?.state, "state-1");
    assert.equal(seen.body?.redirect_uri, "https://platform.claude.com/oauth/code/callback");
  } finally {
    globalThis.fetch = original;
  }
});

test("a token endpoint refusal carries its reason", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { type: "rate_limit_error" } }, { status: 429 });
  try {
    await assert.rejects(
      exchange("claude-code", "code", "verifier", "state"),
      (error: unknown) =>
        error instanceof OAuthError && !error.terminal && error.message.includes("rate_limit_error"),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("the exchange keeps the account and plan from the id token", async () => {
  const restore = stub({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, id_token: idToken });
  try {
    const bundle = await exchange("codex", "code", "verifier");
    assert.equal(bundle.access, "access-1");
    assert.equal(bundle.refresh, "refresh-1");
    assert.equal(bundle.account, "seller@example.com");
    assert.equal(bundle.accountId, "acct_1");
    assert.equal(bundle.plan, "pro");
  } finally {
    restore();
  }
});

test("a refresh rotates the token and keeps the old refresh when none returns", async () => {
  const bundle: OAuthBundle = {
    kind: "oauth",
    rail: "codex",
    access: "access-1",
    refresh: "refresh-1",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    account: "seller@example.com",
    accountId: "acct_1",
    plan: "pro",
  };
  const seen: { body: Record<string, unknown> | null } = { body: null };
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    seen.body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return Response.json({ access_token: "access-2", expires_in: 3600, id_token: idToken });
  };
  try {
    const next = await refreshBundle(bundle);
    assert.equal(next.access, "access-2");
    assert.equal(next.refresh, "refresh-1");
    assert.equal(seen.body?.grant_type, "refresh_token");
    assert.equal(seen.body?.refresh_token, "refresh-1");
  } finally {
    globalThis.fetch = original;
  }
});

test("a provider outage is retryable, an invalid grant is terminal", async () => {
  const bundle: OAuthBundle = {
    kind: "oauth",
    rail: "claude-code",
    access: "access-1",
    refresh: "refresh-1",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    account: null,
    accountId: null,
    plan: null,
  };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
    await assert.rejects(refreshBundle(bundle), (error: unknown) => error instanceof OAuthError && !error.terminal);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    await assert.rejects(refreshBundle(bundle), (error: unknown) => error instanceof OAuthError && error.terminal);
  } finally {
    globalThis.fetch = original;
  }
});

test("an unreadable token answer is rejected", async () => {
  const restore = stub({ access_token: 5 });
  try {
    await assert.rejects(exchange("codex", "code", "verifier"));
  } finally {
    restore();
  }
});
