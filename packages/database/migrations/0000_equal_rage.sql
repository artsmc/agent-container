CREATE TYPE "public"."agenda_status" AS ENUM('draft', 'in_review', 'finalized', 'shared');--> statement-breakpoint
CREATE TYPE "public"."call_type" AS ENUM('client_call', 'intake', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."edit_source" AS ENUM('agent', 'ui', 'terminal');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('draft', 'approved', 'rejected', 'pushed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'account_manager', 'team_member');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_type" AS ENUM('intake', 'agenda');--> statement-breakpoint
CREATE TABLE "agenda_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agenda_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb,
	"edited_by" uuid,
	"source" "edit_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" varchar(20) NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "agenda_status" DEFAULT 'draft' NOT NULL,
	"content" jsonb,
	"cycle_start" date,
	"cycle_end" date,
	"shared_url_token" varchar(128),
	"internal_url_token" varchar(128),
	"google_doc_id" varchar(255),
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"is_imported" boolean DEFAULT false NOT NULL,
	"imported_at" timestamp with time zone,
	"import_source" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agendas_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "agendas_shared_url_token_unique" UNIQUE("shared_url_token"),
	CONSTRAINT "agendas_internal_url_token_unique" UNIQUE("internal_url_token"),
	CONSTRAINT "chk_cycle_dates" CHECK ("agendas"."cycle_end" IS NULL OR "agendas"."cycle_start" IS NULL OR "agendas"."cycle_end" >= "agendas"."cycle_start")
);
--> statement-breakpoint
CREATE TABLE "asana_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asana_workspace_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"access_token_ref" varchar(500) NOT NULL,
	"custom_field_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb,
	"source" "edit_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"grain_playlist_id" varchar(255),
	"default_asana_workspace_id" varchar(255),
	"default_asana_project_id" varchar(255),
	"email_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"source_id" varchar(500) NOT NULL,
	"error_code" varchar(100) NOT NULL,
	"error_message" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "import_job_status" DEFAULT 'pending' NOT NULL,
	"grain_playlist_id" varchar(500),
	"asana_project_id" varchar(255),
	"asana_workspace_id" varchar(255),
	"reprocess_transcripts" boolean DEFAULT false NOT NULL,
	"call_type_override" varchar(50),
	"transcripts_total" integer,
	"transcripts_imported" integer DEFAULT 0 NOT NULL,
	"tasks_total" integer,
	"tasks_imported" integer DEFAULT 0 NOT NULL,
	"agendas_total" integer,
	"agendas_imported" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" jsonb,
	"estimated_time" interval,
	"edited_by" uuid,
	"source" "edit_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" varchar(20) NOT NULL,
	"client_id" uuid NOT NULL,
	"transcript_id" uuid,
	"status" "task_status" DEFAULT 'draft' NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" jsonb,
	"assignee" varchar(255),
	"estimated_time" interval,
	"scrum_stage" varchar(100) DEFAULT 'Backlog' NOT NULL,
	"external_ref" jsonb,
	"priority" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"due_date" date,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"is_imported" boolean DEFAULT false NOT NULL,
	"imported_at" timestamp with time zone,
	"import_source" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "chk_tasks_priority" CHECK ("tasks"."priority" IN ('low', 'medium', 'high', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"grain_call_id" varchar(255),
	"call_type" "call_type" NOT NULL,
	"call_date" timestamp with time zone NOT NULL,
	"raw_transcript" text,
	"normalized_segments" jsonb,
	"processed_at" timestamp with time zone,
	"is_imported" boolean DEFAULT false NOT NULL,
	"imported_at" timestamp with time zone,
	"import_source" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'team_member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" "workflow_type" NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"input_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" jsonb,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agenda_versions" ADD CONSTRAINT "agenda_versions_agenda_id_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."agendas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_versions" ADD CONSTRAINT "agenda_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_errors" ADD CONSTRAINT "import_job_errors_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agenda_versions_agenda_version" ON "agenda_versions" USING btree ("agenda_id","version");--> statement-breakpoint
CREATE INDEX "idx_agendas_client_status" ON "agendas" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_agendas_shared_token" ON "agendas" USING btree ("shared_url_token") WHERE "agendas"."shared_url_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user_date" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_users_client_user" ON "client_users" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_import_job_errors_job_id" ON "import_job_errors" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_client_id" ON "import_jobs" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("status") WHERE "import_jobs"."status" IN ('pending', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_task_versions_task_version" ON "task_versions" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "idx_tasks_client_status" ON "tasks" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_transcript_id" ON "tasks" USING btree ("transcript_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_client_asana_imported" ON "tasks" USING btree ("client_id") WHERE "tasks"."is_imported" = true;--> statement-breakpoint
CREATE INDEX "idx_transcripts_client_date" ON "transcripts" USING btree ("client_id","call_date");--> statement-breakpoint
CREATE INDEX "idx_transcripts_client_grain_imported" ON "transcripts" USING btree ("client_id","grain_call_id") WHERE "transcripts"."is_imported" = true;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workflow_runs_active_run_idx" ON "workflow_runs" USING btree ("client_id","workflow_type","status") WHERE "workflow_runs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "workflow_runs_client_id_idx" ON "workflow_runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_stale_idx" ON "workflow_runs" USING btree ("status","updated_at") WHERE "workflow_runs"."status" IN ('pending', 'running');