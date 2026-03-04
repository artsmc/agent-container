# Technical Requirements
# Feature 13: Status Reconciliation

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Implementation Strategy

### 1.1 Approach

The status reconciliation function is a new module within the existing Asana adapter directory established by Feature 12. It sits in `apps/api/src/adapters/asana/` alongside the push adapter sub-modules from Feature 12. It reuses the `asana-client.ts` HTTP wrapper (or extends it with a new `fetchProjectTasks` function) and the workspace router for credential resolution.

Implementation order:

1. Define `ReconciledTask` and `ReconciliationError` types in `@iexcel/shared-types` (or locally if simple enough to not warrant shared export).
2. Implement `reconciliation-error.ts` — typed error class with `ASANA_AUTH_FAILED`, `ASANA_UNAVAILABLE`, `ASANA_TIMEOUT` codes.
3. Extend `asana-client.ts` with `fetchProjectTasks(projectGid, accessToken, offset?)` function — paginated fetch with timeout and retry.
4. Implement `reconcile.ts` — the main orchestration function: query Postgres, deduplicate projects, fetch per-project, match by GID, return `ReconciledTask[]`.
5. Export `reconcileTasksForClient` from `adapters/asana/index.ts`.
6. Write unit tests for the matching logic.
7. Write integration tests using mocked Asana HTTP client.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Inherits from `apps/api/tsconfig.json` |
| Runtime | Node.js 22 LTS | Via the API application |
| HTTP client | Native `fetch` (Node 22 built-in) | Consistent with Feature 12's `asana-client.ts`. No additional HTTP library. |
| Retry logic | `p-retry` | Same dependency established in Feature 12 |
| ORM / DB | Drizzle ORM (`@iexcel/database/schema`) | Feature 07 pattern. Read-only query: `select().from(tasks).where(...)` |
| Logger | Pino | Injected from the calling context (Feature 07 pattern) |
| Test framework | Vitest | Configured by Feature 07 |
| HTTP mocking | `msw` | Already a devDependency from Feature 12 |

### 1.3 Module Directory Structure

New files added to the existing adapter directory from Feature 12:

```
apps/api/src/adapters/asana/
├── index.ts                            # Add: export reconcileTasksForClient
├── adapter.ts                          # Unchanged (Feature 12)
├── asana-client.ts                     # Extend: add fetchProjectTasks()
├── reconcile.ts                        # NEW: main reconciliation orchestrator
├── reconciliation-error.ts             # NEW: ReconciliationError class
├── workspace-router.ts                 # Unchanged (Feature 12) — reused for credential resolution
├── custom-field-resolver.ts            # Unchanged (Feature 12)
├── assignee-resolver.ts                # Unchanged (Feature 12)
├── description-formatter.ts            # Unchanged (Feature 12)
├── estimated-time-formatter.ts         # Unchanged (Feature 12)
└── errors.ts                           # Unchanged (Feature 12)
```

Co-located tests:

```
apps/api/src/adapters/asana/__tests__/
├── reconcile.test.ts                   # NEW: unit tests for matching logic
└── reconcile.integration.test.ts       # NEW: integration tests with mocked HTTP
```

---

## 2. Data Models

### 2.1 ReconciledTask

```typescript
// apps/api/src/adapters/asana/reconcile.ts (or @iexcel/shared-types if needed downstream)

export type AsanaTaskStatus = 'completed' | 'incomplete' | 'not_found';

export interface AsanaCustomField {
  gid: string;
  name: string;
  display_value: string | null;
}

export interface ReconciledTask {
  // --- From Postgres (internal metadata) ---
  id: string;                        // UUID
  shortId: string;                   // e.g., "TSK-0042"
  title: string;
  description: string;               // Full structured description text
  assignee: string | null;           // Internal iExcel assignee name
  estimatedTime: string | null;      // "hh:mm" format
  scrumStage: string;                // e.g., "Backlog"
  transcriptId: string | null;       // UUID of source transcript
  asanaProjectId: string | null;     // Asana project GID (from Postgres)
  asanaTaskId: string | null;        // Asana task GID (from Postgres external_ref)
  pushedAt: Date | null;

  // --- From Asana (live status) ---
  asanaStatus: AsanaTaskStatus;
  asanaCompleted: boolean | null;
  asanaCompletedAt: string | null;   // ISO 8601 timestamp or null
  asanaAssigneeName: string | null;  // Asana-side assignee (may differ from internal)
  asanaCustomFields: AsanaCustomField[];
}
```

