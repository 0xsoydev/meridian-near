import assert from "node:assert/strict";
import test from "node:test";
import { historyRows, liquidatable, liquidationPrice, maxOpen, notional, openMargin, orderPlan, payoffLadder, positionAfter, tradeFee } from "./perp.ts";
import type { PerpEvent } from "./types.ts";

test("history rows label each event by the size it left behind", () => {
  const event = (size: string, kind: PerpEvent["kind"] = "modified", model = "glm-5.3"): PerpEvent => ({
    tx_hash: `t${size}${kind}`,
    at: "2026-11-10T00:00:00.000Z",
    model,
    kind,
    size,
    margin_usd_micro: "0",
    price_micro_per_mtok: "180000",
    fee_usd_micro: "0",
    reward_usd_micro: "0",
  });
  const newestFirst = [
    event("0", "liquidated"),
    event("-5000000"),
    event("-5000000"),
    event("5000000"),
    event("15000000"),
    event("2000000", "modified", "deepseek-v4.1-flash"),
    event("10000000"),
  ];
  assert.deepEqual(
    historyRows(newestFirst).map((row) => [row.action, row.change]),
    [
      ["liquidated", 5_000_000n],
      ["margin", 0n],
      ["flipped", -10_000_000n],
      ["reduced", -10_000_000n],
      ["increased", 5_000_000n],
      ["opened", 2_000_000n],
      ["opened", 10_000_000n],
    ],
  );
  assert.equal(historyRows([event("0")])[0]?.action, "margin");
});

test("the payoff ladder prices PnL and equity at each index move and flags liquidation", () => {
  const long = { size: 10_000_000n, margin: 600_000n, entryPrice: 180_000n, fundingOwed: 0n };
  const [down50, down20, up10] = payoffLadder(long, 180_000n, [-5000n, -2000n, 1000n]);
  assert.deepEqual(up10, { move: 1000n, price: 198_000n, pnl: 180_000n, equity: 780_000n, liquidated: false });
  assert.deepEqual(down20, { move: -2000n, price: 144_000n, pnl: -360_000n, equity: 240_000n, liquidated: false });
  assert.equal(down50?.liquidated, true);
  const short = payoffLadder({ ...long, size: -10_000_000n }, 180_000n, [1000n]);
  assert.equal(short[0]?.pnl, -180_000n);
});

test("the position an order leaves matches what PerpMarket books", () => {
  const price = 150_000n;
  const fee = (size: bigint) => tradeFee(size, price);
  const held = { size: 10_000_000n, margin: 400_000n, entryPrice: 100_000n, fundingOwed: 1_000n };
  const open = openMargin(5_000_000n, price, 5n);
  assert.deepEqual(positionAfter(null, [{ sizeDelta: 5_000_000n, margin: open }], price), {
    size: 5_000_000n,
    margin: open - fee(5_000_000n),
    entryPrice: price,
    fundingOwed: 0n,
  });
  assert.deepEqual(positionAfter(held, [{ sizeDelta: 5_000_000n, margin: open }], price), {
    size: 15_000_000n,
    margin: 400_000n - 1_000n - fee(5_000_000n) + open,
    entryPrice: (10_000_000n * 100_000n + 5_000_000n * price) / 15_000_000n,
    fundingOwed: 0n,
  });
  assert.deepEqual(positionAfter(held, [{ sizeDelta: -4_000_000n, margin: 0n }], price), {
    size: 6_000_000n,
    margin: 400_000n - 1_000n - fee(4_000_000n) + 200_000n,
    entryPrice: 100_000n,
    fundingOwed: 0n,
  });
  const rest = openMargin(-4_000_000n, price, 5n);
  assert.deepEqual(
    positionAfter(held, [{ sizeDelta: -10_000_000n, margin: 0n }, { sizeDelta: -4_000_000n, margin: rest }], price),
    { size: -4_000_000n, margin: rest - fee(4_000_000n), entryPrice: price, fundingOwed: 0n },
  );
  assert.equal(positionAfter(held, [{ sizeDelta: -10_000_000n, margin: 0n }], price), null);
});

