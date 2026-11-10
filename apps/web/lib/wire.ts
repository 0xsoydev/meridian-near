import { z } from "zod";
import type {
  ApprovalView,
  Bid,
  Book,
  CapSummary,
  CreateKeyResult,
  DeviceStart,
  DeviceStatus,
  Holding,
  IntentQuote,
  IntentStatus,
  IntentToken,
  KeyFill,
  KeyList,
  KeySummary,
  Me,
  ModelRow,
  Offer,
  OwnerUsage,
  PerpAccount,
  PerpEvent,
  PerpMarket,
  SellResult,
  SellerListings,
  SellerPayouts,
  Trade,
  TradeResult,
  VenueStatus,
  WalletView,
} from "./types";

const int = z.string().regex(/^-?\d+$/);
const railId = z.enum(["stub", "anthropic", "openai", "openrouter", "commandcode", "zen", "opencode-go", "near-ai"]);
const list = <T>(item: z.ZodType<T>) => z.object({ data: z.array(item) });

export const anything = z.unknown();

const cap: z.ZodType<CapSummary> = z.object({ per_day_usd_micro: int, used_today_usd_micro: int, left_usd_micro: int });

export const meSchema: z.ZodType<Me> = z.object({
  owner: z.string(),
  wallet_usd_micro: int,
  float_usd_micro: int,
  reserved_usd_micro: int,
  cap,
  default_model: z.string().nullable(),
  prepaid_tokens: int,
  open_bids: z.number(),
  open_offers: z.number(),
});

const holding: z.ZodType<Holding> = z.object({
  prepaid_id: z.string(),
  model: z.string(),
  listing_id: z.string(),
  rail: z.string(),
  tokens: int,
  expires_at: z.string().nullable(),
});

const bid: z.ZodType<Bid> = z.object({
  bid_id: z.string(),
  model: z.string(),
  tokens: int,
  price_micro_per_mtok: int,
  hold_usd_micro: int,
  created_at: z.string(),
});

