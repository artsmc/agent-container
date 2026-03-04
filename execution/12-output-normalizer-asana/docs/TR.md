# Technical Requirements
# Feature 12: output-normalizer-asana

## 1. Implementation Strategy

### 1.1 Approach

The Asana output normalizer is an **async TypeScript module** with one external I/O dependency (the Asana REST API) and one internal read dependency (the database, accessed via the existing service layer — never directly). It is implemented as a set of focused sub-modules under `apps/api/src/adapters/asana/` and exposed via a single public class implementing the `OutputAdapter` interface.

Implementation order:

1. Define the `OutputAdapter` interface and supporting types in `@iexcel/shared-types` (if not already done by feature 01).
2. Implement `errors.ts` — `AdapterError` class with typed codes.
3. Implement `description-formatter.ts` — pure function; 3-section template formatting.
4. Implement `estimated-time-formatter.ts` — pure function; interval string to display string conversion.
5. Implement `custom-field-resolver.ts` — enum option GID lookup with in-memory cache.
6. Implement `assignee-resolver.ts` — workspace members lookup with in-memory cache.
7. Implement `workspace-router.ts` — workspace/project resolution cascade with database read.
8. Implement `asana-client.ts` — thin HTTP wrapper around Asana REST API with retry logic.
9. Implement `adapter.ts` — orchestrates all sub-modules; implements `OutputAdapter.push()`.
10. Wire the public export in `index.ts`.
11. Write unit tests for pure sub-modules.
12. Write integration tests using a mocked Asana HTTP client.

### 1.2 Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Inherits from `apps/api/tsconfig.json` |
| Runtime | Node.js (via the API application) | |
| HTTP client | The HTTP library configured by feature 07's API scaffolding | Likely `node-fetch`, `axios`, or the built-in Node 18+ `fetch`. Match whatever feature 07 established. |
| Retry logic | `p-retry` or hand-rolled using the HTTP client's interceptors | `p-retry` is preferred if not already a dependency |
| Type contracts | `@iexcel/shared-types` | `NormalizedTask`, `OutputAdapter`, `ExternalRef`, `AsanaExternalRef`, `ApiErrorCode` |
| Test framework | Vitest (or whatever is configured by feature 07) | Unit and integration tests |
| HTTP mocking | `msw` (Mock Service Worker) or `nock` | For integration tests that intercept Asana API calls |
| In-memory cache | Simple `Map` with timestamp-based TTL | No external cache dependency (Redis, etc.) for this in-process cache |

### 1.3 Shared Asana Client Extraction

The `asana-client.ts` HTTP wrapper is extracted to `apps/api/src/adapters/asana/client.ts` so it can be shared by both Feature 12 (push) and Feature 13 (status reconciliation). This module provides `createTask()`, `fetchProjectTasks()`, and the shared `fetchWithTimeout` + retry infrastructure. Both features import from this shared location.

### 1.4 Encrypted Credential Storage

Asana access tokens are stored encrypted in the database (encrypted column on the `AsanaWorkspaces` table). The workspace router resolves tokens using a swappable credential resolver:

- **V1:** Credentials are encrypted at rest in the database using AES-256-GCM. A web UI (Feature 31 — Admin Settings) allows management of Asana workspace credentials.
- **Future:** The resolver interface supports swapping to an external secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) without changing adapter code.

The credential resolver is injected into the workspace router and is responsible for decryption. Plaintext tokens exist only in memory during a push or reconciliation operation.

### 1.5 Module Directory Structure

```
apps/api/src/adapters/asana/
├── index.ts                        # Public export: AsanaOutputAdapter class
├── adapter.ts                      # OutputAdapter.push() orchestration
├── client.ts                       # Shared Asana REST API HTTP wrapper with retry (used by Feature 12 + 13)
├── workspace-router.ts             # Workspace/project GID resolution cascade
├── custom-field-resolver.ts        # Custom field GID config + enum option cache
├── assignee-resolver.ts            # Workspace members cache + name/email lookup
├── description-formatter.ts        # 3-section template text formatter
├── estimated-time-formatter.ts     # INTERVAL string → "Xh Ym" display converter
└── errors.ts                       # AdapterError class
```

Co-located test directory:

