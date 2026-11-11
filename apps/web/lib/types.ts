export type RailId =
  | "stub"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "commandcode"
  | "zen"
  | "opencode-go"
  | "near-ai";

export type Verifiability = "tee" | null;

export type RailModel = {
  canonical: string;
  upstream: string;
  listPrompt: bigint;
  listCompletion: bigint;
  verifiability: Verifiability;
};

export type RailCheck = "key" | "models" | "chat" | "check";

export type Rail = {
  id: RailId;
  baseUrl: string;
  modelsUrl: string;
  check: RailCheck;
  extraHeaders: Record<string, string>;
  models: ReadonlyArray<RailModel>;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  enabled: boolean;
};

export type Micro = bigint;
export type MicroPerMTok = bigint;
export type Pricing = { prompt: MicroPerMTok; completion: MicroPerMTok };

export type RouterErrorCode =
  | "invalid_api_key"
  | "model_not_found"
  | "no_liquidity"
  | "insufficient_balance"
  | "approval_required"
  | "upstream_failed"
  | "invalid_request";

export type BlockedAction = {
  url: string;
  code: string;
  qr: string;
  near_cli: string;
  poll: string;
};

export type RouterError = {
  error: {
    message: string;
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "payment_error"
      | "permission_error"
      | "server_error";
    code: RouterErrorCode;
  };
  action?: BlockedAction;
};

export type DeviceStart = {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  qr: string;
  expires_at: string;
  interval: number;
};

export type DeviceStatus = {
  status: "pending" | "approved" | "denied" | "expired";
  key?: string | undefined;
  key_id?: string | undefined;
};

export type ApprovalView = { key_id: string; name: string; cap_usd_micro: string | null };

export type WalletView = { wallet_usd_micro: string; near_usdc_micro: string; near_yocto: string };

export type ModelRow = {
  id: string;
  object: "model";
  rails: RailId[];
  verifiability: Verifiability;
  list_prompt_micro_per_mtok: string;
  list_completion_micro_per_mtok: string;
  reference_blended_micro_per_mtok: string;
  list_ceiling_micro_per_mtok: string;
  best_ask_micro_per_mtok: string | null;
  index_micro_per_mtok: string | null;
  available_tokens: string;
};

export type CreateKeyResult = { key: string; key_id: string };

