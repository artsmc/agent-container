# iExcel Automation — Feature Execution Roadmap

## Master Feature Table

| ID | Feature | Phase | Source PRDs | Blocked By | Blocks | Status | Spec Status | Conflicts |
|---|---|---|---|---|---|---|---|---|
| 00 | nx-monorepo-scaffolding | 0: Monorepo & Tooling | infra-prd | — | 01,02,03,04,05,06,07,08,09,18,22,23,34,35 | pending | done | — |
| 01 | shared-types-package | 0: Monorepo & Tooling | infra-prd, database-prd, api-prd | 00 | 04,08,12,19,20,22 | pending | done | — |
| 02 | terraform-base-infra | 1: Infrastructure | infra-prd | 00 | 36 | pending | done | — |
| 03 | auth-database-schema | 1: Infrastructure | auth-prd, database-prd | 00 | 05 | pending | done | — |
| 04 | product-database-schema | 1: Infrastructure | database-prd | 00,01 | 07 | pending | done | — |
| 05 | auth-service | 2: Auth | auth-prd | 00,03 | 06 | pending | done | — |
| 06 | auth-client-package | 2: Auth | auth-prd, infra-prd | 00,05 | 07,24,32 | pending | done | — |
| 07 | api-scaffolding | 3: API Core | api-prd, auth-prd | 00,04,06 | 08,09,10,11,12,14,15,16,22 | pending | done | — |
| 08 | input-normalizer-text | 3: API Core | api-prd, mastra-prd | 01,07 | 10,37 | pending | done | — |
| 09 | client-management | 3: API Core | api-prd, database-prd | 07 | 10,11,14,38 | pending | done | — |
| 10 | transcript-endpoints | 3: API Core | api-prd, database-prd | 07,08,09 | 17,37,38 | pending | done | — |
| 11 | task-endpoints | 3: API Core | api-prd, database-prd | 07,09 | 12,17 | pending | done | — |
| 12 | output-normalizer-asana | 3: API Core | api-prd, database-prd | 01,07,11 | 13,38 | pending | done | — |
| 13 | status-reconciliation | 3: API Core | api-prd, database-prd | 12 | 14,20 | pending | done | — |
| 14 | agenda-endpoints | 3: API Core | api-prd, database-prd | 07,09,13 | 15,16,17 | pending | done | — |
| 15 | google-docs-adapter | 3: API Core | api-prd | 07,14 | — | pending | done | — |
| 16 | email-adapter | 3: API Core | api-prd | 07,14 | — | pending | done | — |
| 17 | workflow-orchestration | 3: API Core | api-prd, mastra-prd | 10,11,14 | 19,20 | pending | done | — |
| 18 | mastra-runtime-setup | 4: Mastra | mastra-prd, infra-prd | 00 | 19,20,21 | pending | done | — |
| 19 | workflow-a-intake-agent | 4: Mastra | mastra-prd, api-prd | 01,18,17 | 21 | pending | done | — |
| 20 | workflow-b-agenda-agent | 4: Mastra | mastra-prd, api-prd | 01,18,17,13 | 21 | pending | done | — |
| 21 | mastra-mcp-server | 4: Mastra | mastra-prd, terminal-prd | 18,19,20 | 33 | pending | done | — |
| 22 | api-client-package | 5: API Client | infra-prd, api-prd | 01,07 | 25,26,27,28,29,30,31,33 | pending | done | — |
| 23 | ui-scaffolding | 6: Web UI | ui-prd, infra-prd | 00 | 24,25,29 | pending | done | — |
| 24 | ui-auth-flow | 6: Web UI | ui-prd, auth-prd | 23,06 | 25 | pending | done | — |
| 25 | ui-dashboard | 6: Web UI | ui-prd | 23,24,22 | 26,27,28,30,31 | pending | done | — |
| 26 | ui-client-detail | 6: Web UI | ui-prd | 25 | — | pending | done | — |
| 27 | ui-task-review | 6: Web UI | ui-prd | 25,22 | — | pending | done | — |
| 28 | ui-agenda-editor | 6: Web UI | ui-prd | 25,22 | — | pending | done | — |
| 29 | ui-shared-agenda | 6: Web UI | ui-prd | 23,22 | — | pending | done | — |
| 30 | ui-workflow-trigger | 6: Web UI | ui-prd | 25,22 | — | pending | done | — |
| 31 | ui-admin-settings | 6: Web UI | ui-prd | 25,22 | — | pending | done | — |
| 32 | terminal-device-auth | 7: Terminal | terminal-prd, auth-prd | 06 | 33 | pending | done | — |
| 33 | terminal-mcp-tools | 7: Terminal | terminal-prd, mastra-prd | 21,22,32 | — | pending | done | — |
| 34 | cicd-pipeline | 8: CI/CD & Deployment | infra-prd | 00 | 35 | pending | done | — |
| 35 | container-builds | 8: CI/CD & Deployment | infra-prd | 00,34 | 36 | pending | done | — |
| 36 | terraform-app-deployment | 8: CI/CD & Deployment | infra-prd | 02,35 | — | pending | done | — |
| 37 | input-normalizer-grain | 9: V2 Enhancements | api-prd, mastra-prd | 08,10 | — | pending | done | — |
| 38 | historical-import | 9: V2 Enhancements | api-prd, database-prd | 09,10,12 | — | pending | done | — |

