import { MARKETS } from "./markets.ts";
import { view } from "./near.ts";
import { liquidationPrice, type PositionMath } from "./perp-math.ts";
import type { PerpAccount } from "./types";

export {
  liquidatable,
  liquidationPrice,
  maxOpen,
  notional,
  openMargin,
  payoffLadder,
  historyRows,
  orderPlan,
  positionAfter,
  tradeFee,
} from "./perp-math.ts";
export type { PositionMath } from "./perp-math.ts";

export { MARKETS };

type MarketView = {
  listed: boolean;
  price: string;
  updated_at: number;
  long_oi: string;
  short_oi: string;
  funding_rate: string;
  max_leverage: number;
  max_oi: string;
};

type PositionView = {
  size: string;
  margin: string;
  entry_price: string;
  equity: string;
  funding_owed: string;
};

export async function readMarket(model: string) {
  const market = await view<MarketView>("market", { model });
  return {
    listed: market.listed,
    price: BigInt(market.price),
    updatedAt: BigInt(market.updated_at),
    longOi: BigInt(market.long_oi),
    shortOi: BigInt(market.short_oi),
    fundingRatePerHour: BigInt(market.funding_rate) * 3600n,
    maxLeverage: BigInt(market.max_leverage),
    maxOi: BigInt(market.max_oi),
  };
}

export async function readPosition(model: string, account: string) {
  const position = await view<PositionView>("position", { account, model });
  const math: PositionMath = {
    size: BigInt(position.size),
    margin: BigInt(position.margin),
    entryPrice: BigInt(position.entry_price),
    fundingOwed: BigInt(position.funding_owed),
  };
  return {
    size: math.size,
    margin: math.margin,
    entryPrice: math.entryPrice,
    equity: BigInt(position.equity),
    fundingOwed: math.fundingOwed,
    liquidationPrice: liquidationPrice(math),
  };
}

export async function readAccount(account: string): Promise<PerpAccount> {
  const wallet = BigInt(await view<string>("wallet", { account }));
  const positions: PerpAccount["positions"] = [];
  for (const model of MARKETS) {
    const position = await readPosition(model, account);
    if (position.size === 0n) continue;
    positions.push({
      model,
      size: position.size.toString(),
      margin_usd_micro: position.margin.toString(),
      entry_price_micro_per_mtok: position.entryPrice.toString(),
      equity_usd_micro: position.equity.toString(),
      funding_owed_usd_micro: position.fundingOwed.toString(),
      liquidation_price_micro_per_mtok: position.liquidationPrice.toString(),
    });
  }
  return { account, wallet_usd_micro: wallet.toString(), positions };
}
