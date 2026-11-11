import assert from "node:assert/strict";
import test from "node:test";
import { orderText, usdcText } from "./orders.ts";

test("orderText writes the exact message core rebuilds and checks", () => {
  const owner = "a95afc69cf9540e3d43be65c781a563a0f1073a8bc7d3a1afe0ddaa85c5cf9c2";
  const order = { method: "modify_signed", owner, model: "glm", size_delta: "-1000000", margin_delta: "250000", nonce: 3, valid_until: 1_900_000_000_000 } as const;
  assert.equal(
    orderText("core.near", order),
    "Meridian\nChange your glm position: size -1000000, margin +0.25 USDC.\nAccount: CQ6NRdpdbjR6PE5g1gETqE4AxFDFqtCWHugM2yPi67BF\nContract: core.near\nNonce: 3\nValid until: 2030-03-17T17:46:40Z",
  );
  assert.equal(usdcText(5_000_000n), "5");
  assert.equal(usdcText(10_000n), "0.01");
  assert.equal(usdcText(1n), "0.000001");
});
