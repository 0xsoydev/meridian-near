import assert from "node:assert/strict";
import test from "node:test";
import { maxBuy, quoteTicket } from "./ticket.ts";

const asks = [
  { price_micro_per_mtok: "180000", tokens_left: "2000000" },
  { price_micro_per_mtok: "200000", tokens_left: "5000000" },
];
const bids = [
  { price_micro_per_mtok: "170000", tokens_left: "500000" },
  { price_micro_per_mtok: "160000", tokens_left: "1000000" },
];

test("maxBuy stops where the budget runs out, or at the depth with no budget", () => {
  assert.equal(maxBuy(asks, 360_000n, null), 2_000_000n);
  assert.equal(maxBuy(asks, 560_000n, null), 3_000_000n);
  assert.equal(maxBuy(asks, null, null), 7_000_000n);
  assert.equal(maxBuy(asks, 0n, null), 0n);
});

test("maxBuy counts the leftover budget as a resting bid at the limit", () => {
  assert.equal(maxBuy(asks.slice(0, 1), 560_000n, 100_000n), 2_000_000n + 2_000_000n);
});

test("a market buy previews the fill and rests nothing", () => {
  const quote = quoteTicket({ side: "buy", mode: "market", asks, bids, tokens: 3_000_000n, limit: null, budget: 10_000_000n, held: 0n, takeBps: 1000n });
  assert.equal(quote.preview.fillable, 3_000_000n);
  assert.equal(quote.preview.cost, 560_000n);
  assert.equal(quote.resting, 0n);
  assert.equal(quote.restingValue, 0n);
});

test("a limit buy fills up to the limit and rests the rest at its exact cost", () => {
  const quote = quoteTicket({ side: "buy", mode: "limit", asks, bids, tokens: 3_000_000n, limit: 190_000n, budget: 10_000_000n, held: 0n, takeBps: 1000n });
  assert.equal(quote.preview.fillable, 2_000_000n);
  assert.equal(quote.resting, 1_000_000n);
  assert.equal(quote.restingValue, 190_000n);
});

test("a sell walks the bids from the best and pays out after the fee", () => {
  const market = quoteTicket({ side: "sell", mode: "market", asks, bids, tokens: 1_000_000n, limit: null, budget: null, held: 1_500_000n, takeBps: 1000n });
  assert.equal(market.preview.cost, 85_000n + 80_000n);
  assert.equal(market.preview.net, 148_500n);
  assert.equal(market.max, 1_500_000n);
  const limited = quoteTicket({ side: "sell", mode: "limit", asks, bids, tokens: 1_000_000n, limit: 165_000n, budget: null, held: 1_500_000n, takeBps: 1000n });
  assert.equal(limited.preview.fillable, 500_000n);
  assert.equal(limited.resting, 500_000n);
});