```
apps/api/src/adapters/asana/__tests__/
├── description-formatter.test.ts
├── estimated-time-formatter.test.ts
├── custom-field-resolver.test.ts
├── assignee-resolver.test.ts
├── workspace-router.test.ts
├── asana-client.test.ts
└── adapter.integration.test.ts
```

---

## 2. Data Models

### 2.1 NormalizedTask (Consumed From Shared Types)

```typescript
// From @iexcel/shared-types — task.ts
interface NormalizedTask {
  id: string;               // UUID
  shortId: string;          // e.g., "TSK-0042"
  clientId: string;         // UUID
  clientName: string;       // e.g., "Total Life"
  title: string;
  description: string;      // Structured text with 3-section markers
  assignee: string | null;  // iExcel team member name or email
  estimatedTime: string;    // "hh:mm" format, e.g., "02:30"
  scrumStage: string;       // Default: "Backlog"
  asanaWorkspaceId: string | null;
  asanaProjectId: string | null;
}
```

### 2.2 OutputAdapter Interface (Defined In Shared Types)

```typescript
// From @iexcel/shared-types — adapters.ts
interface AdapterContext {
  workspaceGid: string;
  projectGid: string;
  accessToken: string;
  customFieldGids: CustomFieldGidConfig;
}

interface CustomFieldGidConfig {
  clientFieldGid: string;
  scrumStageFieldGid: string;
  estimatedTimeFieldGid: string;
  estimatedTimeFormat: 'h_m' | 'hh_mm';
}

interface OutputAdapter {
  push(task: NormalizedTask, context: AdapterContext): Promise<ExternalRef>;
}
```

### 2.3 AsanaExternalRef (Defined In Shared Types)

```typescript
// From @iexcel/shared-types — adapters.ts
interface AsanaExternalRef {
  system: 'asana';            // Aligned to Feature 01 ExternalRef convention
  externalId: string;         // Asana task GID (was taskId)
  externalUrl: string;        // Asana permalink URL (was permalinkUrl)
  workspaceId: string;
  projectId: string;
}

type ExternalRef = AsanaExternalRef; // | JiraExternalRef | LinearExternalRef (future)
```

### 2.4 AdapterError

```typescript
// apps/api/src/adapters/asana/errors.ts
import { ApiErrorCode } from '@iexcel/shared-types';

class AdapterError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
```

### 2.5 AsanaWorkspaces Table Extension

The `AsanaWorkspaces` table (defined in `database-prd.md`) must be extended with a JSONB column to store custom field GID configuration. This requires a database migration:

```sql
ALTER TABLE asana_workspaces
ADD COLUMN custom_field_config JSONB NOT NULL DEFAULT '{}';
```

The JSONB shape:

```json
{
  "clientFieldGid": "1234567890123456",
  "scrumStageFieldGid": "2345678901234567",
  "estimatedTimeFieldGid": "3456789012345678",
  "estimatedTimeFormat": "h_m"
}
```

This migration is part of this feature's delivery. The workspace configuration endpoints (outside this feature's scope) will write to this column.

---

## 3. Description Formatter Implementation

### 3.1 Section Header Detection

```typescript
// apps/api/src/adapters/asana/description-formatter.ts

const SECTION_HEADERS = {
  taskContext: '**TASK CONTEXT**',
  additionalContext: '**ADDITIONAL CONTEXT**',
  requirements: '**REQUIREMENTS**',
} as const;

interface ParsedSections {
  taskContext: string;
  additionalContext: string;
  requirements: string;
}

function parseSections(description: string): ParsedSections | null {
  const tcIdx = description.indexOf(SECTION_HEADERS.taskContext);
  const acIdx = description.indexOf(SECTION_HEADERS.additionalContext);
  const reqIdx = description.indexOf(SECTION_HEADERS.requirements);

  if (tcIdx === -1 || acIdx === -1 || reqIdx === -1) return null;

  const taskContext = description.slice(tcIdx + SECTION_HEADERS.taskContext.length, acIdx).trim();
  const additionalContext = description.slice(acIdx + SECTION_HEADERS.additionalContext.length, reqIdx).trim();
  const requirements = description.slice(reqIdx + SECTION_HEADERS.requirements.length).trim();

  return { taskContext, additionalContext, requirements };
}
```

