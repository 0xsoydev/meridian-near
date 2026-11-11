import assert from "node:assert/strict";
import test from "node:test";
import { ago, evmTransfer, fundingPercent, paymentUri, percent, sentence, usd } from "./client.ts";

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

test("evmTransfer sends the native amount, or an ERC-20 transfer to the deposit address", () => {
  const deposit = "0x2527D02599Ba641c19FEa793cD0F167589a0f10D";
  assert.deepEqual(evmTransfer("0xfrom", deposit, 2_464_810_690_364_382n, null), {
    from: "0xfrom",
    to: deposit,
    value: "0x8c1bb75a343de",
  });
  assert.deepEqual(evmTransfer("0xfrom", deposit, 5_050_000n, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), {
    from: "0xfrom",
    to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    data: "0xa9059cbb0000000000000000000000002527d02599ba641c19fea793cd0f167589a0f10d00000000000000000000000000000000000000000000000000000000004d0e90",
  });
  assert.throws(() => evmTransfer("0xfrom", "bc1qdeposit", 1n, null));
  assert.throws(() => evmTransfer("0xfrom", deposit, 0n, null));
});

test("paymentUri follows EIP-681, Solana Pay and BIP-21, and stays empty when a memo is needed", () => {
  const quote = { depositAddress: "0xdep", depositMemo: null, amountIn: "5050000", amountInFormatted: "5.05", amountOut: "5000000", amountOutFormatted: "5.0", deadline: null };
  const usdcBase = { assetId: "a", symbol: "USDC", blockchain: "base", decimals: 6, contractAddress: "0x8335" };
  assert.equal(paymentUri(usdcBase, quote), "ethereum:0x8335@8453/transfer?address=0xdep&uint256=5050000");
  assert.equal(paymentUri({ ...usdcBase, symbol: "ETH", blockchain: "arb", contractAddress: null }, quote), "ethereum:0xdep@42161?value=5050000");
  assert.equal(paymentUri({ ...usdcBase, blockchain: "sol", contractAddress: "EPjF" }, quote), "solana:0xdep?amount=5.05&spl-token=EPjF");
  assert.equal(paymentUri({ ...usdcBase, symbol: "BTC", blockchain: "btc", contractAddress: null }, quote), "bitcoin:0xdep?amount=5.05");
  assert.equal(paymentUri({ ...usdcBase, blockchain: "stellar" }, { ...quote, depositMemo: "123" }), null);
  assert.equal(paymentUri({ ...usdcBase, blockchain: "ton" }, quote), null);
  assert.equal(paymentUri(usdcBase, { ...quote, depositAddress: null }), null);
});
