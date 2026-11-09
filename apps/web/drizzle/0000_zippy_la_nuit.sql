CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_id" uuid NOT NULL,
	"cap_usd_micro" bigint,
	"device_code_hash" "bytea",
	"key_ciphertext" text,
	"user_code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_device_code_hash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "approvals_user_code_unique" UNIQUE("user_code"),
	CONSTRAINT "approvals_kind" CHECK ("approvals"."kind" in ('create_key','raise_cap')),
	CONSTRAINT "approvals_status" CHECK ("approvals"."status" in ('pending','approved','denied','expired'))
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"model" text NOT NULL,
	"price_micro_per_mtok" bigint NOT NULL,
	"tokens" bigint NOT NULL,
	"hold_usd_micro" bigint NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_status" CHECK ("bids"."status" in ('open','filled','cancelled')),
	CONSTRAINT "bids_price_positive" CHECK ("bids"."price_micro_per_mtok" > 0),
	CONSTRAINT "bids_tokens_non_negative" CHECK ("bids"."tokens" >= 0),
	CONSTRAINT "bids_hold_non_negative" CHECK ("bids"."hold_usd_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"name" text,
	"cap_key" text,
	"hash" "bytea" NOT NULL,
	"balance_usd_micro" bigint DEFAULT 0 NOT NULL,
	"reserved_usd_micro" bigint DEFAULT 0 NOT NULL,
	"default_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keys_hash_unique" UNIQUE("hash"),
	CONSTRAINT "keys_balance_non_negative" CHECK ("keys"."balance_usd_micro" >= 0),
	CONSTRAINT "keys_reserved_non_negative" CHECK ("keys"."reserved_usd_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"rail" text NOT NULL,
	"model" text NOT NULL,
	"credential_ciphertext" text NOT NULL,
	"price_micro_per_mtok" bigint NOT NULL,
	"capacity_tokens" bigint NOT NULL,
	"used_tokens" bigint DEFAULT 0 NOT NULL,
	"reserved_tokens" bigint DEFAULT 0 NOT NULL,
	"throttled_until" timestamp with time zone,
	"status" text NOT NULL,
	"client_nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_client_nonce_unique" UNIQUE("client_nonce"),
	CONSTRAINT "listings_capacity_positive" CHECK ("listings"."capacity_tokens" > 0),
	CONSTRAINT "listings_capacity_bound" CHECK ("listings"."used_tokens" + "listings"."reserved_tokens" <= "listings"."capacity_tokens"),
	CONSTRAINT "listings_price_positive" CHECK ("listings"."price_micro_per_mtok" > 0),
	CONSTRAINT "listings_status" CHECK ("listings"."status" in ('active','exhausted','throttled','invalid','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"prepaid_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"model" text NOT NULL,
	"price_micro_per_mtok" bigint NOT NULL,
	"tokens" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_status" CHECK ("offers"."status" in ('open','filled','cancelled')),
	CONSTRAINT "offers_price_positive" CHECK ("offers"."price_micro_per_mtok" > 0),
	CONSTRAINT "offers_tokens_non_negative" CHECK ("offers"."tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"amount_usd_micro" bigint NOT NULL,
	"kind" text DEFAULT 'earnings' NOT NULL,
	"tx_hash" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_kind" CHECK ("payouts"."kind" in ('earnings','refund')),
	CONSTRAINT "payouts_status" CHECK ("payouts"."status" in ('pending','executed'))
);
--> statement-breakpoint
CREATE TABLE "prepaid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"model" text NOT NULL,
	"tokens_remaining" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prepaid_tokens_non_negative" CHECK ("prepaid"."tokens_remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"model" text NOT NULL,
	"tokens" bigint NOT NULL,
	"price_micro_per_mtok" bigint NOT NULL,
	"charge_usd_micro" bigint NOT NULL,
	"seller_earning_usd_micro" bigint NOT NULL,
	"payout_id" uuid,
	"seller_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_tokens_positive" CHECK ("trades"."tokens" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"rail" text NOT NULL,
	"upstream_request_id" text,
	"key_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"prepaid_id" uuid,
	"price_micro_per_mtok" bigint NOT NULL,
	"reserved_tokens" bigint DEFAULT 0 NOT NULL,
	"reserved_usd_micro" bigint DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"list_cost_usd_micro" bigint DEFAULT 0 NOT NULL,
	"mixed_tokens" bigint DEFAULT 0 NOT NULL,
	"charge_usd_micro" bigint DEFAULT 0 NOT NULL,
	"seller_earning_usd_micro" bigint DEFAULT 0 NOT NULL,
	"payout_id" uuid,
	"rollup_minute" bigint,
	"proof" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "usage_status" CHECK ("usage"."status" in ('open','settled','released'))
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keys" ADD CONSTRAINT "keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_accounts_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_prepaid_id_prepaid_id_fk" FOREIGN KEY ("prepaid_id") REFERENCES "public"."prepaid"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prepaid" ADD CONSTRAINT "prepaid_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prepaid" ADD CONSTRAINT "prepaid_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_seller_key_id_keys_id_fk" FOREIGN KEY ("seller_key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_key_id_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_prepaid_id_prepaid_id_fk" FOREIGN KEY ("prepaid_id") REFERENCES "public"."prepaid"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bids_model_status_price_idx" ON "bids" USING btree ("model","status","price_micro_per_mtok");--> statement-breakpoint
CREATE INDEX "bids_key_status_idx" ON "bids" USING btree ("key_id","status");--> statement-breakpoint
CREATE INDEX "listings_model_status_price_idx" ON "listings" USING btree ("model","status","price_micro_per_mtok");--> statement-breakpoint
CREATE INDEX "offers_model_status_price_idx" ON "offers" USING btree ("model","status","price_micro_per_mtok");--> statement-breakpoint
CREATE INDEX "offers_key_status_idx" ON "offers" USING btree ("key_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_account_day_earnings_key" ON "payouts" USING btree ("account_id","day") WHERE "payouts"."kind" = 'earnings';--> statement-breakpoint
CREATE INDEX "prepaid_key_model_expires_idx" ON "prepaid" USING btree ("key_id","model","expires_at");--> statement-breakpoint
CREATE INDEX "trades_created_idx" ON "trades" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trades_listing_payout_idx" ON "trades" USING btree ("listing_id","payout_id");--> statement-breakpoint
CREATE INDEX "trades_key_created_idx" ON "trades" USING btree ("key_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_seller_key_created_idx" ON "trades" USING btree ("seller_key_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_upstream_request_id_key" ON "usage" USING btree ("upstream_request_id") WHERE "usage"."upstream_request_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_status_created_idx" ON "usage" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "usage_settled_at_idx" ON "usage" USING btree ("settled_at");--> statement-breakpoint
CREATE INDEX "usage_listing_payout_idx" ON "usage" USING btree ("listing_id","payout_id");--> statement-breakpoint
CREATE INDEX "usage_rollup_idx" ON "usage" USING btree ("rollup_minute");