### 2.2 ReconciliationError

```typescript
// apps/api/src/adapters/asana/reconciliation-error.ts

export type ReconciliationErrorCode =
  | 'ASANA_AUTH_FAILED'
  | 'ASANA_UNAVAILABLE'
  | 'ASANA_TIMEOUT';

export class ReconciliationError extends Error {
  readonly code: ReconciliationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ReconciliationErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ReconciliationError';
    this.code = code;
    this.details = details;
  }
}
```

### 2.3 Asana API Response Shape (Relevant Fields)

```typescript
// Internal type — not exported
interface AsanaTaskListResponse {
  data: AsanaTaskItem[];
  next_page: {
    offset: string;
    path: string;
    uri: string;
  } | null;
}

interface AsanaTaskItem {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  assignee: {
    gid: string;
    name: string;
  } | null;
  custom_fields: Array<{
    gid: string;
    name: string;
    display_value: string | null;
  }>;
}
```

---

## 3. Database Query

### 3.1 Pushed Tasks Query

```typescript
// Inside reconcile.ts

import { and, eq, sql } from 'drizzle-orm';
import { tasks } from '@iexcel/database/schema';

async function queryPushedTasks(clientId: string, db: DbClient) {
  return db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      description: tasks.description,
      assignee: tasks.assignee,
      estimatedTime: tasks.estimatedTime,
      scrumStage: tasks.scrumStage,
      transcriptId: tasks.transcriptId,
      asanaProjectId: sql<string>`external_ref->>'projectId'`,
      asanaTaskId: sql<string>`external_ref->>'externalId'`,
      pushedAt: tasks.pushedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        eq(tasks.status, 'pushed')
      )
    );
}
```

**Note:** The `external_ref` JSONB column uses the Feature 01 `ExternalRef` naming convention. Asana task GIDs are accessed via `external_ref->>'externalId'` and project GIDs via `external_ref->>'projectId'`. There are no standalone `asana_task_id` or `asana_project_id` columns.

### 3.2 Postgres Cache Write

After reconciliation, the function writes reconciled status data back to the `tasks` table:

```typescript
async function writeReconciledCache(
  reconciledTasks: ReconciledTask[],
  db: DbClient
): Promise<void> {
  for (const task of reconciledTasks) {
    await db
      .update(tasks)
      .set({
        reconciledStatus: {
          asanaStatus: task.asanaStatus,
          asanaCompleted: task.asanaCompleted,
          asanaCompletedAt: task.asanaCompletedAt,
          asanaAssigneeName: task.asanaAssigneeName,
        },
        reconciledAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
  }
}
```

This allows the agenda generation agent (Feature 20) to read reconciled task statuses via the standard API without requiring direct Asana API access.

---

## 4. Asana HTTP Client Extension

### 4.1 fetchProjectTasks (new function in asana-client.ts)