### 3.2 Template Assembly

```typescript
export function formatDescriptionForAsana(description: string): string {
  const sections = parseSections(description);

  if (!sections) {
    // Fallback: strip all ** markers and send as-is
    return description.replace(/\*\*/g, '').trim();
  }

  return [
    'TASK CONTEXT',
    sections.taskContext,
    '',
    'ADDITIONAL CONTEXT',
    sections.additionalContext,
    '',
    'REQUIREMENTS',
    sections.requirements,
  ].join('\n');
}
```

---

## 4. Estimated Time Formatter Implementation

```typescript
// apps/api/src/adapters/asana/estimated-time-formatter.ts

export function formatEstimatedTime(
  interval: string,
  format: 'h_m' | 'hh_mm' = 'h_m'
): string | null {
  // interval is "hh:mm" e.g. "02:30"
  const match = interval.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (format === 'h_m') {
    return `${hours}h ${minutes}m`;
  } else {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
}
```

---

## 5. Workspace Router Implementation

```typescript
// apps/api/src/adapters/asana/workspace-router.ts

interface ResolvedRouting {
  workspaceGid: string;
  projectGid: string;
  accessToken: string;
  customFieldConfig: CustomFieldGidConfig;
}

async function resolveRouting(
  task: NormalizedTask,
  db: DatabaseService
): Promise<ResolvedRouting> {
  // 1. Task-level override
  let workspaceGid = task.asanaWorkspaceId;
  let projectGid = task.asanaProjectId;

  // 2. Client default fallback
  if (!workspaceGid || !projectGid) {
    const client = await db.clients.findById(task.clientId);
    workspaceGid = workspaceGid ?? client?.defaultAsanaWorkspaceId ?? null;
    projectGid = projectGid ?? client?.defaultAsanaProjectId ?? null;
  }

  // 3. Reject if still unresolved
  if (!workspaceGid) {
    throw new AdapterError(
      ApiErrorCode.WorkspaceNotConfigured,
      'No Asana workspace configured for this task or client.',
      422,
      { taskId: task.id, clientId: task.clientId }
    );
  }

  // 4. Fetch workspace record (access token + custom field config)
  const workspace = await db.asanaWorkspaces.findByGid(workspaceGid);
  if (!workspace) {
    throw new AdapterError(
      ApiErrorCode.WorkspaceNotConfigured,
      'Configured Asana workspace GID not found in database.',
      422,
      { workspaceGid }
    );
  }

  // 5. Validate custom field config completeness
  const config = workspace.customFieldConfig;
  if (!config.clientFieldGid || !config.scrumStageFieldGid || !config.estimatedTimeFieldGid) {
    throw new AdapterError(
      ApiErrorCode.WorkspaceNotConfigured,
      'Asana workspace custom field GID configuration is incomplete.',
      422,
      { workspaceGid, missingFields: getMissingConfigKeys(config) }
    );
  }

  return {
    workspaceGid,
    projectGid: projectGid!,
    accessToken: workspace.accessToken,
    customFieldConfig: config,
  };
}
```

---

## 6. Asana HTTP Client Implementation

### 6.1 Client Structure

```typescript
// apps/api/src/adapters/asana/asana-client.ts

interface AsanaCreateTaskPayload {
  workspace: string;
  projects: string[];
  name: string;
  notes: string;
  assignee?: string;
  custom_fields: Record<string, string>;
}

interface AsanaCreateTaskResponse {
  data: {
    gid: string;
    permalink_url: string;
  };
}

async function createTask(
  payload: AsanaCreateTaskPayload,
  accessToken: string
): Promise<AsanaCreateTaskResponse> {
  // Implementation uses p-retry for retry logic
  // See Section 6.2
}
```

### 6.2 Retry Implementation Using p-retry