const offer: z.ZodType<Offer> = z.object({
  offer_id: z.string(),
  model: z.string(),
  listing_id: z.string(),
  tokens: int,
  price_micro_per_mtok: int,
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

const keyFill: z.ZodType<KeyFill> = z.object({
  at: z.string(),
  model: z.string(),
  side: z.enum(["buy", "sell"]),
  tokens: int,
  price_micro_per_mtok: int,
  amount_usd_micro: int,
});

export const holdingsSchema = list(holding);
export const bidsSchema = list(bid);
export const offersSchema = list(offer);
export const fillsSchema = list(keyFill);

const trade: z.ZodType<Trade> = z.object({
  listing_id: z.string(),
  tokens: int,
  price_micro_per_mtok: int,
  charge_usd_micro: int,
});

export const tradeResultSchema: z.ZodType<TradeResult> = z.object({ fills: z.array(trade), bid: bid.nullable(), prepaid_tokens: int });

export const sellResultSchema: z.ZodType<SellResult> = z.object({
  fills: z.array(trade),
  offers: z.array(offer),
  holding_tokens: int,
});

export const bookSchema: z.ZodType<Book> = z.object({
  model: z.string(),
  asks: z.array(
    z.object({
      listing_id: z.string(),
      offer_id: z.string().nullable(),
      kind: z.enum(["listing", "resale"]),
      rail: railId,
      price_micro_per_mtok: int,
      tokens_left: int,
      verifiable: z.boolean(),
    }),
  ),
  bids: z.array(z.object({ price_micro_per_mtok: int, tokens: int })),
  fills: z.array(z.object({ listing_id: z.string(), tokens: int, price_micro_per_mtok: int, created_at: z.string() })),
});

const modelRow: z.ZodType<ModelRow> = z.object({
  id: z.string(),
  object: z.literal("model"),
  rails: z.array(railId),
  verifiability: z.literal("tee").nullable(),
  list_prompt_micro_per_mtok: int,
  list_completion_micro_per_mtok: int,
  reference_blended_micro_per_mtok: int,
  list_ceiling_micro_per_mtok: int,
  best_ask_micro_per_mtok: int.nullable(),
  index_micro_per_mtok: int.nullable(),
  available_tokens: int,
});

export const modelsSchema = list(modelRow);

export const statusSchema: z.ZodType<VenueStatus> = z.object({
  keeper_last_post_s: z.number().nullable(),
  markets: z.array(z.object({ model: z.string(), index_micro_per_mtok: int.nullable(), age_s: z.number().nullable(), open: z.boolean() })),
  payouts: z.object({ pending: z.number(), executed: z.number(), last_day: z.string().nullable() }),
  venue: z.object({ fills_24h: z.number(), volume_24h_tokens: int, open_asks: z.number() }),
});

export const perpMarketSchema: z.ZodType<PerpMarket> = z.object({
  model: z.string(),
  listed: z.boolean(),
  price_micro_per_mtok: int,
  updated_at: int,
  long_oi: int,
  short_oi: int,
  funding_rate_per_hour: int,
  max_leverage: int,
  max_oi: int,
  posts: z.array(z.object({ price_micro_per_mtok: int, at: z.number() })),
});

export const perpAccountSchema: z.ZodType<PerpAccount> = z.object({
  account: z.string(),
  wallet_usd_micro: int,
  positions: z.array(
    z.object({
      model: z.string(),
      size: int,
      margin_usd_micro: int,
      entry_price_micro_per_mtok: int,
      equity_usd_micro: int,
      funding_owed_usd_micro: int,
      liquidation_price_micro_per_mtok: int,
    }),
  ),
});

const perpEvent: z.ZodType<PerpEvent> = z.object({
  tx_hash: z.string(),
  at: z.string(),
  model: z.string(),
  kind: z.enum(["modified", "liquidated"]),
  size: int,
  margin_usd_micro: int,
  price_micro_per_mtok: int,
  fee_usd_micro: int,
  reward_usd_micro: int,
});

export const perpHistorySchema = list(perpEvent);

export const walletSchema: z.ZodType<WalletView> = z.object({ wallet_usd_micro: int, near_usdc_micro: int });

const keySummary: z.ZodType<KeySummary> = z.object({
  key_id: z.string(),
  name: z.string(),
  float_usd_micro: int,
  cap_key: z.string().nullable(),
  cap: cap.nullable(),
  created_at: z.string(),
});

const ownerUsage: z.ZodType<OwnerUsage> = z.object({
  key_id: z.string(),
  key_name: z.string(),
  at: z.string(),
  model: z.string(),
  rail: z.string(),
  status: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  mixed_tokens: int,
  charge_usd_micro: int,
  paid_from: z.enum(["prepaid", "float"]),
  upstream_request_id: z.string().nullable(),
  proof: z.boolean(),
});

export const keyListSchema: z.ZodType<KeyList> = z.object({ keys: z.array(keySummary), usage: z.array(ownerUsage) });

export const createKeySchema: z.ZodType<CreateKeyResult> = z.object({ key: z.string(), key_id: z.string() });

export const approvalSchema: z.ZodType<ApprovalView> = z.object({ key_id: z.string(), name: z.string(), cap_usd_micro: int.nullable() });

export const deviceStartSchema: z.ZodType<DeviceStart> = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri_complete: z.string(),
  qr: z.string(),
  expires_at: z.string(),
  interval: z.number(),
});

export const deviceStatusSchema: z.ZodType<DeviceStatus> = z.object({
  status: z.enum(["pending", "approved", "denied", "expired"]),
  key: z.string().optional(),
  key_id: z.string().optional(),
});

const intentStatus: z.ZodType<IntentStatus> = z.enum(["PENDING_DEPOSIT", "PROCESSING", "SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"]);

export const intentTokensSchema = list<IntentToken>(z.object({ assetId: z.string(), symbol: z.string(), blockchain: z.string() }));
export const intentQuoteSchema: z.ZodType<IntentQuote> = z.object({
  depositAddress: z.string(),
  amountIn: int,
  amountOut: int,
  deadline: z.string(),
});
export const intentStatusSchema = z.object({ status: intentStatus });

export const listingsSchema: z.ZodType<SellerListings> = z.object({
  listings: z.array(
    z.object({
      listing_id: z.string(),
      rail: z.string(),
      model: z.string(),
      price_micro_per_mtok: int,
      capacity_tokens: int,
      used_tokens: int,
      reserved_tokens: int,
      status: z.string(),
    }),
  ),
});

export const payoutsSchema: z.ZodType<SellerPayouts> = z.object({
  network: z.string(),
  unpaid_usd_micro: int,
  data: z.array(z.object({ day: z.string(), amount_usd_micro: int, tx_hash: z.string().nullable(), status: z.string() })),
});

export const listingCreatedSchema = z.object({ listing_id: z.string() });
