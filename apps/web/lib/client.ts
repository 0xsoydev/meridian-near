import { z } from "zod";
import type { BlockedAction, IntentQuote, IntentToken, RailId } from "./types";

export const KEY_STORAGE = "meridian_key";

export const ETH_ACCOUNT = /^0x[0-9a-f]{40}$/;

export function shortAccount(id: string): string {
  if (ETH_ACCOUNT.test(id)) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id) ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export const RAIL_NAMES: Record<RailId, string> = {
  "near-ai": "NEAR AI",
  openrouter: "OpenRouter",
  commandcode: "Command Code",
  zen: "OpenCode Zen",
  "opencode-go": "OpenCode Go",
  anthropic: "Anthropic",
  openai: "OpenAI",
  stub: "Stub rail",
};

export function railName(rail: string): string {
  return rail in RAIL_NAMES ? RAIL_NAMES[rail as RailId] : rail;
}

const actionSchema = z.object({
  url: z.string(),
  code: z.string(),
  qr: z.string(),
  near_cli: z.string(),
  poll: z.string(),
});

const errorSchema = z.object({
  error: z.object({ message: z.string() }),
  action: actionSchema.optional(),
});

export function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; action: BlockedAction | null };

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init: Omit<RequestInit, "headers"> & { key?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const { key, headers = {}, ...rest } = init;
  try {
    const response = await fetch(path, {
      ...rest,
      cache: "no-store",
      headers: {
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...headers,
      },
    });
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) {
      const read = schema.safeParse(body);
      return read.success
        ? { ok: true, data: read.data }
        : { ok: false, status: response.status, message: "The server's answer didn't match what this page expects. Reload and retry.", action: null };
    }
    const parsed = errorSchema.safeParse(body);
    return {
      ok: false,
      status: response.status,
      message: parsed.success ? sentence(parsed.data.error.message) : `The request failed with status ${response.status}.`,
      action: parsed.success ? (parsed.data.action ?? null) : null,
    };
  } catch {
    return { ok: false, status: 0, message: "The network request failed. Check your connection and retry.", action: null };
  }
}

export function explorer(kind: "txns" | "address", id: string): string {
  const host = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io";
  return `https://${host}/${kind}/${id}`;
}

export function ago(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 5)}…${key.slice(-4)}` : key;
}

export function usd(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const step = abs >= 1_000_000n ? 10_000n : 100n;
  const rounded = ((abs + step / 2n) / step) * step;
  const whole = (rounded / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (rounded % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "-" : ""}$${whole}.${fraction}`;
}

export function fundingPercent(perHour: bigint): string {
  const negative = perHour < 0n;
  const steps = (negative ? -perHour : perHour) / 1_000_000_000_000n;
  return `${negative ? "-" : "+"}${steps / 10_000n}.${(steps % 10_000n).toString().padStart(4, "0")}%`;
}

export function percent(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "0.00%";
  const basis = (numerator * 10_000n) / denominator;
  const sign = basis < 0n ? "-" : "";
  const abs = basis < 0n ? -basis : basis;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
}

export const CHAINS: Record<string, { name: string; evm: number | null }> = {
  base: { name: "Base", evm: 8453 },
  eth: { name: "Ethereum", evm: 1 },
  arb: { name: "Arbitrum", evm: 42161 },
  op: { name: "Optimism", evm: 10 },
  pol: { name: "Polygon", evm: 137 },
  bsc: { name: "BNB Chain", evm: 56 },
  avax: { name: "Avalanche", evm: 43114 },
  sol: { name: "Solana", evm: null },
  btc: { name: "Bitcoin", evm: null },
  tron: { name: "TRON", evm: null },
  ton: { name: "TON", evm: null },
  sui: { name: "Sui", evm: null },
  aptos: { name: "Aptos", evm: null },
  stellar: { name: "Stellar", evm: null },
  xrp: { name: "XRP Ledger", evm: null },
  gnosis: { name: "Gnosis", evm: 100 },
  bera: { name: "Berachain", evm: 80094 },
  scroll: { name: "Scroll", evm: 534352 },
  monad: { name: "Monad", evm: 143 },
  xlayer: { name: "X Layer", evm: 196 },
  plasma: { name: "Plasma", evm: 9745 },
  hood: { name: "Robinhood Chain", evm: 4663 },
  doge: { name: "Dogecoin", evm: null },
  ltc: { name: "Litecoin", evm: null },
  bch: { name: "Bitcoin Cash", evm: null },
  zec: { name: "Zcash", evm: null },
  dash: { name: "Dash", evm: null },
  cardano: { name: "Cardano", evm: null },
  starknet: { name: "Starknet", evm: null },
};

export function chainName(code: string): string {
  return CHAINS[code]?.name ?? code.toUpperCase();
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type EvmTransfer = { from: string; to: string; value: string } | { from: string; to: string; data: string };

export function evmTransfer(from: string, depositAddress: string, amount: bigint, contract: string | null): EvmTransfer {
  if (!EVM_ADDRESS.test(depositAddress) || (contract !== null && !EVM_ADDRESS.test(contract))) throw new Error("not an EVM address");
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("amount out of range");
  if (contract === null) return { from, to: depositAddress, value: `0x${amount.toString(16)}` };
  const word = (hex: string) => hex.toLowerCase().padStart(64, "0");
  return { from, to: contract, data: `0xa9059cbb${word(depositAddress.slice(2))}${word(amount.toString(16))}` };
}

export function paymentUri(token: IntentToken, quote: IntentQuote): string | null {
  const address = quote.depositAddress;
  if (!address || quote.depositMemo) return null;
  const chain = CHAINS[token.blockchain]?.evm;
  if (chain) {
    return token.contractAddress
      ? `ethereum:${token.contractAddress}@${chain}/transfer?address=${address}&uint256=${quote.amountIn}`
      : `ethereum:${address}@${chain}?value=${quote.amountIn}`;
  }
  if (token.blockchain === "sol") {
    return `solana:${address}?amount=${quote.amountInFormatted}${token.contractAddress ? `&spl-token=${token.contractAddress}` : ""}`;
  }
  if (token.blockchain === "btc") return `bitcoin:${address}?amount=${quote.amountInFormatted}`;
  return null;
}