```typescript
import pRetry, { AbortError } from 'p-retry';

const MAX_RETRIES = 2; // 3 total attempts

async function createTaskWithRetry(
  payload: AsanaCreateTaskPayload,
  accessToken: string
): Promise<AsanaCreateTaskResponse> {
  return pRetry(
    async () => {
      const response = await fetchWithTimeout(
        'https://app.asana.com/api/1.0/tasks',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ data: payload }),
        },
        10_000 // 10 second timeout
      );

      if (response.status === 201) {
        return response.json() as Promise<AsanaCreateTaskResponse>;
      }

      // Non-retryable client errors
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const body = await response.json().catch(() => ({}));
        throw new AbortError(buildPushFailedError(response.status, body));
      }

      // Retryable: 429 and 5xx
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 0;
      if (retryAfterMs > 0) {
        await sleep(retryAfterMs);
      }

      throw buildPushFailedError(response.status, {});
    },
    {
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 4000,
      randomize: true,
      onFailedAttempt: (error) => {
        logger.warn('Asana API retry triggered', {
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          message: error.message,
        });
      },
    }
  );
}
```

### 6.3 Timeout Wrapper

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new AdapterError(
        ApiErrorCode.PushFailed,
        'Asana API request timed out',
        502
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## 7. Assignee Resolver Implementation

```typescript
// apps/api/src/adapters/asana/assignee-resolver.ts

interface AsanaMember {
  gid: string;
  name: string;
  email: string;
}

const MEMBER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const memberCache = new Map<string, { members: AsanaMember[]; fetchedAt: number }>();

export async function resolveAssigneeGid(
  assigneeName: string | null,
  workspaceGid: string,
  accessToken: string
): Promise<string | null> {
  if (!assigneeName) return null;

  const members = await getWorkspaceMembers(workspaceGid, accessToken);

  // 1. Exact name match
  let match = members.find(m => m.name === assigneeName);

  // 2. Case-insensitive name match
  if (!match) {
    match = members.find(m => m.name.toLowerCase() === assigneeName.toLowerCase());
  }

  // 3. Email match
  if (!match) {
    match = members.find(m => m.email.toLowerCase() === assigneeName.toLowerCase());
  }

  if (!match) {
    logger.warn('Asana assignee not found in workspace members', {
      assigneeName,
      workspaceGid,
    });
    return null;
  }

  return match.gid;
}

async function getWorkspaceMembers(
  workspaceGid: string,
  accessToken: string
): Promise<AsanaMember[]> {
  const cached = memberCache.get(workspaceGid);
  if (cached && Date.now() - cached.fetchedAt < MEMBER_CACHE_TTL_MS) {
    return cached.members;
  }

  const response = await fetch(
    `https://app.asana.com/api/1.0/workspaces/${workspaceGid}/users?opt_fields=gid,name,email`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const body = await response.json();
  const members: AsanaMember[] = body.data;

  memberCache.set(workspaceGid, { members, fetchedAt: Date.now() });
  return members;
}
```

---

## 8. Custom Field Resolver Implementation

```typescript
// apps/api/src/adapters/asana/custom-field-resolver.ts

interface EnumOption {
  gid: string;
  name: string;
}

const ENUM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const enumCache = new Map<string, { options: EnumOption[]; fetchedAt: number }>();

export async function resolveEnumOptionGid(
  fieldGid: string,
  displayName: string,
  accessToken: string,
  fieldLabel: string // For warning log messages
): Promise<string | null> {
  const options = await getEnumOptions(fieldGid, accessToken);
  const match = options.find(o => o.name.toLowerCase() === displayName.toLowerCase());

  if (!match) {
    logger.warn('Asana custom field enum option not found', {
      fieldName: fieldLabel,
      displayName,
      fieldGid,
    });
    return null;
  }

  return match.gid;
}