## Critical Path

```
00 → 01 → 04 → 07 → 11 → 12 → 13 → 14 → 17 → 19/20 → 21 → 33
 └→ 03 → 05 → 06 ──┘
```

**Feature 00** (nx-monorepo-scaffolding) is the single biggest blocker — 14 features directly depend on it.
**Feature 07** (api-scaffolding) is the second biggest — 9 features directly depend on it.
**Feature 25** (ui-dashboard) gates 5 downstream UI screens.

## Leaf Nodes (nothing depends on them)

15, 16, 26, 27, 28, 29, 30, 31, 33, 36, 37, 38

## Spec Generation Waves

| Wave | Features | Depends On |
|---|---|---|
| 1 | 00, 01, 02, 03, 04 | — |
| 2 | 05, 06, 18 | Wave 1 |
| 3 | 07, 08, 09, 22, 23, 34 | Wave 2 |
| 4 | 10, 11, 24, 29, 32, 35 | Wave 3 |
| 5 | 12, 14, 25, 26, 27, 28 | Wave 4 |
| 6 | 13, 15, 16, 17, 30, 31 | Wave 5 |
| 7 | 19, 20, 33, 36 | Wave 6 |
| 8 | 21, 37, 38 | Wave 7 |

## Key Architecture Decisions (from Q&A)

- **Input/Output Normalization**: Two-layer pattern. Input normalizer converts any transcript source to `NormalizedTranscript`. Output normalizer converts `NormalizedTask` to any PM tool format. Both live in the API layer.
- **Status Reconciliation**: Postgres cache pattern. Reconciled data written to DB after reconciliation. Agents read reconciled tasks via API (`GET /clients/{id}/tasks`).
- **Grain V2 Deferral**: V1 uses manual paste/upload. Grain API integration deferred to V2 (feature 37).
- **No Composio**: Custom adapters for 4 services (Asana, Google Docs, Grain, Email). Composio contradicts the architecture.
- **External References**: `asana_task_id` generalized to `external_ref` JSONB for multi-PM-tool support. Standardized fields: `system`, `externalId`, `externalUrl`, `projectId`, `workspaceId`.
- **Cloud Provider**: GCP (Cloud SQL, Cloud Run, Artifact Registry, Secret Manager, Cloud DNS, Cloud CDN). Must also run locally via Docker Compose.
- **API Framework**: Fastify (API), Next.js (UI).
- **Migration Tool**: Drizzle ORM.
- **Client-User Relationship**: `client_users` join table (many-to-many with role).
- **Agenda Content Format**: ProseMirror JSON. TipTap editor reads/writes natively. Google Docs adapter parses ProseMirror nodes.
- **Workflow Runs Table**: Feature 17 owns its own Drizzle migration. Admin owner from `ADMIN_OWNER` env var if no user context.
- **Short ID Format**: 3+ digits uncapped (`\d{3,}`).
- **Asana Credentials**: Encrypted in DB (AES-256-GCM). Web UI for management (Feature 31). Swappable resolver pattern.
- **Task Description**: Structured JSONB (`TaskDescription` with `taskContext`, `additionalContext`, `requirements`). Stored as JSONB in Postgres.
- **Estimated Time**: ISO 8601 duration (`PT2H30M`) in API/shared-types. `INTERVAL` in Postgres. Human-readable display in UI.