test("an order opens, adds, reduces and closes in one leg, and flips as close then open", () => {
  const price = 150_000n;
  const legs = (current: bigint, delta: bigint) =>
    orderPlan(current, delta, price, 5n).map((leg) => [leg.sizeDelta, leg.margin]);
  assert.deepEqual(legs(0n, -3n), [[-3n, openMargin(-3n, price, 5n)]]);
  assert.deepEqual(legs(10n, 5n), [[5n, openMargin(5n, price, 5n)]]);
  assert.deepEqual(legs(10n, -4n), [[-4n, 0n]]);
  assert.deepEqual(legs(10n, -10n), [[-10n, 0n]]);
  assert.deepEqual(legs(10n, -14n), [[-10n, 0n], [-4n, openMargin(-4n, price, 5n)]]);
  assert.deepEqual(legs(-6n, 8n), [[6n, 0n], [2n, openMargin(2n, price, 5n)]]);
  assert.deepEqual(legs(7n, 0n), []);
});


test("notional matches PerpMarket's abs(size) · price / 1e6", () => {
  assert.equal(notional(1_000_000n, 3_400_000n), 3_400_000n);
  assert.equal(notional(-2_000_000n, 1_500_000n), 3_000_000n);
});

test("openMargin clears PerpMarket's initial margin after the fee", () => {
  assert.equal(openMargin(10_000_000n, 153_000n, 5n), 322_831n);
  assert.ok((322_831n - 1_530n) * 5n >= notional(10_000_000n, 153_000n));
  assert.equal(openMargin(-10_000_000n, 153_000n, 5n), 322_831n);
  assert.equal(openMargin(1n, 1n, 5n), 2n);
});

test("maxOpen is the largest size whose opening margin the wallet covers", () => {
  for (const [wallet, price, leverage] of [
    [2_661_641n, 180_000n, 5n],
    [10_000_000n, 153_000n, 1n],
    [500_000n, 3_400_000n, 3n],
  ] as const) {
    const size = maxOpen(wallet, price, leverage);
    assert.ok(size > 0n);
    assert.ok(openMargin(size, price, leverage) <= wallet);
    assert.ok(openMargin(size + size / 500n + 1n, price, leverage) > wallet);
  }
  assert.equal(maxOpen(2n, 180_000n, 5n), 0n);
  assert.equal(maxOpen(1_000_000n, 0n, 5n), 0n);
});

test("long liquidation price matches test_LiquidationBoundaryAndReward", () => {
  const p = { size: 100_000_000n, margin: 100_500_000n, entryPrice: 5_000_000n, fundingOwed: 0n };
  assert.equal(liquidationPrice(p), 4_205_263n);
  assert.equal(liquidatable(p, 4_205_263n), true);
  assert.equal(liquidatable(p, 4_205_264n), false);
});

test("short liquidation price matches test_ShortLiquidationBoundary", () => {
  const p = { size: -100_000_000n, margin: 100_500_000n, entryPrice: 5_000_000n, fundingOwed: 0n };
  assert.equal(liquidationPrice(p), 5_719_048n);
  assert.equal(liquidatable(p, 5_719_047n), false);
});

test("funding owed moves the long liquidation price up", () => {
  const p = { size: 100_000_000n, margin: 100_500_000n, entryPrice: 5_000_000n, fundingOwed: 10_000_000n };
  assert.ok(liquidationPrice(p) > 4_205_263n);
});

test("unleveraged long is never liquidated and empty position has no price", () => {
  assert.equal(liquidationPrice({ size: 100_000_000n, margin: 600_000_000n, entryPrice: 5_000_000n, fundingOwed: 0n }), 0n);
  assert.equal(liquidationPrice({ size: 0n, margin: 0n, entryPrice: 0n, fundingOwed: 0n }), 0n);
});

test("a short already underwater at every price reads as liquidatable, not as never", () => {
  const p = { size: -100_000_000n, margin: 10_000_000n, entryPrice: 5_000_000n, fundingOwed: 600_000_000n };
  const price = liquidationPrice(p);
  assert.equal(price, 1n);
  assert.equal(liquidatable(p, 1n), true);
});
