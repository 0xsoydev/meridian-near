import { charge, previewFill, type FillPreview } from "./price.ts";

export type Level = { price_micro_per_mtok: string; tokens_left: string };

const smaller = (a: bigint, b: bigint) => (a < b ? a : b);

export function maxBuy(levels: ReadonlyArray<Level>, budget: bigint | null, limit: bigint | null): bigint {
  let left = budget;
  let total = 0n;
  for (const level of levels) {
    const price = BigInt(level.price_micro_per_mtok);
    const depth = BigInt(level.tokens_left);
    if (left === null) {
      total += depth;
      continue;
    }
    const take = smaller(depth, (left * 1_000_000n) / price);
    total += take;
    left -= charge(take, price);
    if (take < depth) return total;
  }
  return left !== null && limit !== null && limit > 0n ? total + (left * 1_000_000n) / limit : total;
}

export type TicketQuote = { preview: FillPreview; resting: bigint; restingValue: bigint; max: bigint };

export function quoteTicket(input: {
  side: "buy" | "sell";
  mode: "market" | "limit";
  asks: ReadonlyArray<Level>;
  bids: ReadonlyArray<Level>;
  tokens: bigint;
  limit: bigint | null;
  budget: bigint | null;
  held: bigint;
  takeBps: bigint;
}): TicketQuote {
  const limit = input.mode === "limit" ? input.limit : null;
  const levels = input.side === "buy" ? input.asks : input.bids;
  const reachable =
    input.mode === "market"
      ? levels
      : limit === null
        ? []
        : levels.filter((level) => {
            const price = BigInt(level.price_micro_per_mtok);
            return input.side === "buy" ? price <= limit : price >= limit;
          });
  const preview = previewFill(reachable, input.tokens, input.takeBps);
  const resting = limit !== null && input.tokens > preview.fillable ? input.tokens - preview.fillable : 0n;
  const restingValue = resting > 0n && limit !== null ? charge(resting, limit) : 0n;
  const max = input.side === "buy" ? maxBuy(reachable, input.budget, limit) : input.held;
  return { preview, resting, restingValue, max };
}
