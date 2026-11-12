ALTER TABLE "listings" ADD COLUMN "credential_kind" text DEFAULT 'api_key' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "credential_meta" jsonb;