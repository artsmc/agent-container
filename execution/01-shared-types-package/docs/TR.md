# Technical Requirements
# Feature 01: shared-types-package

## 1. Implementation Strategy

### 1.1 Approach

This package is pure TypeScript type definitions with no runtime code. The implementation strategy is:

1. Create the `project.json` Nx configuration for the `shared-types` library
2. Create the `package.json` (types-only, no main entry point)
3. Create the `tsconfig.json` and `tsconfig.lib.json` (extending root, declaration-only emit)
4. Author each type module (`task.ts`, `agenda.ts`, `client.ts`, `auth.ts`, `transcript.ts`, `api.ts`)
5. Author the `index.ts` barrel export
6. Validate with `tsc --noEmit` to confirm zero errors under strict settings
7. Register the path alias in the root `tsconfig.base.json`

There is no build artifact that needs to be deployed or published. The package is consumed via TypeScript path aliases directly from source during development and via generated `.d.ts` files during CI type checking.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript | Strict mode; version pinned to workspace root |
| Build executor | `@nx/js:tsc` | Declaration-only emit |
| Monorepo integration | Nx | Library project type; tagged for dependency tracking |
| Type checking | `tsc --noEmit` | Used in CI lint/type-check step |
| No test framework needed | — | Types are verified by the compiler; no runtime behavior to test |

### 1.3 Module File Map

```
packages/shared-types/
├── src/
│   ├── task.ts          # Task lifecycle types
│   ├── agenda.ts        # Agenda lifecycle types
│   ├── client.ts        # Client config types
│   ├── auth.ts          # OIDC token and user identity types
│   ├── transcript.ts    # Transcript normalization types
│   ├── api.ts           # API request/response contracts
│   └── index.ts         # Barrel re-export
├── package.json
├── project.json
├── tsconfig.json
└── tsconfig.lib.json
```

---

## 2. File Specifications

### 2.1 project.json

```json
{
  "name": "shared-types",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "library",
  "sourceRoot": "packages/shared-types/src",
  "tags": ["scope:shared", "type:util"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/shared-types",
        "tsConfig": "packages/shared-types/tsconfig.lib.json",
        "packageJson": "packages/shared-types/package.json",
        "main": "packages/shared-types/src/index.ts",
        "assets": ["packages/shared-types/*.md"]
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p packages/shared-types/tsconfig.json"
      }
    }
  }
}
```

### 2.2 package.json

```json
{
  "name": "@iexcel/shared-types",
  "version": "0.1.0",
  "private": true,
  "description": "Shared TypeScript types for the iExcel automation system",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "keywords": [],
  "license": "UNLICENSED"
}
```

Note: No `main` field — this is a types-only package. No `dependencies` — pure type definitions have no runtime dependencies. The `exports` field points to source for monorepo-internal consumption via path alias.

### 2.3 tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.4 tsconfig.lib.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/packages/shared-types",
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"]
}
```

### 2.5 Root tsconfig.base.json — Path Alias Addition

The root `tsconfig.base.json` must have the following entry added to its `paths` object:

```json
{
  "compilerOptions": {
    "paths": {
      "@iexcel/shared-types": ["packages/shared-types/src/index.ts"]
    }
  }
}
```

This enables all monorepo consumers to import as:
```typescript
import type { NormalizedTask } from '@iexcel/shared-types';
```

---

## 3. Type Module Specifications

### 3.1 task.ts — Full Type Definitions

```typescript
/**
 * Branded string type for task short IDs.
 * Format: TSK-NNNN (e.g., TSK-0001, TSK-0042)
 * Brand prevents accidental plain string assignment.
 */
export type ShortId = string & { readonly __brand: 'ShortId' };

/**
 * Lifecycle statuses for a task.
 * Note: 'completed' is only set by historical import (Feature 38)
 * or reconciliation cache writes (Feature 13). It is never set
 * directly by user actions in the normal task lifecycle.
 */
export enum TaskStatus {
  Draft = 'draft',
  Approved = 'approved',
  Rejected = 'rejected',
  Pushed = 'pushed',
  Completed = 'completed',
}

/**
 * Which consumer created or last edited a task or task version.
 */
export enum TaskSource {
  Agent = 'agent',
  UI = 'ui',
  Terminal = 'terminal',
}

/**
 * Priority level for a task.
 */
