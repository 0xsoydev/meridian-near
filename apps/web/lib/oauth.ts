import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.ts";
import { listings } from "./schema.ts";
import { open, seal } from "./secrets.ts";
import type { CredentialMeta, OAuthRail } from "./types.ts";

export const OAUTH_RAILS = ["claude-code", "codex"] as const;

export function isOAuthRail(id: string): id is OAuthRail {
  return id === "claude-code" || id === "codex";
}

type Client = {
  clientId: string;
  authorize: string;
  token: string;
  redirect: string;
  scope: string;
  base: string;
};

const CLIENTS: Record<OAuthRail, Client> = {
  "claude-code": {
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorize: "https://claude.com/cai/oauth/authorize",
    token: "https://platform.claude.com/v1/oauth/token",
    redirect: "https://platform.claude.com/oauth/code/callback",
    scope:
      "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload user:plugins",
    base: process.env.CLAUDE_CODE_BASE_URL || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
  },
  codex: {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorize: "https://auth.openai.com/oauth/authorize",
    token: "https://auth.openai.com/oauth/token",
    redirect: "http://localhost:1455/auth/callback",
    scope: "openid profile email offline_access",
    base: process.env.CODEX_BASE_URL || "https://chatgpt.com/backend-api/codex",
  },
};

export type OAuthBundle = {
  kind: "oauth";
  rail: OAuthRail;
  access: string;
  refresh: string | null;
  expiresAt: string;
  account: string | null;
  accountId: string | null;
  plan: string | null;
};

export type Credential = { kind: "api_key"; key: string } | OAuthBundle;

const bundleSchema = z.object({
  kind: z.literal("oauth"),
  rail: z.enum(OAUTH_RAILS),
  access: z.string().min(1),
  refresh: z.string().min(1).nullable(),
  expiresAt: z.string().min(1),
  account: z.string().nullable(),
  accountId: z.string().nullable(),
  plan: z.string().nullable(),
});

const startSchema = z.object({
  rail: z.enum(OAUTH_RAILS),
  state: z.string().min(1),
  verifier: z.string().min(1),
});

const tokenSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).nullish(),
    expires_in: z.number().positive().nullish(),
    id_token: z.string().nullish(),
    account: z.object({ email_address: z.string().nullish() }).passthrough().nullish(),
    organization: z.object({ name: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

type TokenResponse = z.infer<typeof tokenSchema>;

export function parseCredential(plain: string): Credential {
  if (!plain.startsWith("{")) return { kind: "api_key", key: plain };
  let json: unknown;
  try {
    json = JSON.parse(plain);
  } catch {
    return { kind: "api_key", key: plain };
  }
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) throw new Error("unreadable stored credential");
  return parsed.data;
}

export function readCredential(sealed: string): Credential {
  return parseCredential(open(sealed));
}

export function sealCredential(credential: Credential): string {
  return credential.kind === "api_key" ? seal(credential.key) : seal(JSON.stringify(credential));
}

export function credentialMeta(bundle: OAuthBundle): CredentialMeta {
  return { account: bundle.account, plan: bundle.plan };
}

export function maskAccount(account: string | null): string | null {
  if (!account) return null;
  const at = account.indexOf("@");
  return at > 0 ? `${account[0]}***${account.slice(at)}` : `${account[0]}***`;
}

export type Probe = { ok: true } | { ok: false; status: number; message: string };

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function cookieName(rail: OAuthRail): string {
  return `oauth_${rail.replace("-", "_")}`;
}

export function startOAuth(rail: OAuthRail): { url: string; sealed: string } {
  const { verifier, challenge } = pkce();
  const state = randomBytes(24).toString("base64url");
  const client = CLIENTS[rail];
  const params = new URLSearchParams({
    client_id: client.clientId,
    response_type: "code",
    redirect_uri: client.redirect,
    scope: client.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (rail === "claude-code") {
    params.set("code", "true");
  } else {
    params.set("id_token_add_organizations", "true");
    params.set("codex_cli_simplified_flow", "true");
  }
  return { url: `${client.authorize}?${params.toString()}`, sealed: seal(JSON.stringify({ rail, state, verifier })) };
}

export function readStart(sealed: string): z.infer<typeof startSchema> | null {
  try {
    const parsed = startSchema.safeParse(JSON.parse(open(sealed)) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readCode(rail: OAuthRail, pasted: string): { code: string; state: string } | null {
  const value = pasted.trim();
  if (value.includes("://")) {
    try {
      const url = new URL(value);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      return code && state ? { code, state } : null;
    } catch {
      return null;
    }
  }
  if (rail === "claude-code") {
    const [code, state] = value.split("#");
    return code && state ? { code, state } : null;
  }
  return null;
}

function jwtClaims(idToken: string | null | undefined): Record<string, unknown> {
  const part = idToken?.split(".")[1];
  if (!part) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toBundle(rail: OAuthRail, token: TokenResponse): OAuthBundle {
  const claims = jwtClaims(token.id_token);
  const auth = claims["https://api.openai.com/auth"];
  const authClaims = auth !== null && typeof auth === "object" ? (auth as Record<string, unknown>) : {};
  const account =
    rail === "claude-code"
      ? (token.account?.email_address ?? token.organization?.name ?? null)
      : typeof claims.email === "string"
        ? claims.email
        : null;
  const accountId =
    rail === "codex" && typeof authClaims.chatgpt_account_id === "string" ? authClaims.chatgpt_account_id : null;
  const plan =
    rail === "codex" && typeof authClaims.chatgpt_plan_type === "string" ? authClaims.chatgpt_plan_type : null;
  return {
    kind: "oauth",
    rail,
    access: token.access_token,
    refresh: token.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
    account,
    accountId,
    plan,
  };
}

export class OAuthError extends Error {
  readonly terminal: boolean;

  constructor(message: string, terminal: boolean) {
    super(message);
    this.terminal = terminal;
  }
}

async function tokenRequest(client: Client, body: Record<string, unknown>): Promise<TokenResponse> {
  const response = await fetch(client.token, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const terminal = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    let reason = "";
    if (payload !== null && typeof payload === "object") {
      const error = (payload as Record<string, unknown>).error;
      if (typeof error === "string") reason = error;
      else if (error !== null && typeof error === "object") {
        const shaped = error as Record<string, unknown>;
        if (typeof shaped.type === "string") reason = shaped.type;
        else if (typeof shaped.message === "string") reason = shaped.message.slice(0, 120);
      }
    }
    throw new OAuthError(`the token endpoint answered ${response.status}${reason ? ` (${reason})` : ""}`, terminal);
  }
  const parsed = tokenSchema.safeParse(payload);
  if (!parsed.success) throw new OAuthError("the token endpoint sent an unreadable answer", false);
  return parsed.data;
}

export async function exchange(rail: OAuthRail, code: string, verifier: string, state?: string): Promise<OAuthBundle> {
  const client = CLIENTS[rail];
  const token = await tokenRequest(client, {
    grant_type: "authorization_code",
    code,
    redirect_uri: client.redirect,
    client_id: client.clientId,
    code_verifier: verifier,
    ...(rail === "claude-code" && state ? { state } : {}),
  });
  const bundle = toBundle(rail, token);
  if (!bundle.refresh) throw new Error("the grant has no refresh token");
  return bundle;
}

export function needsRefresh(bundle: OAuthBundle, skewMs = 60_000): boolean {
  return Date.parse(bundle.expiresAt) - skewMs <= Date.now();
}

export async function refreshBundle(bundle: OAuthBundle): Promise<OAuthBundle> {
  if (!bundle.refresh) throw new Error(`${bundle.rail} has no refresh token`);
  const client = CLIENTS[bundle.rail];
  const token = await tokenRequest(client, {
    grant_type: "refresh_token",
    refresh_token: bundle.refresh,
    client_id: client.clientId,
    ...(bundle.rail === "codex" ? { scope: "openid profile email" } : {}),
  });
  const next = toBundle(bundle.rail, token);
  return {
    ...next,
    refresh: next.refresh ?? bundle.refresh,
    account: next.account ?? bundle.account,
    accountId: next.accountId ?? bundle.accountId,
    plan: next.plan ?? bundle.plan,
  };
}

export function inferenceUrl(bundle: OAuthBundle): string {
  return bundle.rail === "claude-code"
    ? `${CLIENTS["claude-code"].base}/messages`
    : `${CLIENTS.codex.base}/responses`;
}

export const CLAUDE_PREAMBLE = "You are Claude Code, Anthropic's official CLI for Claude.";

export function inferenceHeaders(bundle: OAuthBundle): Record<string, string> {
  if (bundle.rail === "claude-code") {
    return {
      authorization: `Bearer ${bundle.access}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "user-agent": "claude-cli/2.1.0 (external, cli)",
    };
  }
  return {
    authorization: `Bearer ${bundle.access}`,
    "openai-beta": "responses=experimental",
    originator: "codex_cli_rs",
    "user-agent": "codex_cli_rs/0.50.0",
    session_id: randomUUID(),
    ...(bundle.accountId ? { "chatgpt-account-id": bundle.accountId } : {}),
  };
}

export async function probeOAuth(bundle: OAuthBundle, model: string): Promise<Probe> {
  const payload =
    bundle.rail === "claude-code"
      ? { model, system: CLAUDE_PREAMBLE, messages: [{ role: "user", content: "." }], max_tokens: 1 }
      : {
          model,
          input: [{ role: "user", content: [{ type: "input_text", text: "." }] }],
          max_output_tokens: 16,
          stream: true,
          store: false,
        };
  try {
    const response = await fetch(inferenceUrl(bundle), {
      method: "POST",
      headers: { "content-type": "application/json", ...inferenceHeaders(bundle) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const status = response.status;
    const text = await response.text().catch(() => "");
    if (!response.ok) return { ok: false, status, message: `${bundle.rail} answered ${status}` };
    if (bundle.rail === "codex" && (text.includes('"response.failed"') || text.includes('"type":"error"'))) {
      return { ok: false, status: 502, message: "the account's model call failed" };
    }
    if (bundle.rail === "claude-code") {
      try {
        const shaped = z
          .object({ type: z.string().optional() })
          .passthrough()
          .safeParse(JSON.parse(text));
        if (shaped.success && shaped.data.type === "error") {
          return { ok: false, status: 502, message: "the account's model call failed" };
        }
      } catch {
        return { ok: false, status: 502, message: "the account sent an unreadable check" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 0, message: "the account check failed" };
  }
}

const inflight = new Map<string, Promise<string>>();

export function refreshListing(listingId: string, sealed: string, force = false): Promise<string> {
  const key = `${listingId}:${sealed}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = refreshListingOnce(listingId, sealed, force).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

async function refreshListingOnce(listingId: string, sealed: string, force = false): Promise<string> {
  const current = readCredential(sealed);
  if (current.kind !== "oauth" || (!force && !needsRefresh(current))) return sealed;

  let next: OAuthBundle;
  try {
    next = await refreshBundle(current);
  } catch (error) {
    const [row] = await db()
      .select({ sealed: listings.credentialCiphertext })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (row && row.sealed !== sealed) return row.sealed;
    throw error;
  }

  const sealedNext = sealCredential(next);
  const [updated] = await db()
    .update(listings)
    .set({ credentialCiphertext: sealedNext, credentialMeta: credentialMeta(next) })
    .where(and(eq(listings.id, listingId), eq(listings.credentialCiphertext, sealed)))
    .returning({ sealed: listings.credentialCiphertext });
  if (updated) return updated.sealed;

  const [row] = await db()
    .select({ sealed: listings.credentialCiphertext })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  return row?.sealed ?? sealedNext;
}
