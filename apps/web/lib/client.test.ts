import assert from "node:assert/strict";
import test from "node:test";
import { ago, fundingPercent, percent, sentence, usd } from "./client.ts";

test("sentence turns router errors into sentences", () => {
  assert.equal(sentence("credential rejected by the rail"), "Credential rejected by the rail.");
  assert.equal(sentence("no asks for glm-5.3"), "No asks for glm-5.3.");
  assert.equal(sentence("Already fine."), "Already fine.");
});

test("usd rounds to cents from a dollar up and keeps four decimals below it", () => {
  assert.equal(usd(3_473_139n), "$3.47");
  assert.equal(usd(2_665_000n), "$2.67");
  assert.equal(usd(811_498n), "$0.8115");
  assert.equal(usd(180_000n), "$0.18");
  assert.equal(usd(0n), "$0.00");
  assert.equal(usd(1_234_567_891n), "$1,234.57");
  assert.equal(usd(-402_425n), "-$0.4024");
});

test("percent keeps two decimals and the sign", () => {
  assert.equal(percent(10_000n, 180_000n), "5.55%");
  assert.equal(percent(-222_425n, 402_425n), "-55.27%");
  assert.equal(percent(1n, 0n), "0.00%");
});

test("fundingPercent reads the contract's per-hour rate, 1e18 to one", () => {
  assert.equal(fundingPercent(277_777_777_778n * 3600n), "+0.1000%");
  assert.equal(fundingPercent(-138_888_888_889n * 3600n), "-0.0500%");
  assert.equal(fundingPercent(0n), "+0.0000%");
});

test("ago switches units at 90 seconds and 90 minutes", () => {
  assert.equal(ago(42), "42s ago");
  assert.equal(ago(272), "5 min ago");
  assert.equal(ago(7200), "2 h ago");
});