```typescript
// apps/api/src/adapters/asana/asana-client.ts (extension)

import pRetry, { AbortError } from 'p-retry';

const TASK_FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2; // 3 total attempts
const PAGE_LIMIT = 100;

export async function fetchProjectTasks(
  projectGid: string,
  accessToken: string
): Promise<AsanaTaskItem[]> {
  const allTasks: AsanaTaskItem[] = [];
  let offset: string | undefined = undefined;
  let pageCount = 0;

  do {
    const url = buildTaskListUrl(projectGid, offset);
    const page = await fetchPageWithRetry(url, accessToken);
    allTasks.push(...page.data);
    offset = page.next_page?.offset;
    pageCount++;
  } while (offset !== undefined);

  return allTasks;
}

function buildTaskListUrl(projectGid: string, offset?: string): string {
  const params = new URLSearchParams({
    project: projectGid,
    opt_fields: 'gid,name,completed,completed_at,assignee.name,custom_fields',
    limit: String(PAGE_LIMIT),
  });
  if (offset) {
    params.set('offset', offset);
  }
  return `https://app.asana.com/api/1.0/tasks?${params.toString()}`;
}

async function fetchPageWithRetry(
  url: string,
  accessToken: string
): Promise<AsanaTaskListResponse> {
  return pRetry(
    async () => {
      const response = await fetchWithTimeout(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }, TASK_FETCH_TIMEOUT_MS);

      // Non-retryable auth errors
      if (response.status === 401 || response.status === 403) {
        throw new AbortError(
          new ReconciliationError('ASANA_AUTH_FAILED', `Asana returned ${response.status}`, {
            status: response.status,
          })
        );
      }

      // 404: project not found — signal to caller, not retryable
      if (response.status === 404) {
        throw new AbortError(
          new ProjectNotFoundError(url)
        );
      }

      // Success
      if (response.status === 200) {
        return response.json() as Promise<AsanaTaskListResponse>;
      }

      // 429: respect Retry-After
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
        await sleep(delayMs);
      }

      // Retryable: 429, 5xx
      throw new ReconciliationError(
        'ASANA_UNAVAILABLE',
        `Asana returned ${response.status}`,
        { status: response.status }
      );
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
      randomize: true,
      onFailedAttempt: (error) => {
        // Logger is not available here — caller logs the warning
      },
    }
  );
}
```

**Note on timeout:** The `fetchWithTimeout` function is already defined in Feature 12's `asana-client.ts`. Reuse it directly. The timeout here is 15s (longer than Feature 12's 10s) because project task lists can be large with pagination.

---

## 5. Reconciliation Orchestrator

### 5.1 Main reconcileTasksForClient Function

```typescript
// apps/api/src/adapters/asana/reconcile.ts

import { reconciliationLogger as log } from './reconcile-logger.js'; // or passed in