async function getEnumOptions(
  fieldGid: string,
  accessToken: string
): Promise<EnumOption[]> {
  const cached = enumCache.get(fieldGid);
  if (cached && Date.now() - cached.fetchedAt < ENUM_CACHE_TTL_MS) {
    return cached.options;
  }

  const response = await fetch(
    `https://app.asana.com/api/1.0/custom_fields/${fieldGid}?opt_fields=enum_options`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const body = await response.json();
  const options: EnumOption[] = body.data?.enum_options ?? [];

  enumCache.set(fieldGid, { options, fetchedAt: Date.now() });
  return options;
}
```

---

## 9. Adapter Orchestration

### 9.1 Main push() Method

```typescript
// apps/api/src/adapters/asana/adapter.ts

export class AsanaOutputAdapter implements OutputAdapter {
  constructor(private readonly db: DatabaseService) {}

  async push(task: NormalizedTask): Promise<ExternalRef> {
    // 1. Resolve routing (workspace, project, access token, custom field config)
    const routing = await resolveRouting(task, this.db);

    // 2. Format notes
    const notes = formatDescriptionForAsana(task.description);

    // 3. Resolve assignee GID
    const assigneeGid = await resolveAssigneeGid(
      task.assignee,
      routing.workspaceGid,
      routing.accessToken
    );

    // 4. Resolve custom field values
    const customFields: Record<string, string> = {};

    const clientEnumGid = await resolveEnumOptionGid(
      routing.customFieldConfig.clientFieldGid,
      task.clientName,
      routing.accessToken,
      'Client'
    );
    if (clientEnumGid) {
      customFields[routing.customFieldConfig.clientFieldGid] = clientEnumGid;
    }

    const scrumStageValue = task.scrumStage ?? 'Backlog';
    const scrumStageEnumGid = await resolveEnumOptionGid(
      routing.customFieldConfig.scrumStageFieldGid,
      scrumStageValue,
      routing.accessToken,
      'Scrum Stage'
    );
    if (scrumStageEnumGid) {
      customFields[routing.customFieldConfig.scrumStageFieldGid] = scrumStageEnumGid;
    }

    if (task.estimatedTime) {
      const formattedTime = formatEstimatedTime(
        task.estimatedTime,
        routing.customFieldConfig.estimatedTimeFormat
      );
      if (formattedTime) {
        customFields[routing.customFieldConfig.estimatedTimeFieldGid] = formattedTime;
      }
    }

    // 5. Build Asana API payload
    const payload: AsanaCreateTaskPayload = {
      workspace: routing.workspaceGid,
      projects: [routing.projectGid],
      name: task.title,
      notes,
      custom_fields: customFields,
      ...(assigneeGid ? { assignee: assigneeGid } : {}),
    };

    // 6. Create task in Asana
    logger.info('Pushing task to Asana', {
      taskId: task.id,
      shortId: task.shortId,
      workspaceGid: routing.workspaceGid,
      projectGid: routing.projectGid,
    });

    const asanaResponse = await createTaskWithRetry(payload, routing.accessToken);

    logger.info('Task pushed to Asana successfully', {
      taskId: task.id,
      asanaTaskGid: asanaResponse.data.gid,
      permalinkUrl: asanaResponse.data.permalink_url,
    });

    // 7. Return ExternalRef (caller writes to database)
    return {
      system: 'asana',
      externalId: asanaResponse.data.gid,
      externalUrl: asanaResponse.data.permalink_url,
      workspaceId: routing.workspaceGid,
      projectId: routing.projectGid,
    };
  }
}
```

---

## 10. API Endpoint Integration

### 10.1 Call Site in Feature 11's Push Handler

The push endpoint (feature 11) calls this adapter after status and routing validation:

```typescript
// Pseudocode — feature 11 owns the full handler
import { AsanaOutputAdapter } from '../adapters/asana';

const adapter = new AsanaOutputAdapter(db);

// Inside POST /tasks/:id/push handler:
const externalRef = await adapter.push(normalizedTask);

await db.tasks.update(task.id, {
  external_ref: externalRef,
  status: 'pushed',
  pushed_at: new Date(),
});
```

The adapter does not receive an `AdapterContext` as a second argument in this implementation — it resolves context internally using `NormalizedTask.clientId` and the database. The `OutputAdapter` interface's `AdapterContext` parameter is defined for future adapters that may need externally injected context.

### 10.2 Adapter Registration

The adapter is instantiated once per API server startup and injected into the task push handler via the dependency injection pattern established in feature 07's API scaffolding. It is not instantiated per-request.

---

## 11. Database Schema Extension

### 11.1 Migration: AsanaWorkspaces Custom Field Config

```sql
-- Migration: add custom_field_config to asana_workspaces
ALTER TABLE asana_workspaces
ADD COLUMN custom_field_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN asana_workspaces.custom_field_config IS
'Per-workspace Asana custom field GID configuration. Shape: {
  clientFieldGid: string,
  scrumStageFieldGid: string,
  estimatedTimeFieldGid: string,
  estimatedTimeFormat: "h_m" | "hh_mm"
}';
```

### 11.2 tasks.external_ref — Already Supported

The `tasks` table in the database-prd.md defines `asana_task_id VARCHAR`. Feature 11's context document clarifies this is replaced by `external_ref JSONB`. No additional migration is needed if feature 11 has already applied this change. If not, this feature must include:

```sql
ALTER TABLE tasks
DROP COLUMN IF EXISTS asana_task_id;

