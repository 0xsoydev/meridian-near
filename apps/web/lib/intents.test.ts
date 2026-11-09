import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

const bodies: unknown[] = [];

async function stub(): Promise<{ url: string; close: () => void }> {
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const url = request.url ?? "";
      if (url.startsWith("/v0/tokens")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify([
            { assetId: "nep141:near-usdc", symbol: "USDC", blockchain: "near" },
            { assetId: "nep141:base-usdc", symbol: "USDC", blockchain: "base" },
            { assetId: "nep141:btc", symbol: "BTC", blockchain: "bitcoin" },
          ]),
        );
        return;
      }
      if (url.startsWith("/v0/quote")) {
        bodies.push(JSON.parse(raw));
        response.writeHead(201, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            quote: {
              depositAddress: "deposit-1",
              amountIn: "10000",
              amountOut: "20000",
              deadline: "2030-01-01T00:00:00.000Z",
            },
          }),
        );
        return;
      }
      if (url.startsWith("/v0/status")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "SUCCESS" }));
        return;
      }
      response.writeHead(404).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/v0`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

test("quotes carry the fund message and the right assets", async () => {
  const server = await stub();
  process.env.ONECLICK_BASE_URL = server.url;
  process.env.NEAR_USDC_ID = "usdc-near";
  process.env.NEAR_CORE_ID = "core.testnet";
  try {
    const { tokens, quote, quoteStatus } = await import("./intents.ts");
    const list = await tokens();
    assert.equal(list.length, 2);
    assert.equal(list[1]?.assetId, "nep141:base-usdc");

    const funded = await quote({
      kind: "fund",
      owner: "alice.testnet",
      originAsset: "nep141:base-usdc",
      amount: 10_000n,
      refundTo: "0xabc",
      dry: true,
    });
    assert.equal(funded.depositAddress, "deposit-1");
    const fundBody = bodies.at(-1) as Record<string, unknown>;
    assert.equal(fundBody.originAsset, "nep141:base-usdc");
    assert.equal(fundBody.destinationAsset, "nep141:usdc-near");
    assert.equal(fundBody.recipient, "core.testnet");
    assert.equal(fundBody.dry, true);
    assert.deepEqual(JSON.parse(String(fundBody.customRecipientMsg)), { fund: { to: "alice.testnet" } });

    const withdrawn = await quote({
      kind: "withdraw",
      account: "alice.testnet",
      destinationAsset: "nep141:base-usdc",
      amount: 5_000n,
      recipient: "0xdef",
      dry: true,
    });
    assert.equal(withdrawn.amountOut, "20000");
    const withdrawBody = bodies.at(-1) as Record<string, unknown>;
    assert.equal(withdrawBody.originAsset, "nep141:usdc-near");
    assert.equal(withdrawBody.destinationAsset, "nep141:base-usdc");
    assert.equal(withdrawBody.recipient, "0xdef");
    assert.equal(withdrawBody.refundTo, "alice.testnet");
    assert.equal(withdrawBody.customRecipientMsg, undefined);

    assert.equal(await quoteStatus("deposit-1"), "SUCCESS");
  } finally {
    server.close();
  }
});
