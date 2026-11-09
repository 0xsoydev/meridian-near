import type { Rollup } from "./types";

export const MAX_MOVE_BPS = 1000n;
export const POST_MOVE_BPS = 10n;
export const HEARTBEAT_S = 300n;
export const INDEX_FLOOR_DIVISOR = 10n;

export function minuteOf(ms: number): number {
  return Math.floor(ms / 60_000);
}

export function twap(rollups: ReadonlyArray<Rollup>): bigint | null {
  if (rollups.length === 0) return null;
  const total = rollups.reduce((sum, rollup) => sum + BigInt(rollup.vwap_micro_per_mtok), 0n);
  return total / BigInt(rollups.length);
}

export function clampIndex(price: bigint, referenceBlended: bigint): bigint {
  const floor = referenceBlended / INDEX_FLOOR_DIVISOR;
  return price < floor ? floor : price > referenceBlended ? referenceBlended : price;
}

export function stepToward(target: bigint, last: bigint): bigint {
  if (last === 0n) return target;
  const band = (last * MAX_MOVE_BPS) / 10_000n;
  return target > last + band ? last + band : target < last - band ? last - band : target;
}

export function shouldPost(next: bigint, last: bigint, updatedAt: bigint, nowS: bigint): boolean {
  if (last === 0n) return true;
  const move = next > last ? next - last : last - next;
  return move * 10_000n >= last * POST_MOVE_BPS || nowS - updatedAt >= HEARTBEAT_S;
}

export type IndexRecompute =
  | { state: "no-post"; twap: bigint | null; band: [bigint, bigint] | null }
  | { state: "no-input"; latest: bigint }
  | { state: "sync"; twap: bigint; band: [bigint, bigint]; next: bigint; latest: bigint }
  | { state: "pending"; twap: bigint; band: [bigint, bigint]; next: bigint; latest: bigint; diffBps: bigint };

export function recomputeIndex(input: {
  rollups: ReadonlyArray<Rollup>;
  reference: bigint;
  latest: bigint;
}): IndexRecompute {
  const band: [bigint, bigint] = [input.reference / INDEX_FLOOR_DIVISOR, input.reference];
  const average = twap(input.rollups);
  if (input.latest === 0n) return { state: "no-post", twap: average, band };
  if (average === null) return { state: "no-input", latest: input.latest };
  const next = stepToward(clampIndex(average, input.reference), input.latest);
  if (next === input.latest) return { state: "sync", twap: average, band, next, latest: input.latest };
  const diff = next > input.latest ? next - input.latest : input.latest - next;
  return { state: "pending", twap: average, band, next, latest: input.latest, diffBps: (diff * 10_000n) / input.latest };
}