ALTER TABLE tasks
ADD COLUMN external_ref JSONB;
```

Coordinate with feature 11 to avoid duplicate migration.

---

## 12. Testing Strategy

### 12.1 Unit Tests — description-formatter.ts

| Test Case | Input | Expected Output |
|---|---|---|
| 3-section description | Description with all three `**SECTION**` markers | Formatted plain text with headers, no `**` markers |
| Description without section markers | Plain text description | Text returned as-is with `**` stripped |
| Empty description | `""` | `""` returned without error |
| Section markers present but empty body | Markers with no content between them | Sections present with empty content lines |

### 12.2 Unit Tests — estimated-time-formatter.ts

| Test Case | Input | Format | Expected Output |
|---|---|---|---|
| Standard hours and minutes | `"02:30"` | `h_m` | `"2h 30m"` |
| Zero minutes | `"03:00"` | `h_m` | `"3h 0m"` |
| Zero hours | `"00:45"` | `h_m` | `"0h 45m"` |
| hh_mm format | `"02:30"` | `hh_mm` | `"02:30"` |
| Invalid format | `"not-a-time"` | `h_m` | `null` |
| Null input | `null` | `h_m` | `null` |

### 12.3 Unit Tests — workspace-router.ts

| Test Case | Scenario |
|---|---|
| Task-level override present | Uses task GIDs; client record not fetched |
| Only client default present | Client record fetched; returns client default GIDs |
| No workspace anywhere | Throws `WORKSPACE_NOT_CONFIGURED` with taskId and clientId |
| Custom field config incomplete | Throws `WORKSPACE_NOT_CONFIGURED` with missingFields |

### 12.4 Unit Tests — assignee-resolver.ts

| Test Case | Scenario |
|---|---|
| Exact name match | Returns correct GID |
| Case-insensitive name match | Returns correct GID |
| Email match | Returns correct GID |
| No match | Returns null; logs warning |
| Null assignee | Returns null without cache lookup |
| Cache hit | Members API not called on second invocation |
| Cache TTL expired | Members API called again after 15+ minutes |

### 12.5 Unit Tests — custom-field-resolver.ts

| Test Case | Scenario |
|---|---|
| Exact display name match | Returns correct enum option GID |
| Case-insensitive match | Returns correct enum option GID |
| No match | Returns null; logs warning with fieldName |
| Cache hit | Custom field API not called on second invocation |
| Cache TTL expired | Custom field API called again after 5+ minutes |

### 12.6 Integration Tests — adapter.integration.test.ts

All integration tests mock the Asana HTTP API using `msw` or `nock`. They do NOT make real network calls.

| Test Suite | Scenarios |
|---|---|
| Happy path — full task push | All fields resolved; Asana returns 201; correct ExternalRef returned |
| Happy path — no assignee | Null assignee; task created without assignee field |
| Happy path — missing enum option | Unknown client name; task created without client custom field |
| Workspace routing — task override | Task-level GIDs used |
| Workspace routing — client default | Client default GIDs used |
| Workspace routing — not configured | WORKSPACE_NOT_CONFIGURED thrown before API call |
| Error handling — 401 | PUSH_FAILED thrown with message about invalid token |
| Error handling — 403 | PUSH_FAILED thrown with access denied message |
| Error handling — 404 | PUSH_FAILED thrown with GID not found message |
| Error handling — 400 with body | PUSH_FAILED thrown with Asana error body in details |
| Retry — 429 then 201 | Task created after 2 retries; retry warnings logged |
| Retry — 503 exhausted | PUSH_FAILED thrown after 3 total attempts |
| Timeout | PUSH_FAILED thrown with timeout message |
| Batch isolation | Two concurrent pushes; no shared state contamination |

---

## 13. Performance Requirements

| Metric | Requirement |
|---|---|
| Single task push latency (no cache miss) | Under 500ms (excluding Asana network time) |
| Single task push latency (cache miss — members + enum options) | Under 1500ms total (up to 3 API calls: task creation + member fetch + 1 enum fetch) |
| Cache warm subsequent push | Under 200ms (excluding Asana network time) |
| Memory per cache entry | Under 50KB per workspace (member list + enum options) |
| Concurrent push safety | No race conditions under 10 simultaneous pushes |

---

## 14. Security Considerations

### 14.1 Access Token Handling

- Asana access tokens are never logged at any level.
- Tokens are stored encrypted in the `AsanaWorkspaces` table using AES-256-GCM encryption. The credential resolver decrypts tokens at read time using a swappable resolver interface. In V1, the resolver reads from the encrypted DB column; in future versions, it can be swapped to read from an external secrets manager.
- A web UI for credential management is provided by Feature 31 (Admin Settings).
- Tokens must not appear in error response `details` payloads returned to the client.

### 14.2 Task Content is Business Data

- Task titles and descriptions must not be logged at any level.
- Log events contain only structural metadata: `taskId`, `shortId`, `workspaceGid`, `projectGid`, `asanaTaskGid`, `hasAssignee`, `customFieldCount`.

### 14.3 Input Validation Before External Call

- An empty `title` is rejected before the Asana API is called (FR-20 / VALIDATION_ERROR).
- Workspace GIDs are validated for non-null/non-empty string before use.
- No user-supplied values are interpolated into URL paths — all GIDs are from the database, not from the inbound HTTP request.

---

## 15. Dependencies

### 15.1 Dependencies on Other Features

| Feature | What Is Needed |
|---|---|
| 01 (shared-types-package) | `NormalizedTask`, `OutputAdapter`, `ExternalRef`, `AsanaExternalRef`, `AdapterContext`, `ApiErrorCode` types |
| 07 (api-scaffolding) | API application, HTTP client infrastructure, structured logger, dependency injection pattern, error middleware |
| 11 (task-endpoints) | The push endpoint invokes this adapter; feature 11 owns the `POST /tasks/{id}/push` handler and the database write of `external_ref` |
| 04 (product-database-schema) | `tasks.external_ref` JSONB column (added by feature 11 or this feature — coordinate to avoid duplicate migration) |

### 15.2 New npm Dependencies

| Package | Type | Purpose |
|---|---|---|
| `p-retry` | Runtime | Exponential back-off retry logic for transient Asana API failures |

If the HTTP client from feature 07 already includes retry middleware (e.g., `axios-retry`), `p-retry` may not be needed. Verify before adding.

### 15.3 Downstream Dependents

| Feature | Dependency Type |
|---|---|
| 13 (status-reconciliation) | Reads `external_ref.taskId` (Asana task GID) to check task completion in Asana |
| 38 (historical-import) | Uses the same adapter interface pattern to push historical tasks |

---

## 16. Nx Integration

### 16.1 Project Placement

The adapter is a module within `apps/api/`. No new Nx project is created. Files live at:

```
apps/api/src/adapters/asana/
```

### 16.2 Test Target

```bash
nx run api:test --testPathPattern=adapters/asana
```

### 16.3 Type Check

```bash
nx run api:type-check
```

---

## 17. Open Technical Questions

| Question | Impact | Recommendation |
|---|---|---|
| Does feature 07 use `axios`, `node-fetch`, or native `fetch` for HTTP? | Determines whether `p-retry` or axios interceptors are used for retry logic | Resolve against feature 07's final scaffolding before implementing `asana-client.ts` |
| Is the Asana access token stored as a plain value in the database or via a secrets manager (Vault, AWS Secrets Manager)? | Determines how `access_token_ref` is resolved at runtime | The database-prd.md has this as an open question. Assume plain encrypted column in V1; design the resolver so the source can be swapped |
| Should the `OutputAdapter` interface accept `AdapterContext` as a second argument, or should context resolution be internal to each adapter? | Interface design affects how future adapters are registered and called | Recommend internal context resolution per adapter in V1 for simplicity; the interface second parameter can be added if injection is needed by a future adapter |
| Should enum option and member caches be shared between hot-reload instances (e.g., a Redis L2 cache)? | Affects cache warm-up on server restart | Defer to V2; in-process cache is sufficient for V1 with acceptable warm-up cost |
