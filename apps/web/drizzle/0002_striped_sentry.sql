ALTER TABLE "keys" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "keys" ADD CONSTRAINT "keys_parent_id_keys_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keys_parent_idx" ON "keys" USING btree ("parent_id");