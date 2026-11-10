CREATE TABLE "perp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text NOT NULL,
	"position" integer NOT NULL,
	"account" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"size" bigint NOT NULL,
	"margin" bigint NOT NULL,
	"price" bigint NOT NULL,
	"fee" bigint NOT NULL,
	"reward" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perp_events_kind" CHECK ("perp_events"."kind" in ('modified','liquidated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "perp_events_tx_position_key" ON "perp_events" USING btree ("tx_hash","position");--> statement-breakpoint
CREATE INDEX "perp_events_account_created_idx" ON "perp_events" USING btree ("account","created_at");