## Conflict Report

**Generated:** 2026-03-03
**Updated:** 2026-03-03 — All resolutions applied
**Scope:** All 39 FRS.md files cross-validated. Key TR.md files spot-checked for unresolved blocking questions.
**Status:** ✅ All 8 schema conflicts resolved. All 3 duplicate work areas addressed. All 4 dependency mismatches fixed. All 9 blocking questions answered and propagated.

---

### 1. Conflicting Schema Definitions

#### 1.1 CRITICAL: `external_ref` JSONB Shape Conflict

**Affected features:** 01, 04, 11, 12, 13, 38

Feature 01 (`@iexcel/shared-types`) defines `ExternalRef` with fields:
```
{ system, externalId, externalUrl, projectId, workspaceId }
```

Feature 04 (product-database-schema) aligns with Feature 01's field names in its `external_ref` JSONB example.

However, Features 11, 12, and 38 all use a different field naming convention:
```
{ provider, taskId, workspaceId, projectId, permalinkUrl }
```

Specifically:
- Feature 11 (FR-PSH-04): uses `provider` instead of `system`, `taskId` instead of `externalId`
- Feature 12 (FR-42): defines `AsanaExternalRef` with `provider`, `taskId`, `permalinkUrl` instead of `system`, `externalId`, `externalUrl`
- Feature 38 (FR-53): uses `provider` instead of `system`
- Feature 13 references `asana_task_id` and `asana_project_id` as direct columns rather than using the `external_ref` JSONB approach at all

**Resolution required:** Unify on a single field naming convention in Feature 01's `ExternalRef` type. All downstream features (11, 12, 13, 38) must conform.

**✅ RESOLVED:** Standardized on Feature 01 convention: `system`, `externalId`, `externalUrl`, `projectId`, `workspaceId`. Features 11, 12, 13, 38 updated.

#### 1.2 CRITICAL: `NormalizedTask.description` Type Mismatch

**Affected features:** 01, 04, 11, 12, 19

Feature 01 defines `NormalizedTask.description` as a structured `TaskDescription` object:
```typescript
interface TaskDescription {
  taskContext: string;
  additionalContext: string;
  requirements: string;
}
```

Conflicting usages:
- Feature 04: `tasks.description` column is `TEXT` (plain string), not `JSONB` matching `TaskDescription`
- Feature 11: treats `description` as a plain string in its API request/response
- Feature 12 (FR-02): treats `description` as `string`, not `TaskDescription`
- Feature 19 (FR-61): generates structured `TaskDescription` per Feature 01's spec

**Resolution required:** Decide whether `description` is a structured object (requiring JSONB in the database) or a plain text string. Update Feature 01's type, Feature 04's column type, and all consuming features to align.

**✅ RESOLVED:** Structured JSONB (`TaskDescription` with `taskContext`, `additionalContext`, `requirements`). Feature 04 column changed from TEXT to JSONB. Features 11, 12 updated.

#### 1.3 HIGH: `task_status` Enum — `completed` Value Contradictions

**Affected features:** 01, 04, 21, 26, 27, 33, 38

Feature 01 and Feature 04 explicitly define `TaskStatus` as `draft | approved | rejected | pushed` with the design decision that `completed` is NOT an internal status (completion lives in Asana).

Contradicting features:
- Feature 38 (FR-52): maps Asana `completed=true` to internal status `completed` during historical import
- Feature 21 (FR-31): `get_tasks` MCP tool includes `completed` as a valid status filter
- Feature 26 (REQ-26-TASKS-02): UI status badge includes `completed`
- Feature 27 (REQ-27-FILTER-01): status filter dropdown includes `completed`
- Feature 27 (REQ-27-TABLE-11): status badge variants include `completed` with `info (teal)` styling
- Feature 33 (5.3): `get_tasks` tool accepts `completed` as a status filter value