export enum TaskPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * Reference to an external project management system.
 * This pattern replaces Asana-specific fields (asana_task_id,
 * asana_workspace_id, asana_project_id) to support multiple PM tools
 * (Asana, Monday.com, Jira, etc.) without schema changes.
 *
 * Stored as JSONB in the tasks table.
 */
export interface ExternalRef {
  /** Identifies the PM system. e.g., "asana", "monday", "jira" */
  system: string;
  /** Task ID in the external system. Null until pushed. */
  externalId: string | null;
  /** Deep link to the task in the external system. Null until pushed. */
  externalUrl: string | null;
  /** Project ID within the workspace. Null if unassigned. */
  projectId: string | null;
  /** Workspace/organization ID in the external system. Null if unassigned. */
  workspaceId: string | null;
}

/**
 * Structured description generated by the Mastra intake agent.
 * All three sections are required — the agent must populate each one.
 * Stored as JSONB in the database (JSONB-compatible structure).
 */
export interface TaskDescription {
  /** Background and purpose of the task. */
  taskContext: string;
  /** Supplementary context from the source transcript. */
  additionalContext: string;
  /** Array of specific deliverables or acceptance criteria. */
  requirements: string[];
}

/**
 * A task in the iExcel system.
 * Primary output of the intake workflow (Workflow A).
 */
export interface NormalizedTask {
  id: string;
  shortId: ShortId;
  clientId: string;
  transcriptId: string | null;
  status: TaskStatus;
  title: string;
  description: TaskDescription;
  assignee: string | null;
  priority: TaskPriority;
  /** ISO 8601 duration string. e.g., "PT2H30M" for 2h 30m. */
  estimatedTime: string | null;
  /** ISO 8601 date string. e.g., "2026-03-15". */
  dueDate: string | null;
  scrumStage: string;
  tags: string[];
  /** Null until the task is pushed to an external PM system. */
  externalRef: ExternalRef | null;
  /** UUID of the user who approved the task. Null until approved. */
  approvedBy: string | null;
  approvedAt: string | null;
  pushedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Immutable snapshot of a task's editable fields at a point in time.
 * Created on every edit. Version 1 is the agent-generated original.
 */
export interface TaskVersion {
  id: string;
  taskId: string;
  version: number;
  title: string;
  description: TaskDescription;
  estimatedTime: string | null;
  /** Null for agent-authored versions. */
  editedBy: string | null;
  source: TaskSource;
  createdAt: string;
}

export interface CreateTaskRequest {
  clientId: string;
  transcriptId?: string;
  title: string;
  description: TaskDescription;
  assignee?: string;
  priority?: TaskPriority;
  estimatedTime?: string;
  dueDate?: string;
  scrumStage?: string;
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: Partial<TaskDescription>;
  assignee?: string;
  priority?: TaskPriority;
  estimatedTime?: string;
  dueDate?: string;
  scrumStage?: string;
  tags?: string[];
}
```

### 3.2 agenda.ts — Full Type Definitions

```typescript
/**
 * Branded string type for agenda short IDs.
 * Format: AGD-NNNN (e.g., AGD-0001)
 * Distinct brand from ShortId prevents cross-assignment.
 */
export type AgendaShortId = string & { readonly __brand: 'AgendaShortId' };

/**
 * Lifecycle statuses for an agenda (Running Notes document).
 */
export enum AgendaStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Finalized = 'finalized',
  Shared = 'shared',
}

