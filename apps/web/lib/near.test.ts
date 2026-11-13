import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { failoverProvider, rpcUrls } from "./near.ts";

async function rpc(status: number, body: object) {
  let hits = 0;
  const server = createServer((_, res) => {
    hits += 1;
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, hits: () => hits, close: () => server.close() };
}

const STATUS = { jsonrpc: "2.0", id: "1", result: { chain_id: "testnet" } };

test("a rate-limited RPC hands the request, and the ones after it, to the next", async () => {
  const limited = await rpc(429, { jsonrpc: "2.0", id: "1", error: { code: -429, message: "Rate limits exceeded" } });
  const spare = await rpc(200, STATUS);
  try {
    const provider = failoverProvider([limited.url, spare.url]);
    assert.equal((await provider.viewNodeStatus()).chain_id, "testnet");
    assert.equal((await provider.viewNodeStatus()).chain_id, "testnet");
    assert.deepEqual([limited.hits(), spare.hits()], [1, 2]);
  } finally {
    limited.close();
    spare.close();
  }
});

test("an error from the chain is not sent to another endpoint", async () => {
  const refusing = await rpc(200, {
    jsonrpc: "2.0",
    id: "1",
    error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { requested_account_id: "nobody.testnet" } }, code: -32000, message: "Server error" },
  });
  const spare = await rpc(200, STATUS);
  try {
    await assert.rejects(failoverProvider([refusing.url, spare.url]).viewNodeStatus());
    assert.equal(spare.hits(), 0);
  } finally {
    refusing.close();
    spare.close();
  }
});

test("NEAR_RPC_URL takes a comma-separated list", () => {
  const before = process.env.NEAR_RPC_URL;
  process.env.NEAR_RPC_URL = " https://one.example , https://two.example ";
  try {
    assert.deepEqual(rpcUrls(), ["https://one.example", "https://two.example"]);
  } finally {
    if (before === undefined) delete process.env.NEAR_RPC_URL;
    else process.env.NEAR_RPC_URL = before;
  }
});
