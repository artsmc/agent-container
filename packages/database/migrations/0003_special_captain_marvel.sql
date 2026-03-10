CREATE TYPE "public"."device_session_status" AS ENUM('pending', 'complete', 'expired');--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_fingerprint" varchar(64) NOT NULL,
	"user_code" varchar(8) NOT NULL,
	"status" "device_session_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"token_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(12) NOT NULL,
	"device_fingerprint" varchar(64),
	"label" varchar(255),
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_token_id_device_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."device_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_device_sessions_status" ON "device_sessions" USING btree ("status") WHERE "device_sessions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_device_sessions_user_code" ON "device_sessions" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_token_hash" ON "device_tokens" USING btree ("token_hash");