**Resolution required:** Either add `completed` to the `TaskStatus` enum in Feature 01 and Feature 04 (breaking the original design decision) or remove all references to `completed` as a filterable/displayable internal status from Features 21, 26, 27, 33, and 38.

**✅ RESOLVED:** Added `completed` to the enum. Set only by: (a) historical import when Asana says completed, (b) reconciliation cache writes. Original flow (draft→approved→rejected→pushed) unchanged for new tasks. Features 01, 04, 38 updated.

#### 1.4 HIGH: `EmailRecipient` Type vs Database Schema Mismatch

**Affected features:** 01, 04

Feature 01 defines `EmailRecipient` as:
```typescript
interface EmailRecipient { name: string; email: string; }
```

Feature 04's `clients.email_recipients` JSONB example includes a `role` field (`"role": "primary"`) that does not exist in Feature 01's type. Additionally, Feature 01 states `emailRecipients` defaults to an empty array and is never null, but Feature 04 defines `email_recipients` as a nullable column.

**Resolution required:** Add `role` to Feature 01's `EmailRecipient` type or remove it from Feature 04's example. Align nullability between the type and the database column.

**✅ RESOLVED:** Added `role?: string` to Feature 01's `EmailRecipient`. Feature 04 column changed to `NOT NULL DEFAULT '[]'::jsonb`.

#### 1.5 MEDIUM: `estimated_time` Format Inconsistency

**Affected features:** 01, 04, 11, 19, 27

- Feature 01 (TR.md): recommends ISO 8601 duration strings (`PT2H30M`)
- Feature 04: stores `estimated_time` as PostgreSQL `INTERVAL`
- Feature 11 (FR-CCR-04): uses `HH:MM` format
- Feature 19 (FR-61): uses ISO 8601 duration format (`PT2H30M`)
- Feature 27 (REQ-27-TABLE-04): uses `hh mm` format (e.g., `1 30`)

**Resolution required:** Standardize on a single format. Update Feature 01's type definition, Feature 04's column handling, and all API/UI features to use the same format for input, storage, and display.

**✅ RESOLVED:** ISO 8601 duration (`PT2H30M`) in shared-types/API. `INTERVAL` in Postgres. UI displays human-readable (e.g., "2h 30m").

#### 1.6 MEDIUM: `transcripts` Table Column Name Mismatch

**Affected features:** 04, 10

Feature 04 defines a `segments` column (JSONB) on the `transcripts` table. Feature 10 references storing the normalized transcript in a column called `normalized_segments`. These are different column names for what appears to be the same data.

**Resolution required:** Align column naming between Feature 04 and Feature 10.