export async function reconcileTasksForClient(
  clientId: string,
  db: DbClient,
  logger: Logger
): Promise<ReconciledTask[]> {
  const startMs = Date.now();

  // Step 1: Query Postgres for pushed tasks
  const pushedTasks = await queryPushedTasks(clientId, db);

  logger.info({ clientId, pushedTaskCount: pushedTasks.length }, 'Reconciliation started');

  if (pushedTasks.length === 0) {
    logger.info({ clientId, reconciledCount: 0, unmatchedCount: 0, durationMs: Date.now() - startMs }, 'Reconciliation completed');
    return [];
  }

  // Step 2: Deduplicate project GIDs
  const uniqueProjectGids = [
    ...new Set(
      pushedTasks
        .map(t => t.asanaProjectId)
        .filter((gid): gid is string => gid !== null)
    ),
  ];

  logger.info({ clientId, uniqueProjectCount: uniqueProjectGids.length }, 'Projects to reconcile');

  // Step 3: Fetch tasks per project and build a GID -> AsanaTaskItem map
  const taskMap = new Map<string, AsanaTaskItem>();

  for (const projectGid of uniqueProjectGids) {
    const accessToken = await resolveAccessTokenForProject(projectGid, db, logger);
    if (!accessToken) {
      logger.warn({ clientId, projectGid }, 'Could not resolve access token for project — tasks will be unmatched');
      continue;
    }

    logger.debug({ clientId, projectGid, page: 1 }, 'Project fetch started');

    try {
      const projectTasks = await fetchProjectTasks(projectGid, accessToken);
      for (const task of projectTasks) {
        taskMap.set(task.gid, task);
      }
      logger.debug({ clientId, projectGid, totalTasksFetched: projectTasks.length }, 'Project fetch completed');
    } catch (err) {
      if (err instanceof ReconciliationError && err.code === 'ASANA_AUTH_FAILED') {
        // Auth failures abort the entire reconciliation
        throw err;
      }
      if (err instanceof ProjectNotFoundError) {
        // 404: mark tasks for this project as not_found, continue
        logger.warn({ clientId, projectGid }, 'Asana project not found (404) — tasks will be unmatched');
        continue;
      }
      // All other errors (ASANA_UNAVAILABLE, ASANA_TIMEOUT) also abort
      throw err;
    }
  }

  // Step 4: Match and build ReconciledTask[]
  let unmatchedCount = 0;

  const result: ReconciledTask[] = pushedTasks.map(task => {
    // Tasks with no project GID
    if (!task.asanaProjectId) {
      logger.warn({ clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: task.asanaTaskId, reason: 'missing_asana_project_id' }, 'Unmatched task');
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    // Tasks with no task GID
    if (!task.asanaTaskId) {
      logger.warn({ clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: null, reason: 'missing_asana_task_id' }, 'Unmatched task');
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    const asanaTask = taskMap.get(task.asanaTaskId);

    if (!asanaTask) {
      logger.warn({ clientId, taskId: task.id, shortId: task.shortId, asanaTaskId: task.asanaTaskId, reason: 'task_not_in_project' }, 'Unmatched task');
      unmatchedCount++;
      return buildUnmatchedReconciledTask(task);
    }

    return buildMatchedReconciledTask(task, asanaTask);
  });

  // Step 5: Write reconciled status data to Postgres cache
  await writeReconciledCache(result, db);

  const durationMs = Date.now() - startMs;
  logger.info({ clientId, reconciledCount: result.length - unmatchedCount, unmatchedCount, durationMs }, 'Reconciliation completed');

  return result;
}

// --- Helpers ---

function buildUnmatchedReconciledTask(task: PushedTaskRow): ReconciledTask {
  return {
    id: task.id,
    shortId: task.shortId,
    title: task.title,
    description: task.description,
    assignee: task.assignee,
    estimatedTime: task.estimatedTime,
    scrumStage: task.scrumStage ?? 'Backlog',
    transcriptId: task.transcriptId,
    asanaProjectId: task.asanaProjectId,
    asanaTaskId: task.asanaTaskId,
    pushedAt: task.pushedAt,
    asanaStatus: 'not_found',
    asanaCompleted: null,
    asanaCompletedAt: null,
    asanaAssigneeName: null,
    asanaCustomFields: [],
  };
}

function buildMatchedReconciledTask(task: PushedTaskRow, asanaTask: AsanaTaskItem): ReconciledTask {
  return {
    id: task.id,
    shortId: task.shortId,
    title: task.title,
    description: task.description,
    assignee: task.assignee,
    estimatedTime: task.estimatedTime,
    scrumStage: task.scrumStage ?? 'Backlog',
    transcriptId: task.transcriptId,
    asanaProjectId: task.asanaProjectId,
    asanaTaskId: task.asanaTaskId,
    pushedAt: task.pushedAt,
    asanaStatus: asanaTask.completed ? 'completed' : 'incomplete',
    asanaCompleted: asanaTask.completed,
    asanaCompletedAt: asanaTask.completed_at,
    asanaAssigneeName: asanaTask.assignee?.name ?? null,
    asanaCustomFields: asanaTask.custom_fields.map(cf => ({
      gid: cf.gid,
      name: cf.name,
      display_value: cf.display_value,
    })),
  };
}
```

---

## 6. Access Token Resolution

The reconciliation function resolves the Asana access token for each project using the same workspace router established in Feature 12. The resolution flow:

1. Given a `projectGid`, look up the `AsanaWorkspaces` table entry that matches.
2. Extract the `access_token_ref` and resolve it to the actual token (from encrypted column or secret store, following Feature 12's pattern).
3. If no workspace record is found, return null — tasks for that project are marked `not_found`.

```typescript
async function resolveAccessTokenForProject(
  projectGid: string,
  db: DbClient,
  logger: Logger
): Promise<string | null> {
  // Leverage existing workspace-router resolution from Feature 12
  // The project GID is stored on each task; correlate to workspace via asana_workspaces table
  // Implementation detail: may require a join or a lookup by project-to-workspace mapping
  // Coordinate with Feature 12 implementation for the exact query
  try {
    return await resolveWorkspaceToken(projectGid, db);
  } catch {
    return null;
  }
}
```

---

## 7. API Layer Integration

### 7.1 Call Site (Feature 14 — Agenda Endpoints)

The reconciliation function is called by the agenda generation handler in Feature 14. It is not exposed as an HTTP endpoint.

```typescript
// Pseudocode — Feature 14 owns this handler
import { reconcileTasksForClient } from '../adapters/asana/index.js';

// Inside POST /workflows/agenda or agenda generation logic:
const reconciledTasks = await reconcileTasksForClient(clientId, db, req.log);

// Pass reconciledTasks to the Mastra workflow trigger
await triggerAgendaWorkflow({ clientId, tasks: reconciledTasks });
```

### 7.2 Export from Adapter Index

```typescript
// apps/api/src/adapters/asana/index.ts (additions)

export { reconcileTasksForClient } from './reconcile.js';
export type { ReconciledTask, AsanaTaskStatus, AsanaCustomField } from './reconcile.js';
export { ReconciliationError } from './reconciliation-error.js';
```

---

## 8. Testing Strategy

### 8.1 Unit Tests — reconcile.ts (matching logic)

All unit tests mock the Asana HTTP calls at the `fetchProjectTasks` level using `vi.mock` or by injecting a mock function.

| Test Case | Description |
|---|---|
| All tasks matched | 3 tasks in 1 project, all GIDs present in mocked response |
| Tasks across 2 projects | Correct project grouping; each project fetched once |
| Completed task | `asanaCompleted: true`, `asanaStatus: 'completed'` |
| Incomplete task | `asanaCompleted: false`, `asanaStatus: 'incomplete'` |
| No pushed tasks | Empty array returned; `fetchProjectTasks` not called |
| Null asanaProjectId | Task appears with `asanaStatus: 'not_found'`, no API call |
| Null asanaTaskId | Task appears with `asanaStatus: 'not_found'` |
| GID not in project response | Task appears with `asanaStatus: 'not_found'`, warning logged |
| Postgres metadata preserved | All 11 internal fields present in output |
| No Postgres writes | Drizzle mock has no `.update()` or `.insert()` calls |

### 8.2 Integration Tests — reconcile.integration.test.ts

Uses `msw` to intercept Asana HTTP calls at the fetch level.

| Test Suite | Scenarios |
|---|---|
| Happy path | Single project, single page, all matched |
| Pagination | 150 tasks, 2 pages; task on page 2 matched correctly |
| 401 auth failure | Throws `ReconciliationError('ASANA_AUTH_FAILED')` |
| 404 project not found | Tasks marked `not_found`, no throw |
| 429 → 200 retry | Succeeds after 1 retry |
| 429 exhausted | Throws `ReconciliationError('ASANA_UNAVAILABLE')` |
| 503 → 503 → 200 | Succeeds after 2 retries |
| Timeout on first request | Retried; eventually throws `ReconciliationError('ASANA_TIMEOUT')` |
| Multi-project, one 404 | Correct partial match; no throw |

### 8.3 Test Command

```bash
nx run api:test --testPathPattern=adapters/asana/reconcile
```

---

## 9. Performance Requirements

| Metric | Requirement |
|---|---|
| Total reconciliation time | Under 5 seconds for up to 200 pushed tasks across 5 Asana projects (assuming Asana API responds in < 500ms per page) |
| Individual Asana HTTP request timeout | 15 seconds |
| Total reconciliation budget | 30 seconds before the caller should consider the operation failed |
| Memory footprint | All fetched Asana tasks held in-memory for duration of one reconciliation call only; no persistent cache |
| Concurrent safety | Two concurrent reconciliations for different clients must not share any mutable state |

---

## 10. Security Considerations

| Concern | Requirement |
|---|---|
| Access token logging | Asana access tokens MUST NOT appear in any log output at any level |
| Task content logging | Task titles and descriptions MUST NOT be logged |
| Encrypted credentials | Access tokens are read from encrypted DB storage (AES-256-GCM) via the swappable credential resolver established in Feature 12 |
| Postgres writes limited to cache | The only write operations are updating `reconciled_status` and `reconciled_at` on the `tasks` table (cache write). The task's primary `status` field is never modified. |
| No token exposure in errors | `ReconciliationError.details` must not include access token values |
| Client isolation | The Postgres query is always filtered by `clientId`; cross-client data leakage is prevented at the query level |

---

## 11. Dependencies

### 11.1 Feature Dependencies

| Feature | What Is Needed |
|---|---|
| 07 (api-scaffolding) | Fastify, Drizzle `DbClient` type, Pino logger, error handling patterns |
| 12 (output-normalizer-asana) | `asana-client.ts` (reuse `fetchWithTimeout`), `workspace-router.ts` (access token resolution), `p-retry` dependency |
| 11 (task-endpoints) | `tasks` table schema with `status`, `client_id`, `external_ref` JSONB column (accessed via `external_ref->>'externalId'` and `external_ref->>'projectId'`) |
| 04 (product-database-schema) | `tasks` table DDL |

### 11.2 npm Dependencies

No new npm dependencies. All required packages were introduced in Features 07 and 12:
- `p-retry` — already added by Feature 12
- `msw` — already a devDependency
- `vitest` — already configured

### 11.3 Downstream Dependents

| Feature | Dependency |
|---|---|
| 14 (agenda-endpoints) | Calls `reconcileTasksForClient` before triggering Workflow B |
| 20 (workflow-b-agenda-agent) | Consumes `ReconciledTask[]` to build the agenda summary |

---

## 12. Nx Integration

### 12.1 Project Placement

No new Nx project. All files are added to the existing `apps/api` project.

### 12.2 Test Target

```bash
nx run api:test --testPathPattern=adapters/asana
```

### 12.3 Type Check

```bash
nx run api:type-check
```

---

## 13. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| **Resolved:** The `external_ref` JSONB column is confirmed. Access Asana task GIDs via `external_ref->>'externalId'` and project GIDs via `external_ref->>'projectId'` (Feature 01 naming convention). | N/A | N/A |
| Does each Asana project map unambiguously to a single workspace (and thus a single access token)? | Determines the access token resolution query | Verify with Feature 12's workspace router. The assumption here is one workspace per project GID stored in `asana_workspaces`. |
| Should reconciliation results be cached per-client for the duration of a single agenda generation workflow? | Reduces Asana API calls if the workflow triggers reconciliation multiple times | Default: no cache. If Feature 20's workflow calls reconciliation multiple times in one run, add a per-invocation memoization layer inside the workflow orchestrator (Feature 17/20 concern). |
| Should `ReconciliationError` be part of `@iexcel/shared-types` or stay local to `apps/api`? | If Mastra agents (Feature 20) need to handle this error type, it must be shared | Default: local to `apps/api`. Feature 20 receives `ReconciledTask[]` or a thrown error that propagates through the API's error handler — it does not need to import the error class directly. |
