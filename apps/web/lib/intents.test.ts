import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

const bodies: Record<string, unknown>[] = [];
const submits: unknown[] = [];

function record(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  assert.ok(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed));
  return Object.fromEntries(Object.entries(parsed));
}

async function stub(): Promise<{ url: string; close: () => void }> {
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const url = request.url ?? "";
      response.writeHead(200, { "content-type": "application/json" });
      if (url.startsWith("/v0/tokens")) {
        response.end(
          JSON.stringify([
            { assetId: "nep141:near-usdc", symbol: "USDC", blockchain: "near", decimals: 6, contractAddress: "usdc-near" },
            { assetId: "nep141:base-usdc", symbol: "USDC", blockchain: "base", decimals: 6, contractAddress: "0x8335" },
            { assetId: "nep141:arb.omft.near", symbol: "ETH", blockchain: "arb", decimals: 18 },
            { assetId: "nep245:bsc-old", symbol: "BNB(DEPRECATED)", blockchain: "bsc", decimals: 18 },
            { assetId: "nep245:stellar-usdc", symbol: "USDC", blockchain: "stellar", decimals: 7, contractAddress: "GA5Z" },
          ]),
        );
        return;
      }
      if (url.startsWith("/v0/quote")) {
        const body = record(raw);
        bodies.push(body);
        response.end(
          JSON.stringify({
            quote: {
              ...(body.dry === true ? {} : { depositAddress: "deposit-1", deadline: "2030-01-01T00:00:00.000Z" }),
              ...(body.depositMode === "MEMO" ? { depositMemo: "memo-1" } : {}),
              amountIn: "10000",
              amountInFormatted: "0.01",
              amountOut: "20000",
              amountOutFormatted: "0.02",
            },
          }),
        );
        return;
      }
      if (url.startsWith("/v0/status")) {
        const memo = new URL(url, "http://stub").searchParams.get("depositMemo");
        response.end(JSON.stringify({ status: memo === "memo-1" ? "SUCCESS" : "PENDING_DEPOSIT" }));
        return;
      }
      if (url.startsWith("/v0/deposit/submit")) {
        submits.push(JSON.parse(raw));
        response.end(JSON.stringify({ status: "KNOWN_DEPOSIT_TX" }));
        return;
      }
      response.end("{}");
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

test("quotes take any token, ask for a memo on Stellar, and preview on testnet", async () => {
  const server = await stub();
  process.env.ONECLICK_BASE_URL = server.url;
  process.env.NEAR_USDC_ID = "usdc-near";
  process.env.NEAR_CORE_ID = "core.near";
  process.env.NEAR_NETWORK = "mainnet";
  try {
    const { tokens, quote, quoteStatus, submitDeposit } = await import("./intents.ts");
    const list = await tokens();
    assert.deepEqual(
      list.map((token) => `${token.symbol} on ${token.blockchain}`),
      ["USDC on near", "USDC on base", "ETH on arb", "USDC on stellar"],
    );
    assert.equal(list[2]?.contractAddress, null);

    const funded = await quote({ kind: "fund", owner: "alice.near", originAsset: "nep141:arb.omft.near", amount: 10_000n, refundTo: "0xabc", dry: false });
    assert.equal(funded.depositAddress, "deposit-1");
    assert.equal(funded.depositMemo, null);
    assert.equal(funded.amountInFormatted, "0.01");
    const fundBody = bodies.at(-1);
    assert.equal(fundBody?.originAsset, "nep141:arb.omft.near");
    assert.equal(fundBody?.destinationAsset, "nep141:usdc-near");
    assert.equal(fundBody?.recipient, "core.near");
    assert.equal(fundBody?.dry, false);
    assert.equal(fundBody?.depositMode, "SIMPLE");
    assert.deepEqual(JSON.parse(String(fundBody?.customRecipientMsg)), { fund: { to: "alice.near" } });

    const stellar = await quote({ kind: "fund", owner: "alice.near", originAsset: "nep245:stellar-usdc", amount: 10_000n, refundTo: "GABC", dry: false });
    assert.equal(bodies.at(-1)?.depositMode, "MEMO");
    assert.equal(stellar.depositMemo, "memo-1");
    assert.equal(await quoteStatus("deposit-1", "memo-1"), "SUCCESS");
    await submitDeposit("0xhash", "deposit-1", "memo-1");
    assert.deepEqual(submits.at(-1), { txHash: "0xhash", depositAddress: "deposit-1", memo: "memo-1" });

    const withdrawn = await quote({ kind: "withdraw", account: "alice.near", destinationAsset: "nep141:base-usdc", amount: 5_000n, recipient: "0xdef", dry: false });
    assert.equal(withdrawn.amountOut, "20000");
    const withdrawBody = bodies.at(-1);
    assert.equal(withdrawBody?.originAsset, "nep141:usdc-near");
    assert.equal(withdrawBody?.refundTo, "alice.near");
    assert.equal(withdrawBody?.customRecipientMsg, undefined);

    process.env.NEAR_NETWORK = "testnet";
    const preview = await quote({ kind: "fund", owner: "alice.testnet", originAsset: "nep141:base-usdc", amount: 10_000n, refundTo: "0xabc", dry: false });
    const previewBody = bodies.at(-1);
    assert.equal(previewBody?.dry, true);
    assert.equal(previewBody?.destinationAsset, "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    assert.equal(previewBody?.recipient, "intents.near");
    assert.equal(preview.depositAddress, null);
    await quote({ kind: "withdraw", account: "alice.testnet", destinationAsset: "nep141:base-usdc", amount: 5_000n, recipient: "0xdef", dry: false });
    assert.equal(bodies.at(-1)?.refundTo, "intents.near");

    process.env.NEAR_NETWORK = "mainnet";
    await quote({ kind: "fund", owner: "alice.near", originAsset: "nep141:base-usdc", amount: 10_000n, refundTo: null, dry: true });
    assert.equal(bodies.at(-1)?.refundTo, "intents.near");
    assert.equal(bodies.at(-1)?.refundType, "INTENTS");
    await assert.rejects(quote({ kind: "fund", owner: "alice.near", originAsset: "nep141:base-usdc", amount: 10_000n, refundTo: null, dry: false }));
  } finally {
    server.close();
  }
});
