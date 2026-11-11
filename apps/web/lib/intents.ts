import { z } from "zod";
import { coreId, nearNetwork, usdcId } from "./near.ts";
import type { IntentQuote, IntentStatus, IntentToken } from "./types";

const CACHE_MS = 300_000;
const MAINNET_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const STAND_IN = "intents.near";

const tokenSchema = z.object({
  assetId: z.string(),
  symbol: z.string(),
  blockchain: z.string(),
  decimals: z.number().int().nonnegative(),
  contractAddress: z.string().optional(),
});

const tokensSchema = z.array(tokenSchema);

const quoteSchema = z.object({
  quote: z.object({
    depositAddress: z.string().optional(),
    depositMemo: z.string().optional(),
    amountIn: z.string(),
    amountInFormatted: z.string(),
    amountOut: z.string(),
    amountOutFormatted: z.string(),
    deadline: z.string().optional(),
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

const errorSchema = z.object({ message: z.string() });

function base(): string {
  return process.env.ONECLICK_BASE_URL ?? "https://1click.chaindefuser.com/v0";
}

function headers(): Record<string, string> {
  const key = process.env.ONECLICK_API_KEY;
  return { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) };
}

async function refused(response: Response, what: string): Promise<Error> {
  const body = errorSchema.safeParse(await response.json().catch(() => null));
  return new Error(body.success ? body.data.message : `1Click ${what} answered ${response.status}`);
}

let cached: { at: number; tokens: IntentToken[] } | null = null;

export async function tokens(): Promise<IntentToken[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.tokens;
  const response = await fetch(`${base()}/tokens`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw await refused(response, "tokens");
  const list = tokensSchema
    .parse(await response.json())
    .filter((token) => !token.symbol.includes("DEPRECATED"))
    .map((token) => ({
      assetId: token.assetId,
      symbol: token.symbol,
      blockchain: token.blockchain,
      decimals: token.decimals,
      contractAddress: token.contractAddress ?? null,
    }));
  const unique = [...new Map(list.map((token) => [token.assetId, token])).values()];
  cached = { at: Date.now(), tokens: unique };
  return unique;
}

export type QuoteInput =
  | { kind: "fund"; owner: string; originAsset: string; amount: bigint; refundTo: string | null; dry: boolean }
  | { kind: "withdraw"; account: string; destinationAsset: string; amount: bigint; recipient: string; dry: boolean };

export async function quote(input: QuoteInput): Promise<IntentQuote> {
  const live = nearNetwork() === "mainnet";
  const dry = input.dry || !live;
  if (input.kind === "fund" && input.refundTo === null && !dry) throw new Error("a refund address is required");
  const nearUsdc = `nep141:${live ? usdcId() : MAINNET_USDC}`;
  const origin = input.kind === "fund" ? input.originAsset : nearUsdc;
  const chain = (await tokens()).find((token) => token.assetId === origin)?.blockchain;
  const body: Record<string, unknown> = {
    dry,
    swapType: input.kind === "fund" ? "EXACT_OUTPUT" : "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: origin,
    depositType: "ORIGIN_CHAIN",
    depositMode: chain === "stellar" ? "MEMO" : "SIMPLE",
    destinationAsset: input.kind === "fund" ? nearUsdc : input.destinationAsset,
    amount: input.amount.toString(),
    refundTo: input.kind === "fund" ? (input.refundTo ?? STAND_IN) : live ? input.account : STAND_IN,
    refundType: input.kind === "fund" && input.refundTo === null ? "INTENTS" : "ORIGIN_CHAIN",
    recipient: input.kind === "fund" ? (live ? coreId() : STAND_IN) : input.recipient,
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
  if (!response.ok) throw await refused(response, "quote");
  const { quote: found } = quoteSchema.parse(await response.json());
  return {
    depositAddress: found.depositAddress ?? null,
    depositMemo: found.depositMemo ?? null,
    amountIn: found.amountIn,
    amountInFormatted: found.amountInFormatted,
    amountOut: found.amountOut,
    amountOutFormatted: found.amountOutFormatted,
    deadline: found.deadline ?? null,
  };
}

export async function quoteStatus(depositAddress: string, memo: string | null): Promise<IntentStatus> {
  const query = new URLSearchParams({ depositAddress, ...(memo ? { depositMemo: memo } : {}) });
  const response = await fetch(`${base()}/status?${query}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw await refused(response, "status");
  return statusSchema.parse(await response.json()).status;
}

export async function submitDeposit(txHash: string, depositAddress: string, memo: string | null): Promise<void> {
  const response = await fetch(`${base()}/deposit/submit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ txHash, depositAddress, ...(memo ? { memo } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await refused(response, "deposit submit");
}
