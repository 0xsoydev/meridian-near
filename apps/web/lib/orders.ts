import { baseEncode } from "near-api-js";

export type Order =
  | { method: "set_cap_signed"; owner: string; key: string; per_day: string; nonce: number; valid_until: number }
  | { method: "withdraw_signed"; owner: string; amount: string; to: string; nonce: number; valid_until: number }
  | { method: "modify_signed"; owner: string; model: string; size_delta: string; margin_delta: string; nonce: number; valid_until: number };

export function usdcText(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const fraction = micro % 1_000_000n;
  return fraction === 0n ? whole.toString() : `${whole}.${fraction.toString().padStart(6, "0")}`.replace(/0+$/, "");
}

export function ownerText(owner: string): string {
  return /^[0-9a-f]{64}$/.test(owner) ? baseEncode(Uint8Array.from(owner.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))) : owner;
}

function action(order: Order): string {
  if (order.method === "set_cap_signed") return `Set a daily limit of ${usdcText(BigInt(order.per_day))} USDC for key ${order.key}.`;
  if (order.method === "withdraw_signed") return `Withdraw ${usdcText(BigInt(order.amount))} USDC to ${order.to}.`;
  const size = BigInt(order.size_delta);
  const margin = BigInt(order.margin_delta);
  return `Change your ${order.model} position: size ${size >= 0n ? "+" : ""}${size}, margin ${margin < 0n ? "-" : "+"}${usdcText(margin < 0n ? -margin : margin)} USDC.`;
}

export function orderText(contract: string, order: Order): string {
  return [
    "Meridian",
    action(order),
    `Account: ${ownerText(order.owner)}`,
    `Contract: ${contract}`,
    `Nonce: ${order.nonce}`,
    `Valid until: ${new Date(order.valid_until).toISOString().replace(/\.\d{3}Z$/, "Z")}`,
  ].join("\n");
}