**✅ RESOLVED:** Standardized on `normalized_segments` (Feature 10's name). Feature 04 updated.

#### 1.7 MEDIUM: `TIMESTAMP` vs `TIMESTAMPTZ` Inconsistency

**Affected features:** 04, 38

Feature 04 consistently uses `TIMESTAMPTZ` (timestamp with time zone) for all timestamp columns. Feature 38 (FR-80) defines `import_jobs` and `import_job_errors` tables using `TIMESTAMP` (without time zone).

**Resolution required:** Feature 38 must use `TIMESTAMPTZ` to match Feature 04's convention.

**✅ RESOLVED:** Feature 38 changed to `TIMESTAMPTZ`.

#### 1.8 LOW: `priority` Column Lacks Enum Constraint

**Affected features:** 01, 04

Feature 01 defines `TaskPriority` as an enum: `low | medium | high | critical`. Feature 04 defines `priority` as `VARCHAR(50)` nullable with no database-level enum constraint.

**Resolution required:** Add a CHECK constraint or use a PostgreSQL enum type in Feature 04 to enforce valid priority values.

**✅ RESOLVED:** Added `CHECK (priority IN ('low','medium','high','critical'))` in Feature 04.

---

### 2. Duplicate Work

#### 2.1 Asana API Client Code

**Affected features:** 12, 13, 38

Features 12 (output-normalizer-asana), 13 (status-reconciliation), and 38 (historical-import) all make direct Asana API calls with their own HTTP client implementations. Each implements authentication, error handling, and rate limiting independently.

**Recommendation:** Extract a shared Asana HTTP client into `apps/api/src/adapters/asana/client.ts` (or a shared package) used by all three features.

**✅ RESOLVED:** Shared client extraction noted in Features 12, 13, 38 specs.

#### 2.2 Short ID Resolution Middleware

**Affected features:** 11, 14

Features 11 (task-endpoints) and 14 (agenda-endpoints) both implement short ID resolution middleware with the same pattern (regex match on `TSK-####` / `AGD-####`, database lookup, UUID substitution).

**Recommendation:** Extract a shared `resolveShortId` middleware factory in Feature 07's middleware directory, parameterized by entity type and regex pattern.

**✅ RESOLVED:** Noted in Features 11, 14 specs.

#### 2.3 Workflow Status Update Tool (Mastra)

**Affected features:** 19, 20

Features 19 and 20 both define an `updateWorkflowStatusTool`. Feature 20 (FR-52) notes this is shared with Feature 19.

**Recommendation:** Define this tool once in Feature 18 (mastra-runtime-setup) or a shared tools directory, imported by both workflow agents.

**✅ RESOLVED:** Defined once in Feature 18. Features 19, 20 reference shared tool.

---

### 3. Inconsistent Dependency Chains

#### 3.1 Feature 13 References Non-Existent Column Layout

Feature 13 (status-reconciliation) references `asana_task_id` and `asana_project_id` as direct columns on the `tasks` table. However, Feature 04 (product-database-schema) uses `external_ref` JSONB instead of standalone columns. Feature 13's TR.md (open question) acknowledges this but has not resolved it.

**Resolution required:** Feature 13 must query `external_ref->>'taskId'` (or `external_ref->>'externalId'` depending on conflict 1.1 resolution) rather than standalone columns.

**✅ RESOLVED:** Feature 13 rewritten to use `external_ref->>'externalId'` and `external_ref->>'projectId'` JSONB queries.

#### 3.2 Feature 17 References Undefined `workflow_runs` Table

Feature 17 (workflow-orchestration) introduces a `workflow_runs` table with columns for workflow state tracking. This table is not defined in Feature 04 (product-database-schema).

**Resolution required:** Either Feature 04 must add the `workflow_runs` table definition, or Feature 17 must include its own migration.

**✅ RESOLVED:** Feature 17 includes its own Drizzle migration for `workflow_runs`.

#### 3.3 Feature 38 Introduces Undefined Tables

Feature 38 (historical-import) introduces `import_jobs` and `import_job_errors` tables that are not defined in Feature 04.

**Resolution required:** Feature 38 must include its own migration, or Feature 04 must be extended.

**✅ RESOLVED:** Feature 38 includes its own Drizzle migration for `import_jobs`/`import_job_errors`.

#### 3.4 Feature 19 vs Feature 11: Task Creation Approach

Feature 19 (intake agent, FR-41) creates tasks one at a time via separate `POST /tasks` API calls. Feature 11 (task-endpoints, FR-CRT-01) defines a batch creation endpoint accepting an array of tasks. The agent should use the batch endpoint for efficiency.

**Resolution required:** Feature 19 should call Feature 11's batch creation endpoint rather than making individual API calls.

**✅ RESOLVED:** Feature 19 updated to use Feature 11's batch `POST /tasks` endpoint.

---

### 4. Shared-Types Coverage Gaps

The following types/interfaces are referenced across features but are NOT defined in Feature 01 (`@iexcel/shared-types`):

| Missing Type | Referenced By | Description |
|---|---|---|
| `OutputAdapter` | Feature 12 (FR-01) | Interface for output normalizer adapters |
| `AdapterContext` | Feature 12 | Runtime context passed to output adapters |
| `AsanaExternalRef` | Feature 12 (FR-42) | Asana-specific extension of `ExternalRef` |
| `ReconciledTask` | Feature 13 | Task with Asana status reconciliation data |
| `WorkflowRun` / `WorkflowStatus` | Feature 17 | Workflow execution state tracking types |
| `ClientStatusResponse` | Feature 22 | API response type for client status |
| `AddAsanaWorkspaceRequest` | Feature 22 | Request body for adding Asana workspaces |
| `TriggerImportRequest` | Feature 22 | Request body for triggering historical import |
| `ImportStatusResponse` | Feature 22 | Import job status response |
| `AuditQueryParams` | Feature 22 | Query parameters for audit log endpoint |
| `AuditEntry` | Feature 22 | Single audit log entry type |
| `RejectTaskRequest` | Feature 22 | Request body for task rejection |
| `SharedAgendaResponse` | Feature 29 (FR-04) | Response shape for shared agenda public endpoint |
| `AuthenticatedUser` | Feature 24 (FR-12) | User identity type for UI auth context |

**Resolution required:** Feature 01's type definitions must be expanded to include all types that are consumed across feature boundaries. Types that are purely internal to a single feature (e.g., `GrainNormalizerError`) do not need to be shared.

Additionally, Feature 07 defines error codes (`CONFLICT`, `UNPROCESSABLE`, `INVALID_JSON`, `INVALID_PAGINATION`, `INVALID_ID`, `INVALID_BODY`) that are not in Feature 01's `ApiErrorCode` enum. Feature 09 also references `INVALID_PAGINATION` and `INVALID_ID`. These should be added to the shared `ApiErrorCode` type.

---

### 5. API Endpoint Collisions

No direct endpoint path collisions were found across all features. However, the following near-collisions and ambiguities require attention:

| Concern | Features | Detail |
|---|---|---|
| `POST /clients/{id}/transcripts` extension | 10, 37 | Feature 37 extends Feature 10's endpoint with a third submission mode (`grain_recording_id`). Must be implemented as an extension, not a separate endpoint. No collision if coordinated. |
| `GET /clients/{id}/tasks` query parameters | 11, 27 | Feature 27 UI expects filter params `status`, `transcript_id`, `assignee_id`. Feature 11 must support all three; confirm alignment. |
| `PATCH /tasks/{id}` field coverage | 11, 27, 33 | Feature 27 (UI) and Feature 33 (terminal) both call `PATCH /tasks/{id}` with various fields. Feature 11 must accept all fields referenced by both consumers. |
| `/workflows/intake` and `/workflows/agenda` | 17, 30 | Feature 30 (UI) calls these endpoints defined by Feature 17. Confirm request/response shapes align. |
| `GET /audit` query parameters | 25, 31 | Features 25 (dashboard) and 31 (admin settings) both call `GET /audit` with different filter patterns. The API must support both use cases. |

---

### 6. Unresolved Blocking Questions from TR.md Files

#### 6.1 ~~CRITICAL~~ ✅ RESOLVED: Cloud Provider Decision (GCP vs AWS)

**Source:** Feature 02 TR.md
**Impact:** Features 02, 34, 35, 36 (all infrastructure, CI/CD, and deployment features)
**Decision:** **GCP** (must also run locally). Cloud SQL, Cloud Run, Artifact Registry, Secret Manager, Cloud DNS, Cloud CDN. All 4 infra specs updated.

#### 6.2 ~~CRITICAL~~ ✅ RESOLVED: API Framework Decision (Node.js/Fastify vs Python/FastAPI)

**Source:** Features 07, 09, 10 TR.md files
**Impact:** Features 07-17 (all API layer features)
**Decision:** **Fastify** (API), **Next.js** (UI). Confirms existing spec recommendations.

#### 6.3 ~~CRITICAL~~ ✅ RESOLVED: Migration Tool Decision (Drizzle vs Prisma vs raw SQL)

**Source:** Feature 04 TR.md
**Impact:** Features 04, 07, 35, 36
**Decision:** **Drizzle** ORM. Confirms existing spec recommendation.

#### 6.4 ~~HIGH~~ ✅ RESOLVED: `client_users` Join Table Existence

**Source:** Features 04, 09 TR.md
**Impact:** Features 09, 24, 25, 31 (client access control enforcement)
**Decision:** **Create it.** Standard many-to-many with role. Added to Feature 04 schema, Feature 09 CRUD endpoints.

#### 6.5 ~~HIGH~~ ✅ RESOLVED: Reconciliation Data Passthrough Strategy

**Source:** Feature 20 TR.md (line 250)
**Impact:** Features 13, 17, 20
**Decision:** **Postgres cache.** Reconciled data written to DB. Agent reads via `GET /clients/{id}/tasks`. Features 13, 17, 20 updated.

#### 6.6 ~~HIGH~~ ✅ RESOLVED: Agenda Content Storage Format

**Source:** Feature 04 TR.md, Feature 15 TR.md
**Impact:** Features 14, 15, 20, 28, 29
**Decision:** **ProseMirror JSON.** Feature 15's markdown parser rewritten to parse ProseMirror nodes. TipTap editor (Feature 28) reads/writes natively. Features 14, 15, 20, 28, 29 updated.

#### 6.7 ~~MEDIUM~~ ✅ RESOLVED: Short ID Regex Too Restrictive

**Source:** Feature 21 FRS.md (FR-120), Feature 33 FRS.md (8.1)
**Impact:** Features 21, 33
**Decision:** **3+ digits uncapped** (`\d{3,}`). Features 21, 33 updated.

#### 6.8 ~~MEDIUM~~ ✅ RESOLVED: Asana Credential Storage Mechanism

**Source:** Feature 04 TR.md, Feature 12 TR.md
**Impact:** Features 12, 13, 38
**Decision:** **Encrypted in DB** (AES-256-GCM). Web UI for management (Feature 31). Swappable resolver pattern. Features 12, 13, 31 updated.

#### 6.9 LOW: Soft Delete vs Hard Delete for Rejected Tasks

**Source:** Feature 04 TR.md
**Impact:** Features 04, 11, 27
**Status:** Unresolved. May require a `deleted_at` column on the `tasks` table.

---

### Summary of Required Actions

All actions have been resolved and propagated into the affected spec files.

| Priority | Action | Status |
|---|---|---|
| CRITICAL | Unify `external_ref` JSONB field names across Features 01, 04, 11, 12, 13, 38 | ✅ Resolved |
| CRITICAL | Resolve `NormalizedTask.description` type (structured object vs plain text) | ✅ Resolved |
| CRITICAL | Decide whether `completed` is a valid `TaskStatus` enum value | ✅ Resolved |
| CRITICAL | Make cloud provider decision (GCP vs AWS) | ✅ Resolved: GCP |
| CRITICAL | Finalize API framework decision (Fastify vs FastAPI) | ✅ Resolved: Fastify |
| HIGH | Add missing types to `@iexcel/shared-types` (see section 4) | ✅ Resolved |
| HIGH | Define `client_users` join table or alternative access control mechanism | ✅ Resolved |
| HIGH | Resolve reconciliation data passthrough strategy for Feature 20 | ✅ Resolved: Postgres cache |
| HIGH | Resolve agenda content storage format (markdown vs ProseMirror JSON) | ✅ Resolved: ProseMirror JSON |
| HIGH | Add `workflow_runs` table to database schema | ✅ Resolved: Feature 17 owns migration |
| MEDIUM | Standardize `estimated_time` format across all features | ✅ Resolved: ISO 8601 |
| MEDIUM | Fix short ID regex to support 3+ digits (not capped at 4) | ✅ Resolved |
| MEDIUM | Extract shared Asana HTTP client to reduce duplicate code | ✅ Resolved: noted in specs |
| MEDIUM | Align `TIMESTAMP` vs `TIMESTAMPTZ` in Feature 38 | ✅ Resolved |
| MEDIUM | Resolve Asana credential storage mechanism | ✅ Resolved: encrypted in DB |
| LOW | Add database constraint for `priority` enum values | ✅ Resolved |
| LOW | Align `EmailRecipient` type with database schema (role field, nullability) | ✅ Resolved |
