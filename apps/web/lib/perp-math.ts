const MM_BPS = 500n;
const SEARCH_CEILING = 1n << 128n;

export type PositionMath = { size: bigint; margin: bigint; entryPrice: bigint; fundingOwed: bigint };

function pnl(size: bigint, entryPrice: bigint, price: bigint): bigint {
  return (size * (price - entryPrice)) / 1_000_000n;
}

export function notional(size: bigint, price: bigint): bigint {
  return ((size < 0n ? -size : size) * price) / 1_000_000n;
}

export function liquidatable(p: PositionMath, price: bigint): boolean {
  const equity = p.margin + pnl(p.size, p.entryPrice, price) - p.fundingOwed;
  return equity * 10_000n < notional(p.size, price) * MM_BPS;
}

export function liquidationPrice(p: PositionMath): bigint {
  if (p.size === 0n) return 0n;
  const long = p.size > 0n;
  if (long && !liquidatable(p, 0n)) return 0n;
  let safe = long ? SEARCH_CEILING : 0n;
  let liq = long ? 0n : SEARCH_CEILING;
  while ((long ? safe - liq : liq - safe) > 1n) {
    const mid = (safe + liq) / 2n;
    if (liquidatable(p, mid)) liq = mid;
    else safe = mid;
  }
  return liq;
}

export function tradeFee(sizeDelta: bigint, price: bigint): bigint {
  const size = sizeDelta < 0n ? -sizeDelta : sizeDelta;
  return (size * price * 10n + 9_999_999_999n) / 10_000_000_000n;
}

export function openMargin(sizeDelta: bigint, price: bigint, maxLeverage: bigint): bigint {
  const value = notional(sizeDelta, price);
  return value / maxLeverage + value / 100n + tradeFee(sizeDelta, price) + 1n;
}

export function maxOpen(wallet: bigint, price: bigint, leverage: bigint): bigint {
  if (price <= 0n || leverage <= 0n || wallet <= 2n) return 0n;
  let size = ((wallet - 2n) * 1_000_000_000n * leverage) / (price * (1_000n + 11n * leverage));
  while (size > 0n && openMargin(size, price, leverage) > wallet) size -= size / 1_000n + 1n;
  return size;
}

export function positionAfter(
  current: PositionMath | null,
  legs: ReadonlyArray<{ sizeDelta: bigint; margin: bigint }>,
  price: bigint,
): PositionMath | null {
  const held = current?.size ?? 0n;
  const size = legs.reduce((sum, leg) => sum + leg.sizeDelta, held);
  const last = legs.at(-1);
  if (size === 0n || !last) return null;
  const fee = tradeFee(last.sizeDelta, price);
  if (!current || held === 0n || legs.length === 2) {
    return { size, margin: last.margin - fee, entryPrice: price, fundingOwed: 0n };
  }
  const settled = current.margin - current.fundingOwed - fee;
  if (last.margin === 0n) {
    return {
      size,
      margin: settled + pnl(held - size, current.entryPrice, price),
      entryPrice: current.entryPrice,
      fundingOwed: 0n,
    };
  }
  const before = held < 0n ? -held : held;
  const total = size < 0n ? -size : size;
  return {
    size,
    margin: settled + last.margin,
    entryPrice: (before * current.entryPrice + (total - before) * price) / total,
    fundingOwed: 0n,
  };
}

export function orderPlan(
  current: bigint,
  delta: bigint,
  price: bigint,
  maxLeverage: bigint,
): { sizeDelta: bigint; margin: bigint }[] {
  if (delta === 0n) return [];
  if (current === 0n || (current > 0n) === (delta > 0n)) {
    return [{ sizeDelta: delta, margin: openMargin(delta, price, maxLeverage) }];
  }
  const rest = current + delta;
  if (rest === 0n || (rest > 0n) === (current > 0n)) return [{ sizeDelta: delta, margin: 0n }];
  return [
    { sizeDelta: -current, margin: 0n },
    { sizeDelta: rest, margin: openMargin(rest, price, maxLeverage) },
  ];
}
