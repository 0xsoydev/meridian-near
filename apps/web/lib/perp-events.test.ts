import assert from "node:assert/strict";
import test from "node:test";
import { perpEventsIn, txHashOf } from "./perp-events.ts";

const log = (event: string, data: Record<string, string>) => `EVENT_JSON:${JSON.stringify({ standard: "meridian", version: "1.0.0", event, data })}`;

const outcome = {
  transaction: { hash: "8Hb1fXk2pQ" },
  receipts_outcome: [
    { outcome: { executor_id: "core.team.testnet", logs: [log("position_modified", { account: "a.testnet", model: "glm-5.3", size: "-10000000", margin: "600000", price: "180000", fee: "1800" })] } },
    { outcome: { executor_id: "evil.testnet", logs: [log("position_modified", { account: "a.testnet", model: "glm-5.3", size: "1", margin: "1", price: "1", fee: "1" })] } },
    { outcome: { executor_id: "core.team.testnet", logs: ["not an event", log("liquidated", { account: "b.testnet", model: "glm-5.3", liquidator: "ops.testnet", reward: "2500" })] } },
  ],
};

test("perp events are read only from core's receipts, in order", () => {
  assert.deepEqual(perpEventsIn(outcome, "core.team.testnet", 150_000n), [
    { position: 0, account: "a.testnet", model: "glm-5.3", kind: "modified", size: -10_000_000n, margin: 600_000n, price: 180_000n, fee: 1800n, reward: 0n },
    { position: 1, account: "b.testnet", model: "glm-5.3", kind: "liquidated", size: 0n, margin: 0n, price: 150_000n, fee: 0n, reward: 2500n },
  ]);
  assert.equal(txHashOf(outcome), "8Hb1fXk2pQ");
});

test("malformed outcomes and events yield nothing", () => {
  assert.deepEqual(perpEventsIn({ receipts_outcome: "nope" }, "core.team.testnet"), []);
  assert.deepEqual(perpEventsIn(null, "core.team.testnet"), []);
  assert.equal(txHashOf({}), null);
});
