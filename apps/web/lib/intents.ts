import { z } from "zod";
import { coreId, usdcId } from "./near.ts";
import type { IntentQuote, IntentStatus, IntentToken } from "./types";

const CACHE_MS = 300_000;

const tokenSchema = z.object({
  assetId: z.string(),
  symbol: z.string(),
  blockchain: z.string(),
});

const tokensSchema = z.array(tokenSchema);

const quoteSchema = z.object({
  quote: z.object({
    depositAddress: z.string(),
    amountIn: z.string(),
    amountOut: z.string(),
    deadline: z.string(),
  }),
});

const statusSchema = z.object({
  status: z.enum([
    "PENDING_DEPOSIT",
    "PROCESSING",
    "SUCCESS",
    "INCOMPLETE_DEPOSIT",
    "REFUNDED",
    "FAILED",
  ]),
});

function base(): string {
  return process.env.ONECLICK_BASE_URL ?? "https://1click.chaindefuser.com/v0";
}

function headers(): Record<string, string> {
  const key = process.env.ONECLICK_API_KEY;
  return { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) };
}

let cached: { at: number; tokens: IntentToken[] } | null = null;

export async function tokens(): Promise<IntentToken[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.tokens;
  const response = await fetch(`${base()}/tokens`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`1Click tokens answered ${response.status}`);
  const list = tokensSchema.parse(await response.json()).filter((token) => token.symbol === "USDC");
  const unique = [...new Map(list.map((token) => [token.assetId, token])).values()];
  cached = { at: Date.now(), tokens: unique };
  return unique;
}

export type QuoteInput =
  | { kind: "fund"; owner: string; originAsset: string; amount: bigint; refundTo: string; dry: boolean }
  | { kind: "withdraw"; account: string; destinationAsset: string; amount: bigint; recipient: string; dry: boolean };

export async function quote(input: QuoteInput): Promise<IntentQuote> {
  const nearUsdc = `nep141:${usdcId()}`;
  const body: Record<string, unknown> = {
    dry: input.dry,
    swapType: input.kind === "fund" ? "EXACT_OUTPUT" : "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: input.kind === "fund" ? input.originAsset : nearUsdc,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: input.kind === "fund" ? nearUsdc : input.destinationAsset,
    amount: input.amount.toString(),
    refundTo: input.kind === "fund" ? input.refundTo : input.account,
    refundType: "ORIGIN_CHAIN",
    recipient: input.kind === "fund" ? coreId() : input.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
  };
  if (input.kind === "fund") {
    body.customRecipientMsg = JSON.stringify({ fund: { to: input.owner } });
  }
  const response = await fetch(`${base()}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`1Click quote answered ${response.status}`);
  return quoteSchema.parse(await response.json()).quote;
}

export async function quoteStatus(depositAddress: string): Promise<IntentStatus> {
  const response = await fetch(`${base()}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
    headers: headers(),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`1Click status answered ${response.status}`);
  return statusSchema.parse(await response.json()).status;
}