export type KeySummary = {
  key_id: string;
  name: string;
  float_usd_micro: string;
  cap_key: string | null;
  cap: CapSummary | null;
  parent_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type SwarmAgent = { key: string; key_id: string; model: string; rail: string; ask_micro_per_mtok: string };

export type SwarmStart = { agents: SwarmAgent[]; share_usd_micro: string; expires_at: string };

export type SwarmAgentView = {
  key_id: string;
  model: string;
  spent_usd_micro: string;
  left_usd_micro: string;
  requests: number;
  expires_at: string;
  ended: boolean;
};

export type SwarmView = { agents: SwarmAgentView[] };

export type ReturnedFloat = { returned_usd_micro: string };

export type CapSummary = {
  per_day_usd_micro: string;
  used_today_usd_micro: string;
  left_usd_micro: string;
};

export type Me = {
  owner: string;
  wallet_usd_micro: string;
  float_usd_micro: string;
  reserved_usd_micro: string;
  cap: CapSummary;
  default_model: string | null;
  prepaid_tokens: string;
  open_bids: number;
  open_offers: number;
};

export type KeySettings = {
  default_model?: string | null;
};

export type ListingIntent = {
  action: "list";
  rail: RailId;
  model: string;
  capacity_mtok: string;
  price_micro_per_mtok: string;
  client_nonce: string;
};

export type Credential = { kind: "key"; key: string } | { kind: "stored"; listing_id: string };

export type TradeIntent = { model: string; tokens: string };

export type Trade = {
  listing_id: string;
  tokens: string;
  price_micro_per_mtok: string;
  charge_usd_micro: string;
};

export type Bid = {
  bid_id: string;
  model: string;
  tokens: string;
  price_micro_per_mtok: string;
  hold_usd_micro: string;
  created_at: string;
};

export type TradeResult = { fills: Trade[]; bid: Bid | null; prepaid_tokens: string };

export type PerpEvent = {
  tx_hash: string;
  at: string;
  model: string;
  kind: "modified" | "liquidated";
  size: string;
  margin_usd_micro: string;
  price_micro_per_mtok: string;
  fee_usd_micro: string;
  reward_usd_micro: string;
};

export type PerpMarket = {
  model: string;
  listed: boolean;
  price_micro_per_mtok: string;
  updated_at: string;
  long_oi: string;
  short_oi: string;
  funding_rate_per_hour: string;
  max_leverage: string;
  max_oi: string;
  posts: { price_micro_per_mtok: string; at: number }[];
};

export type PerpAccount = {
  account: string;
  wallet_usd_micro: string;
  positions: {
    model: string;
    size: string;
    margin_usd_micro: string;
    entry_price_micro_per_mtok: string;
    equity_usd_micro: string;
    funding_owed_usd_micro: string;
    liquidation_price_micro_per_mtok: string;
  }[];
};

export type Offer = {
  offer_id: string;
  model: string;
  listing_id: string;
  tokens: string;
  price_micro_per_mtok: string;
  expires_at: string | null;
  created_at: string;
};

export type SellResult = { fills: Trade[]; offers: Offer[]; holding_tokens: string };

export type Holding = {
  prepaid_id: string;
  model: string;
  listing_id: string;
  rail: string;
  tokens: string;
  expires_at: string | null;
};

export type VenueStatus = {
  keeper_last_post_s: number | null;
  markets: { model: string; index_micro_per_mtok: string | null; age_s: number | null; open: boolean }[];
  payouts: { pending: number; executed: number; last_day: string | null };
  venue: { fills_24h: number; volume_24h_tokens: string; open_asks: number };
};

export type KeyUsage = {
  at: string;
  model: string;
  rail: string;
  status: string;
  prompt_tokens: number;
  completion_tokens: number;
  mixed_tokens: string;
  charge_usd_micro: string;
  paid_from: "prepaid" | "float";
  upstream_request_id: string | null;
  proof: boolean;
};

export type OwnerUsage = KeyUsage & { key_id: string; key_name: string };

export type KeyList = { keys: KeySummary[]; usage: OwnerUsage[] };

export type KeyFill = {
  at: string;
  model: string;
  side: "buy" | "sell";
  tokens: string;
  price_micro_per_mtok: string;
  amount_usd_micro: string;
};

export type BookAsk = {
  listing_id: string;
  offer_id: string | null;
  kind: "listing" | "resale";
  rail: RailId;
  price_micro_per_mtok: string;
  tokens_left: string;
  verifiable: boolean;
};

export type BookFill = {
  listing_id: string;
  tokens: string;
  price_micro_per_mtok: string;
  created_at: string;
};

export type BookBid = { price_micro_per_mtok: string; tokens: string };

export type Book = { model: string; asks: BookAsk[]; bids: BookBid[]; fills: BookFill[] };

export type SellerListing = {
  listing_id: string;
  rail: string;
  model: string;
  price_micro_per_mtok: string;
  capacity_tokens: string;
  used_tokens: string;
  reserved_tokens: string;
  status: string;
};

export type SellerListings = { listings: SellerListing[] };

export type SellerPayouts = {
  network: string;
  unpaid_usd_micro: string;
  data: {
    day: string;
    amount_usd_micro: string;
    tx_hash: string | null;
    status: string;
  }[];
};

export type Rollup = {
  v: 1;
  model: string;
  minute: number;
  fills: number;
  mixed_tokens: string;
  charge_usd_micro: string;
  vwap_micro_per_mtok: string;
  usage_root: string;
};

export type IndexPost = { model: string; price_micro_per_mtok: string; at: number };

export type MarketIndex = { model: string; priceMicroPerMtok: string };

export type IntentToken = {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  contractAddress: string | null;
};

export type IntentQuote = {
  depositAddress: string | null;
  depositMemo: string | null;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  deadline: string | null;
};

export type IntentStatus =
  | "PENDING_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";
