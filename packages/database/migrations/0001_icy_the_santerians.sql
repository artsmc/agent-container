CREATE TYPE "public"."client_match_status" AS ENUM('matched', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."integration_platform" AS ENUM('fireflies', 'grain');--> statement-breakpoint
CREATE TYPE "public"."integration_session_status" AS ENUM('pending', 'complete', 'expired');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'expired', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."transcript_format" AS ENUM('srt', 'turnbased', 'raw');--> statement-breakpoint
CREATE TABLE "integration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "integration_platform" NOT NULL,
	"status" "integration_session_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "integration_platform" NOT NULL,
	"label" varchar(255),
	"credentials_encrypted" "bytea" NOT NULL,
	"credentials_iv" "bytea" NOT NULL,
	"status" "integration_status" DEFAULT 'connected' NOT NULL,
	"webhook_id" varchar(255),
	"webhook_url" varchar(500),
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"raw_text" text,
	"format" "transcript_format",
	"normalized" jsonb,
	"enrichment_status" "enrichment_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"highlights" jsonb,
	"action_items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "source_platform" varchar(50);--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "platform_recording_id" varchar(255);--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "client_match_status" "client_match_status";--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_sessions" ADD CONSTRAINT "integration_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_versions" ADD CONSTRAINT "transcript_versions_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_integration_sessions_user_status" ON "integration_sessions" USING btree ("user_id","status") WHERE "integration_sessions"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_integrations_user_platform" ON "integrations" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "idx_integrations_user_id" ON "integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_integrations_status" ON "integrations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transcript_versions_transcript_version" ON "transcript_versions" USING btree ("transcript_id","version");--> statement-breakpoint
CREATE INDEX "idx_transcript_versions_enrichment" ON "transcript_versions" USING btree ("enrichment_status") WHERE "transcript_versions"."enrichment_status" IN ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "idx_transcripts_platform_recording" ON "transcripts" USING btree ("source_platform","platform_recording_id") WHERE "transcripts"."source_platform" IS NOT NULL;