export interface Agenda {
  id: string;
  shortId: AgendaShortId;
  clientId: string;
  status: AgendaStatus;
  /** Markdown content of the Running Notes document. */
  content: string;
  /** ISO 8601 date string. e.g., "2026-02-01" */
  cycleStart: string;
  /** ISO 8601 date string. e.g., "2026-02-28" */
  cycleEnd: string;
  /** Null until POST /agendas/{id}/share is called. */
  sharedUrlToken: string | null;
  /** Null until POST /agendas/{id}/share is called. */
  internalUrlToken: string | null;
  /** Null until POST /agendas/{id}/export is called. */
  googleDocId: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaVersion {
  id: string;
  agendaId: string;
  version: number;
  content: string;
  editedBy: string | null;
  source: TaskSource;
  createdAt: string;
}

export interface CreateAgendaRequest {
  clientId: string;
  content: string;
  cycleStart: string;
  cycleEnd: string;
}

export interface UpdateAgendaRequest {
  content?: string;
  cycleStart?: string;
  cycleEnd?: string;
}
```

### 3.3 client.ts — Full Type Definitions

```typescript
export interface EmailRecipient {
  name: string;
  email: string;
  role?: string;
}

export type EmailRecipients = EmailRecipient[];

export interface Client {
  id: string;
  name: string;
  grainPlaylistId: string | null;
  defaultAsanaWorkspaceId: string | null;
  defaultAsanaProjectId: string | null;
  emailRecipients: EmailRecipients;
  createdAt: string;
  updatedAt: string;
}

export interface AsanaWorkspace {
  id: string;
  asanaWorkspaceId: string;
  name: string;
  /**
   * A reference key for the access token stored in the cloud secret manager.
   * This is NOT the token itself — never log or expose this value to clients.
   */
  accessTokenRef: string;
  createdAt: string;
}

export interface UpdateClientRequest {
  name?: string;
  grainPlaylistId?: string;
  defaultAsanaWorkspaceId?: string;
  defaultAsanaProjectId?: string;
  emailRecipients?: EmailRecipients;
}
```

### 3.4 auth.ts — Full Type Definitions

```typescript
export enum UserRole {
  Admin = 'admin',
  AccountManager = 'account_manager',
  TeamMember = 'team_member',
}

/**
 * Claims present in the OIDC ID token issued by apps/auth.
 * The API validates these via the auth service's JWKS endpoint.
 */
export interface OidcTokenClaims {
  /** Issuer URL. e.g., "https://auth.iexcel.com" */
  iss: string;
  /** Subject — the canonical user UUID. */
  sub: string;
  /** Audience. e.g., "iexcel-api" */
  aud: string;
  email: string;
  name: string;
  /** Issued-at timestamp (Unix epoch seconds). */
  iat: number;
  /** Expiry timestamp (Unix epoch seconds). */
  exp: number;
}

/**
 * Lightweight identity extracted from a validated OIDC token.
 * Passed through the API's auth middleware to business logic layers.
 */
export interface UserIdentity {
  sub: string;
  email: string;
  name: string;
}

/**
 * A user record from the product database (not the auth database).
 * Created on first login via just-in-time provisioning.
 * Linked to the auth service via authUserId = OIDC token's "sub" claim.
 */
export interface ProductUser {
  id: string;
  /** The OIDC token's "sub" claim. The link between identity and product permissions. */
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
```

### 3.5 transcript.ts — Full Type Definitions

```typescript
/**
 * Identifies the origin system of a transcript.
 * Union type (not enum) because new sources (Zoom, Teams, etc.)
 * are expected in V2 without requiring an enum update.
 */
export type TranscriptSource = 'grain' | 'manual';

/**
 * The type of meeting from which the transcript was generated.
 * Maps to the database call_type ENUM.
 */
export enum MeetingType {
  ClientCall = 'client_call',
  Intake = 'intake',
  FollowUp = 'follow_up',
}

/**
 * A single speaker segment within a transcript.
 */
export interface TranscriptSegment {
  /** Speaker name or identifier. e.g., "Mark", "Client" */
  speaker: string;
  /** Offset from recording start in seconds. */
  timestamp: number;
  /** Transcribed text for this segment. */
  text: string;
}

/**
 * A standardized transcript regardless of source system.
 * The input normalizer (feature 08) produces this shape.
 * The Mastra intake agent (feature 19) consumes this shape.
 */
export interface NormalizedTranscript {
  source: TranscriptSource;
  /** ID of the recording in the source system. e.g., Grain call ID. */
  sourceId: string;
  /** ISO 8601 datetime string. e.g., "2026-02-15T14:00:00Z" */
  meetingDate: string;
  clientId: string;
  meetingType: MeetingType;
  /** Participant names. Empty array if not known. */
  participants: string[];
  /** Total call duration in seconds. */
  durationSeconds: number;
  /** Ordered transcript segments. Empty array if no segmentation data. */
  segments: TranscriptSegment[];
  /** Optional agent-generated summary. Null if not generated. */
  summary: string | null;
  /** Optional key highlights. Null if not generated. */
  highlights: string[] | null;
}
```

### 3.6 api.ts — Full Type Definitions

```typescript
import type { NormalizedTask, TaskVersion, TaskStatus, CreateTaskRequest, UpdateTaskRequest } from './task';
import type { Agenda, AgendaVersion, CreateAgendaRequest, UpdateAgendaRequest } from './agenda';
import type { Client, EmailRecipients } from './client';
import type { ProductUser } from './auth';
import type { MeetingType } from './transcript';

export enum ApiErrorCode {
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  ClientNotFound = 'CLIENT_NOT_FOUND',
  TaskNotFound = 'TASK_NOT_FOUND',
  AgendaNotFound = 'AGENDA_NOT_FOUND',
  TranscriptNotFound = 'TRANSCRIPT_NOT_FOUND',
  TaskNotApprovable = 'TASK_NOT_APPROVABLE',
  AgendaNotFinalizable = 'AGENDA_NOT_FINALIZABLE',
  PushFailed = 'PUSH_FAILED',
  WorkspaceNotConfigured = 'WORKSPACE_NOT_CONFIGURED',
  ValidationError = 'VALIDATION_ERROR',
  InternalError = 'INTERNAL_ERROR',
  InvalidId = 'INVALID_ID',
  InvalidBody = 'INVALID_BODY',
  InvalidPagination = 'INVALID_PAGINATION',
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// --- Task Contracts ---

export interface GetTasksRequest extends PaginationParams {
  status?: TaskStatus;
  transcriptId?: string;
}

export interface GetTasksResponse extends PaginatedResponse<NormalizedTask> {}

export interface GetTaskResponse {
  task: NormalizedTask;
  versions: TaskVersion[];
}

export interface ApproveTasksRequest {
  taskIds: string[];
}

export interface PushTasksRequest {
  taskIds: string[];
}

export interface BatchOperationResponse {
  succeeded: string[];
  failed: Array<{ id: string; error: ApiError }>;
}

// Re-export request types from task module for convenience
export type { CreateTaskRequest, UpdateTaskRequest };

// --- Agenda Contracts ---

export interface GetAgendasResponse extends PaginatedResponse<Agenda> {}

export interface GetAgendaResponse {
  agenda: Agenda;
  versions: AgendaVersion[];
}

export interface ShareAgendaResponse {
  sharedUrl: string;
  internalUrl: string;
}

export interface EmailAgendaRequest {
  recipients?: EmailRecipients;
}

export interface ExportAgendaResponse {
  googleDocId: string;
  googleDocUrl: string;
}

// Re-export request types from agenda module for convenience
export type { CreateAgendaRequest, UpdateAgendaRequest };

// --- Transcript Contracts ---

export interface SubmitTranscriptRequest {
  clientId: string;
  callType: MeetingType;
  /** ISO 8601 datetime string */
  callDate: string;
  /** Full transcript text. Required if grainCallId is not provided. */
  rawTranscript?: string;
  /** Grain recording ID. Required if rawTranscript is not provided. */
  grainCallId?: string;
}

export interface GetTranscriptResponse {
  id: string;
  clientId: string;
  grainCallId: string | null;
  callType: MeetingType;
  callDate: string;
  rawTranscript: string;
  processedAt: string | null;
  createdAt: string;
}

// --- Workflow Contracts ---

export interface TriggerIntakeWorkflowRequest {
  clientId: string;
  transcriptId: string;
}

export interface TriggerAgendaWorkflowRequest {
  clientId: string;
  /** ISO 8601 date string */
  cycleStart: string;
  /** ISO 8601 date string */
  cycleEnd: string;
}

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStatusResponse {
  id: string;
  status: WorkflowStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

// --- Auth Contracts ---

export interface GetCurrentUserResponse {
  user: ProductUser;
}

// Re-export client types for convenience
export type { Client };
```

### 3.7 index.ts — Barrel Export

```typescript
export * from './task';
export * from './agenda';
export * from './client';
export * from './auth';
export * from './transcript';
export * from './api';
```

---

## 4. Dependencies

### 4.1 Runtime Dependencies

None. This package has zero runtime dependencies. The `package.json` must have no `dependencies` or `peerDependencies` fields.

### 4.2 Development Dependencies

All development dependencies are inherited from the workspace root `package.json`. No package-level devDependencies are needed.

| Tool | Version Constraint | Purpose |
|---|---|---|
| TypeScript | Workspace root version | Compilation and type checking |
| `@nx/js` | Workspace root version | Build executor |

---

## 5. Nx Integration

### 5.1 Tags

The `project.json` must include:
```json
"tags": ["scope:shared", "type:util"]
```

- `scope:shared` — marks this as a package shared across all scopes (apps and other packages)
- `type:util` — marks this as a utility/library package (no UI, no API)

### 5.2 Affected Graph Behavior

When any file in `packages/shared-types/src/` changes, Nx's affected graph will mark these projects as affected:
- `apps/api`
- `apps/mastra`
- `apps/ui`
- `packages/api-client`
- `packages/auth-client`

This means a type change triggers a full rebuild and redeploy of all four containers. This is intentional and expected. Breaking type changes in this package are high-impact and must go through careful PR review.

### 5.3 Lint and Type Check Targets

The CI pipeline runs type checking on every affected project. The `type-check` target in `project.json` runs `tsc --noEmit` to validate types without emitting files. This is the primary quality gate for this package.

---

## 6. Naming Conventions

| Convention | Rule | Example |
|---|---|---|
| Interface names | PascalCase | `NormalizedTask`, `ApiError` |
| Enum names | PascalCase | `TaskStatus`, `UserRole` |
| Enum values | PascalCase | `TaskStatus.Draft`, `UserRole.Admin` |
| Type alias names | PascalCase | `ShortId`, `EmailRecipients` |
| Field names | camelCase | `shortId`, `clientId`, `externalRef` |
| Database to TypeScript mapping | snake_case → camelCase | `short_id` → `shortId`, `client_id` → `clientId` |

---

## 7. Breaking Change Policy

Because `shared-types` is the root dependency of the entire monorepo, any breaking change cascades to all consumers.

**Breaking changes include:**
- Removing a field from an interface
- Narrowing a field type (e.g., `string | null` → `string`)
- Adding a required field to an interface (existing objects will not have it)
- Renaming a type or enum value

**Non-breaking changes include:**
- Adding an optional field (`field?: T`) to an interface
- Widening a field type (e.g., `string` → `string | null`)
- Adding a new enum value (may still require consumer updates)
- Adding a new type, interface, or enum (pure addition)

Breaking changes must be coordinated with all downstream feature owners and tested by running `nx affected:build` to confirm all consumers still compile.

---

## 8. Security Considerations

- This package contains no credentials, secrets, or sensitive values.
- `AsanaWorkspace.accessTokenRef` is intentionally a reference string, not an actual token. JSDoc must reinforce that the actual credential must never be placed in this field.
- `OidcTokenClaims` types the structure of validated tokens; the validation itself is the responsibility of `packages/auth-client` (feature 06).
- No PII is stored in types themselves; only structural definitions.

---

## 9. Performance Considerations

- Zero runtime bundle impact: types are erased at compile time.
- Changing this package triggers CI rebuilds for all four containers, so keeping changes minimal and intentional avoids unnecessary pipeline costs.
- TypeScript's `declarationMap` is enabled to support accurate go-to-definition in IDE tooling across the monorepo.

---

## 10. Migration Strategy for Existing Systems

There is no existing system to migrate — this is a greenfield build. However, the `ExternalRef` pattern is a deliberate forward-compatibility decision. The database PRD defines Asana-specific columns (`asana_task_id`, `asana_workspace_id`, `asana_project_id`). The type system intentionally abstracts these into `ExternalRef`.

When feature 04 (product-database-schema) implements the database schema, it must store external reference data as a JSONB column (`external_ref`) rather than Asana-specific columns, aligning the schema with the type contract defined here.

This is the primary architectural divergence from the raw database PRD and must be clearly communicated to the feature 04 implementer.

---

## 11. Open Technical Questions

| Question | Impact | Recommended Decision |
|---|---|---|
| Should `estimatedTime` use ISO 8601 duration strings (`PT2H30M`) or minutes as a number? | Affects how Mastra agents generate the field and how the UI displays it | ISO 8601 duration string is preferred for unambiguous serialization; the UI displays human-friendly |
| Should the database schema align with `ExternalRef` (JSONB) or keep the Asana-specific columns? | If the DB keeps Asana columns, the API layer must translate; if JSONB, the type and DB align | JSONB is preferred to match the type contract; requires coordination with feature 04 |
| Should `exactOptionalPropertyTypes` be enabled? | Stricter optional handling; prevents assigning `undefined` to optional fields | Recommended: yes, to ensure strict distinction between absent and explicitly undefined |
| Should `NormalizedTask` include a `sourceVersion` field linking to the specific `TaskVersion` that was approved? | Useful for audit; adds complexity | Defer to feature 11 implementer |
