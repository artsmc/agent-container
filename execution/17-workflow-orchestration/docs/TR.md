# TR — Technical Requirements
## Feature 17: Workflow Orchestration

**Feature Name:** workflow-orchestration
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Implementation Strategy

Feature 17 is implemented entirely within the `apps/api` project established by Feature 07. It adds:
1. **Route layer** — Three Fastify route handlers (POST /workflows/intake, POST /workflows/agenda, GET /workflows/{id}/status) plus an internal status update route (PATCH /workflows/{id}/status).
2. **Service layer** — `WorkflowService` encapsulating all business logic: precondition checks, run record lifecycle, Mastra invocation, timeout detection.
3. **Data access layer** — `WorkflowRepository` with Drizzle ORM queries against the `workflow_runs` table.
4. **Mastra invocation adapter** — An isolated async invocation module that calls the Mastra runtime HTTP endpoint (Feature 18 defines the exact endpoint).

The implementation follows the same four-layer pattern established in Features 11 and 14.

---

## 2. File Structure

```
apps/api/src/
├── routes/
│   └── workflows.ts              # Route definitions (POST intake, POST agenda, GET status, PATCH status)
├── services/
│   └── workflow.service.ts       # WorkflowService — all business logic
├── repositories/
│   └── workflow.repository.ts    # WorkflowRepository — DB access for workflow_runs
├── adapters/
│   └── mastra.adapter.ts         # MastraAdapter — async HTTP invocation of Mastra
└── schemas/
    └── workflow.schemas.ts       # Zod schemas for request/response validation
```

---

## 3. API Endpoint Contracts

### 3.1 Trigger Workflow A (Intake)

```
POST /workflows/intake
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body Schema:**
```typescript
interface TriggerIntakeRequest {
  client_id: string;      // UUID, required
  transcript_id: string;  // UUID, required
}
```

**Response: 202 Accepted**
```typescript
interface TriggerWorkflowResponse {
  data: {
    workflow_run_id: string;   // UUID
    workflow_type: 'intake';
    status: 'pending';
    poll_url: string;          // e.g., "/workflows/{id}/status"
    started_at: string;        // ISO 8601
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Invalid/expired token |
| 403 | `FORBIDDEN` | Role insufficient or client not accessible |
| 404 | `CLIENT_NOT_FOUND` | client_id does not exist |
| 409 | `WORKFLOW_ALREADY_RUNNING` | Active run exists for client + type |
| 422 | `TRANSCRIPT_NOT_FOUND` | transcript_id not found for client |
| 422 | `VALIDATION_ERROR` | Request body fails schema validation |
| 502 | `MASTRA_INVOCATION_FAILED` | Mastra HTTP call threw an error |

---

### 3.2 Trigger Workflow B (Agenda)

```
POST /workflows/agenda
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body Schema:**
```typescript
interface TriggerAgendaRequest {
  client_id: string;       // UUID, required
  cycle_start?: string;    // ISO 8601 date, optional
  cycle_end?: string;      // ISO 8601 date, optional
}
```

**Response: 202 Accepted**
```typescript
interface TriggerWorkflowResponse {
  data: {
    workflow_run_id: string;
    workflow_type: 'agenda';
    status: 'pending';
    poll_url: string;
    started_at: string;
    input_refs: {
      cycle_start: string;  // resolved date
      cycle_end: string;    // resolved date
    };
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | |
| 403 | `FORBIDDEN` | |
| 404 | `CLIENT_NOT_FOUND` | |
| 409 | `WORKFLOW_ALREADY_RUNNING` | |
| 422 | `NO_COMPLETED_TASKS` | No completed tasks found for cycle window |
| 422 | `VALIDATION_ERROR` | |
| 502 | `MASTRA_INVOCATION_FAILED` | |

---

### 3.3 Get Workflow Status

```
GET /workflows/{workflow_run_id}/status
Authorization: Bearer <token>
```

**Response: 200 OK**
```typescript
interface WorkflowStatusResponse {
  data: {
    workflow_run_id: string;
    workflow_type: 'intake' | 'agenda';
    client_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    started_at: string;
    updated_at: string;
    completed_at: string | null;
    input_refs: Record<string, string>;
    result: {
      task_short_ids: string[] | null;  // present when workflow_type = 'intake' and completed
      agenda_short_id: string | null;   // present when workflow_type = 'agenda' and completed
    } | null;
    error: {
      code: string;
      message: string;
    } | null;
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | |
| 403 | `FORBIDDEN` | Run's client not accessible to caller |
| 404 | `WORKFLOW_RUN_NOT_FOUND` | No run with that UUID |

---

### 3.4 Update Workflow Status (Mastra Callback)

```
PATCH /workflows/{workflow_run_id}/status
Authorization: Bearer <mastra-service-token>
Content-Type: application/json
```

**Request Body Schema:**
```typescript
interface UpdateWorkflowStatusRequest {
  status: 'running' | 'completed' | 'failed';
  result?: {
    task_short_ids?: string[];
    agenda_short_id?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

**Response: 200 OK** — Full `WorkflowStatusResponse` shape.

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | `FORBIDDEN` | Caller is not the Mastra service account |
| 404 | `WORKFLOW_RUN_NOT_FOUND` | |
| 422 | `INVALID_STATUS_TRANSITION` | Transition not permitted (see Section 6) |

---

## 4. Data Models

### 4.1 workflow_runs Table

This feature requires a new `workflow_runs` table. **This feature owns its own Drizzle migration** for the `workflow_runs` table (not delegated to Feature 04). The migration file is created at `packages/database/src/migrations/` following the Drizzle migration pattern established by Feature 04.

```sql
CREATE TYPE workflow_type AS ENUM ('intake', 'agenda');
CREATE TYPE workflow_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE workflow_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type     workflow_type NOT NULL,
  client_id         UUID NOT NULL REFERENCES clients(id),
  status            workflow_status NOT NULL DEFAULT 'pending',
  input_refs        JSONB NOT NULL DEFAULT '{}',
  result            JSONB,                    -- populated on completion
  error             JSONB,                    -- populated on failure
  triggered_by      UUID REFERENCES users(id),  -- nullable: allows service-triggered runs in future
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ               -- null until terminal state
);
```

**Notes:**
- `input_refs` stores workflow-specific input metadata:
  - For `intake`: `{ "transcript_id": "uuid" }`
  - For `agenda`: `{ "cycle_start": "YYYY-MM-DD", "cycle_end": "YYYY-MM-DD" }`
- `result` stores workflow-specific output metadata:
  - For `intake`: `{ "task_short_ids": ["TSK-0001", "TSK-0002"] }`
  - For `agenda`: `{ "agenda_short_id": "AGD-0001" }`
- `error` stores failure detail: `{ "code": "...", "message": "..." }`
- `triggered_by` records the product user UUID of the account manager who triggered the run. Set at run creation.

### 4.2 Required Indexes

```sql
-- Active run check (most critical — prevents duplicate triggers)
CREATE INDEX workflow_runs_active_run_idx
  ON workflow_runs(client_id, workflow_type, status)
  WHERE status IN ('pending', 'running');

-- Status polling (lookup by ID — primary key covers this, but explicit for documentation)
-- PRIMARY KEY index on id is sufficient.

-- Audit queries: "show all runs for this client"
CREATE INDEX workflow_runs_client_id_idx ON workflow_runs(client_id);

-- Timeout sweep: "find all stale active runs"
CREATE INDEX workflow_runs_stale_idx
  ON workflow_runs(status, updated_at)
  WHERE status IN ('pending', 'running');
```

### 4.3 Drizzle ORM Schema

```typescript
// packages/database/src/schema.ts — additions required for Feature 17

import { pgTable, uuid, pgEnum, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { clients, users } from './existing-schema.js';

export const workflowTypeEnum = pgEnum('workflow_type', ['intake', 'agenda']);
export const workflowStatusEnum = pgEnum('workflow_status', ['pending', 'running', 'completed', 'failed']);

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workflowType: workflowTypeEnum('workflow_type').notNull(),
    clientId:     uuid('client_id').notNull().references(() => clients.id),
    status:       workflowStatusEnum('status').notNull().default('pending'),
    inputRefs:    jsonb('input_refs').notNull().default({}),
    result:       jsonb('result'),
    error:        jsonb('error'),
    triggeredBy:  uuid('triggered_by').references(() => users.id),
    startedAt:    timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt:  timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    activeRunIdx: index('workflow_runs_active_run_idx')
      .on(table.clientId, table.workflowType, table.status),
    clientIdIdx: index('workflow_runs_client_id_idx').on(table.clientId),
    staleIdx:    index('workflow_runs_stale_idx').on(table.status, table.updatedAt),
  })
);
```

---

## 5. Service Layer

### 5.1 WorkflowService

```typescript
// apps/api/src/services/workflow.service.ts

export class WorkflowService {
  constructor(
    private readonly workflowRepo: WorkflowRepository,
    private readonly transcriptRepo: TranscriptRepository,  // from Feature 10
    private readonly reconciliationService: ReconciliationService, // from Feature 13
    private readonly mastraAdapter: MastraAdapter,
    private readonly auditService: AuditService,
    private readonly config: AppConfig
  ) {}

  async triggerIntake(
    callerId: string,
    clientId: string,
    transcriptId: string
  ): Promise<WorkflowRun> {
    // 1. Verify transcript belongs to client
    await this.transcriptRepo.findByIdAndClientOrThrow(transcriptId, clientId);

    // 2. Check for active run
    const activeRun = await this.workflowRepo.findActiveRun(clientId, 'intake');
    if (activeRun) throw new ConflictError('WORKFLOW_ALREADY_RUNNING', ...);

    // 3. Create run record
    const run = await this.workflowRepo.create({
      workflowType: 'intake',
      clientId,
      status: 'pending',
      inputRefs: { transcript_id: transcriptId },
      triggeredBy: callerId,
    });

    // 4. Audit log
    await this.auditService.log({ action: 'workflow.triggered', entityType: 'workflow_run',
      entityId: run.id, userId: callerId,
      metadata: { workflow_type: 'intake', client_id: clientId, transcript_id: transcriptId }
    });

    // 5. Fire-and-forget Mastra invocation
    this.mastraAdapter.invokeWorkflowA({
      workflowRunId: run.id,
      clientId,
      transcriptId,
    }).catch(err => {
      // Log invocation failure and mark run failed
      this.handleInvocationFailure(run.id, err);
    });

    return run;
  }

  async triggerAgenda(
    callerId: string,
    clientId: string,
    cycleStart?: string,
    cycleEnd?: string
  ): Promise<WorkflowRun> {
    // 1. Check for active run
    const activeRun = await this.workflowRepo.findActiveRun(clientId, 'agenda');
    if (activeRun) throw new ConflictError('WORKFLOW_ALREADY_RUNNING', ...);

    // 2. Resolve cycle dates
    const resolvedCycleStart = cycleStart ?? await this.resolveCycleStart(clientId);
    const resolvedCycleEnd   = cycleEnd   ?? new Date().toISOString().split('T')[0];

    // 3. Trigger reconciliation (Feature 13)
    // After reconciliation, Feature 13 writes reconciled task statuses to the Postgres
    // tasks table (reconciled_status JSONB + reconciled_at). The agenda agent then reads
    // this cached data via the standard GET /clients/{client_id}/tasks API.
    await this.reconciliationService.reconcileClient(clientId);

    // 4. Check for completed tasks (reads from Postgres cache written by reconciliation)
    const completedTaskCount = await this.workflowRepo.countCompletedTasks(
      clientId, resolvedCycleStart, resolvedCycleEnd
    );
    if (completedTaskCount === 0) {
      throw new UnprocessableError('NO_COMPLETED_TASKS',
        'No completed tasks found for this client in the specified cycle window. ' +
        'Please ensure tasks have been marked complete in Asana before generating an agenda.'
      );
    }

    // 5. Create run record
    const run = await this.workflowRepo.create({
      workflowType: 'agenda',
      clientId,
      status: 'pending',
      inputRefs: { cycle_start: resolvedCycleStart, cycle_end: resolvedCycleEnd },
      triggeredBy: callerId,
    });

    // 6. Audit log
    await this.auditService.log({ action: 'workflow.triggered', entityType: 'workflow_run',
      entityId: run.id, userId: callerId,
      metadata: { workflow_type: 'agenda', client_id: clientId,
        cycle_start: resolvedCycleStart, cycle_end: resolvedCycleEnd }
    });

    // 7. Fire-and-forget
    this.mastraAdapter.invokeWorkflowB({
      workflowRunId: run.id,
      clientId,
      cycleStart: resolvedCycleStart,
      cycleEnd: resolvedCycleEnd,
    }).catch(err => {
      this.handleInvocationFailure(run.id, err);
    });

    return run;
  }

  async getStatus(callerId: string, workflowRunId: string): Promise<WorkflowRun> {
    const run = await this.workflowRepo.findByIdOrThrow(workflowRunId);

    // Lazy timeout check
    if (['pending', 'running'].includes(run.status)) {
      const ageMs = Date.now() - run.updatedAt.getTime();
      const timeoutMs = this.config.WORKFLOW_TIMEOUT_MS ?? 5 * 60 * 1000;
      if (ageMs > timeoutMs) {
        return await this.markTimedOut(run);
      }
    }

    return run;
  }

  async updateStatus(
    workflowRunId: string,
    newStatus: 'running' | 'completed' | 'failed',
    result?: WorkflowResult,
    error?: WorkflowError
  ): Promise<WorkflowRun> {
    const run = await this.workflowRepo.findByIdOrThrow(workflowRunId);

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[run.status];
    if (!allowed?.includes(newStatus)) {
      throw new UnprocessableError('INVALID_STATUS_TRANSITION',
        `Cannot transition workflow run from '${run.status}' to '${newStatus}'.`
      );
    }

    const completedAt = ['completed', 'failed'].includes(newStatus) ? new Date() : null;
    const updated = await this.workflowRepo.updateStatus(workflowRunId, {
      status: newStatus, result, error, completedAt,
    });

    const action = newStatus === 'running'    ? 'workflow.started'
                 : newStatus === 'completed'  ? 'workflow.completed'
                 : 'workflow.failed';

    await this.auditService.log({
      action, entityType: 'workflow_run', entityId: run.id, userId: null,
      metadata: { workflow_type: run.workflowType, client_id: run.clientId,
        ...(result ? { result } : {}), ...(error ? { error } : {}) }
    });

    return updated;
  }

  private async markTimedOut(run: WorkflowRun): Promise<WorkflowRun> {
    const updated = await this.workflowRepo.updateStatus(run.id, {
      status: 'failed',
      error: { code: 'WORKFLOW_TIMEOUT', message: 'Workflow did not complete within the allowed time.' },
      completedAt: new Date(),
    });
    await this.auditService.log({
      action: 'workflow.timed_out', entityType: 'workflow_run', entityId: run.id, userId: null,
      metadata: { workflow_type: run.workflowType, client_id: run.clientId }
    });
    return updated;
  }

  private async handleInvocationFailure(runId: string, err: unknown): Promise<void> {
    await this.workflowRepo.updateStatus(runId, {
      status: 'failed',
      error: { code: 'MASTRA_INVOCATION_FAILED', message: String(err) },
      completedAt: new Date(),
    });
  }

  private async resolveCycleStart(clientId: string): Promise<string> {
    const lastRun = await this.workflowRepo.findLastCompletedRun(clientId, 'agenda');
    return lastRun?.completedAt?.toISOString().split('T')[0]
      ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30-day fallback
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:   ['running', 'failed'],
  running:   ['completed', 'failed'],
  completed: [],
  failed:    [],
};
```

---

## 6. Status Transition Matrix

| From | To | Permitted | Initiator |
|---|---|---|---|
| `pending` | `running` | Yes | Mastra PATCH callback |
| `pending` | `failed` | Yes | Invocation failure, lazy timeout |
| `running` | `completed` | Yes | Mastra PATCH callback |
| `running` | `failed` | Yes | Mastra PATCH callback, lazy timeout |
| `completed` | any | No | — |
| `failed` | any | No | — |

---

## 7. Mastra Adapter

```typescript
// apps/api/src/adapters/mastra.adapter.ts

export interface MastraInvocationPayload {
  workflowRunId: string;
  workflowType: 'intake' | 'agenda';
  clientId: string;
  transcriptId?: string;          // intake only
  cycleStart?: string;            // agenda only
  cycleEnd?: string;              // agenda only
  callbackBaseUrl: string;
}

export class MastraAdapter {
  constructor(
    private readonly mastraBaseUrl: string,   // MASTRA_BASE_URL env var
    private readonly tokenProvider: () => Promise<string>  // client credentials token
  ) {}

  async invokeWorkflowA(params: Omit<MastraInvocationPayload, 'workflowType' | 'callbackBaseUrl'>): Promise<void> {
    await this.invoke({ ...params, workflowType: 'intake', callbackBaseUrl: this.getCallbackBaseUrl() });
  }

  async invokeWorkflowB(params: Omit<MastraInvocationPayload, 'workflowType' | 'callbackBaseUrl'>): Promise<void> {
    await this.invoke({ ...params, workflowType: 'agenda', callbackBaseUrl: this.getCallbackBaseUrl() });
  }

  private async invoke(payload: MastraInvocationPayload): Promise<void> {
    const token = await this.tokenProvider();
    const res = await fetch(`${this.mastraBaseUrl}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout for the invocation HTTP call only
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mastra invocation failed: HTTP ${res.status} — ${body}`);
    }
  }

  private getCallbackBaseUrl(): string {
    return process.env['API_BASE_URL'] ?? 'http://localhost:3000';
  }
}
```

**Important:** The `invokeWorkflowA` / `invokeWorkflowB` calls are made in a fire-and-forget pattern at the service layer:

```typescript
this.mastraAdapter.invokeWorkflowA(...).catch(err => this.handleInvocationFailure(runId, err));
```

The `await` is intentionally absent. The HTTP response from Mastra's `/invoke` endpoint only confirms that Mastra has accepted the job — it does not wait for LLM completion. If the invocation itself fails (Mastra unreachable), the workflow run is immediately marked `failed`.

---

## 8. Route Registration

```typescript
// apps/api/src/routes/workflows.ts

import type { FastifyInstance } from 'fastify';
import { WorkflowService } from '../services/workflow.service.js';
import { requireRole } from '../middleware/require-role.js';
import { requireClientAccess } from '../middleware/require-client-access.js';
import { requireMastraServiceAccount } from '../middleware/require-mastra.js';
import {
  TriggerIntakeSchema,
  TriggerAgendaSchema,
  UpdateStatusSchema,
} from '../schemas/workflow.schemas.js';
import { sendSuccess } from '../helpers/response.js';

export async function workflowRoutes(app: FastifyInstance, opts: { workflowService: WorkflowService }) {
  const svc = opts.workflowService;

  // POST /workflows/intake
  app.post('/workflows/intake', {
    preHandler: [requireRole('account_manager', 'admin')],
  }, async (req, reply) => {
    const body = TriggerIntakeSchema.parse(req.body);
    await requireClientAccess(req, body.client_id);
    const run = await svc.triggerIntake(req.user.id, body.client_id, body.transcript_id);
    reply.code(202).send({
      data: {
        workflow_run_id: run.id,
        workflow_type:   run.workflowType,
        status:          run.status,
        poll_url:        `/workflows/${run.id}/status`,
        started_at:      run.startedAt.toISOString(),
      }
    });
  });

  // POST /workflows/agenda
  app.post('/workflows/agenda', {
    preHandler: [requireRole('account_manager', 'admin')],
  }, async (req, reply) => {
    const body = TriggerAgendaSchema.parse(req.body);
    await requireClientAccess(req, body.client_id);
    const run = await svc.triggerAgenda(req.user.id, body.client_id, body.cycle_start, body.cycle_end);
    reply.code(202).send({
      data: {
        workflow_run_id: run.id,
        workflow_type:   run.workflowType,
        status:          run.status,
        poll_url:        `/workflows/${run.id}/status`,
        started_at:      run.startedAt.toISOString(),
        input_refs:      run.inputRefs,
      }
    });
  });

  // GET /workflows/:id/status
  app.get('/workflows/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = await svc.getStatus(req.user.id, id);
    await requireClientAccess(req, run.clientId);  // check after run fetch to get a 404 before 403
    sendSuccess(reply, formatRunResponse(run));
  });

  // PATCH /workflows/:id/status  (Mastra service account only)
  app.patch('/workflows/:id/status', {
    preHandler: [requireMastraServiceAccount],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateStatusSchema.parse(req.body);
    const run = await svc.updateStatus(id, body.status, body.result, body.error);
    sendSuccess(reply, formatRunResponse(run));
  });
}
```

---

## 9. Zod Schemas

```typescript
// apps/api/src/schemas/workflow.schemas.ts

import { z } from 'zod';

export const TriggerIntakeSchema = z.object({
  client_id:     z.string().uuid(),
  transcript_id: z.string().uuid(),
});

export const TriggerAgendaSchema = z.object({
  client_id:   z.string().uuid(),
  cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cycle_end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const WorkflowResultSchema = z.object({
  task_short_ids:  z.array(z.string()).optional(),
  agenda_short_id: z.string().optional(),
});

export const WorkflowErrorSchema = z.object({
  code:    z.string(),
  message: z.string(),
});

export const UpdateStatusSchema = z.object({
  status: z.enum(['running', 'completed', 'failed']),
  result: WorkflowResultSchema.optional(),
  error:  WorkflowErrorSchema.optional(),
}).refine(
  (data) => data.status !== 'failed' || data.error !== undefined,
  { message: 'error is required when status is failed', path: ['error'] }
);
```

---

## 10. Mastra Service Account Middleware

```typescript
// apps/api/src/middleware/require-mastra.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/api-errors.js';

// The Mastra service account has a well-known client_id registered in the auth service.
// The OIDC client credentials token carries an 'azp' (authorized party) or 'sub' claim
// matching the Mastra service identity. Feature 07's token validator extracts all claims.

const MASTRA_CLIENT_ID = process.env['MASTRA_CLIENT_ID'] ?? 'mastra-agent';

export async function requireMastraServiceAccount(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const claims = req.tokenClaims;
  // Client credentials tokens have sub = client_id (no user), confirmed via grant_type or azp claim
  const isServiceToken = claims.sub === MASTRA_CLIENT_ID
    || claims['azp'] === MASTRA_CLIENT_ID
    || claims['client_id'] === MASTRA_CLIENT_ID;

  if (!isServiceToken) {
    throw new ForbiddenError('This endpoint is restricted to the Mastra service account.');
  }
}
```

---

## 11. Environment Variables

New variables required by this feature (added to `apps/api/src/config/env.ts`):

```typescript
MASTRA_BASE_URL:     z.string().url(),                                // Mastra runtime base URL
MASTRA_CLIENT_ID:    z.string().default('mastra-agent'),              // Mastra OIDC client_id
API_BASE_URL:        z.string().url(),                                // This API's public base URL (for callback)
WORKFLOW_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),  // 5 minutes
ADMIN_OWNER:         z.string().uuid().optional(),                    // UUID of the admin user for workflow ownership when no user context (e.g., system-triggered runs)
```

---

## 12. Audit Log Entries

All audit entries use the `audit_log` table from Feature 04. Entries written by this feature:

| Action | entity_type | user_id | metadata |
|---|---|---|---|
| `workflow.triggered` | `workflow_run` | triggering user UUID | `{ workflow_type, client_id, transcript_id \| cycle_start/end }` |
| `workflow.started` | `workflow_run` | null (Mastra callback) | `{ workflow_type, client_id }` |
| `workflow.completed` | `workflow_run` | null | `{ workflow_type, client_id, result }` |
| `workflow.failed` | `workflow_run` | null | `{ workflow_type, client_id, error }` |
| `workflow.timed_out` | `workflow_run` | null | `{ workflow_type, client_id }` |

---

## 13. Performance Requirements

| Operation | Target P95 Latency | Notes |
|---|---|---|
| `POST /workflows/intake` (full flow) | < 500ms | Includes DB write, audit log, async invocation fire |
| `POST /workflows/agenda` (full flow) | < 1000ms | Includes reconciliation call to Feature 13 |
| `GET /workflows/{id}/status` | < 150ms | Single indexed lookup |
| `PATCH /workflows/{id}/status` | < 200ms | Update + audit log |
| Active run check (duplicate prevention) | < 20ms | Partial index scan on status = active |
| Mastra async invocation fire (not await) | < 100ms | HTTP fire-and-forget; does not block response |

---

## 14. Security Requirements

### 14.1 Authorization
| Endpoint | Requirement |
|---|---|
| `POST /workflows/intake` | `account_manager` or `admin`, client access |
| `POST /workflows/agenda` | `account_manager` or `admin`, client access |
| `GET /workflows/{id}/status` | Any authenticated user; client access check via run's `client_id` |
| `PATCH /workflows/{id}/status` | Mastra service account only |

### 14.2 No Token Logging
The Mastra service token in the PATCH callback must not be logged (enforced by Feature 07's pino redaction config).

### 14.3 Client Isolation
All workflow run queries are scoped by `client_id`. A user cannot access or trigger workflow runs for clients they do not have access to.

### 14.4 Mastra Callback URL Integrity
The `callback_base_url` passed to Mastra in invocation payloads is sourced from the `API_BASE_URL` environment variable — never from request input. This prevents SSRF/open-redirect via crafted invocation payloads.

### 14.5 Input Validation
All request bodies validated via Zod schemas before any database interaction. Unknown fields are stripped.

---

## 15. Testing Strategy

### 15.1 Unit Tests (vitest + mocked dependencies)

| Test File | Scenarios |
|---|---|
| `workflow.service.test.ts` | All service methods: precondition failures, success paths, timeout logic, status transitions, fire-and-forget invocation |
| `mastra.adapter.test.ts` | Successful invocation, HTTP error handling, timeout (AbortSignal) |
| `workflow.schemas.test.ts` | Zod schema validation edge cases |
| `require-mastra.test.ts` | Service account identity check — pass and reject |

### 15.2 Integration Tests (vitest + test DB + msw)

| Test File | Scenarios |
|---|---|
| `workflows.route.test.ts` | Full HTTP round-trips for all four endpoints; 202 responses; 409 conflict; 422 no-tasks; status poll; Mastra callback |

### 15.3 Coverage Target
Minimum 85% line/branch coverage, consistent with Feature 07's established target.

### 15.4 Mastra Mock
The MastraAdapter is mocked via `vi.mock` in unit tests. In integration tests, `msw` intercepts the `POST ${MASTRA_BASE_URL}/invoke` fetch call and returns a mocked 200 response.

---

## 16. Dependencies and Integration Points

### 16.1 Internal Dependencies

| Feature | What This Feature Uses |
|---|---|
| 04 (Product Database Schema) | Base database infrastructure and Drizzle setup. The `workflow_runs` table migration is owned by this feature (Feature 17), not Feature 04. |
| 07 (API Scaffolding) | Fastify app, middleware chain (authenticate, loadUser, requireRole), error classes, Drizzle db client, Zod, Pino, Vitest setup |
| 09 (Client Management) | Client access validation utility |
| 10 (Transcript Endpoints) | `TranscriptRepository.findByIdAndClientOrThrow()` |
| 13 (Status Reconciliation) | `ReconciliationService.reconcileClient(clientId)` — invoked before Workflow B agent |

### 16.2 Runtime Dependencies
No new npm packages. Uses:
- Fastify v5 (Feature 07)
- Drizzle ORM (Feature 07)
- Zod v3 (Feature 07)
- Pino (Feature 07)
- Node.js built-in `fetch` (Node.js 22 — established in Feature 00)

### 16.3 New Environment Variables
`MASTRA_BASE_URL`, `MASTRA_CLIENT_ID`, `API_BASE_URL`, `WORKFLOW_TIMEOUT_MS`, `ADMIN_OWNER`

---

## 17. Implementation Notes and Alternatives

### 17.1 Async Invocation: Fire-and-Forget vs. Message Queue
**Chosen approach:** Fire-and-forget HTTP POST to Mastra's invoke endpoint. The `Promise` is not awaited; errors are caught and translated to run `failed` status.

**Alternative considered:** A message queue (e.g., BullMQ, AWS SQS) between the API and Mastra for durability, retry, and backpressure. This is the correct long-term approach but introduces infrastructure complexity out of scope for V1. The fire-and-forget pattern is acceptable for V1 given:
- The Mastra runtime is a stable internal service.
- Failures are surfaced via the `failed` status on the run record.
- Users can manually re-trigger failed workflows.

**Migration path:** If a queue is added in V2, only the `MastraAdapter` class needs to change. The rest of the service and route layer is unaffected.

### 17.2 Workflow B: Reconciliation Before or During Agent?
**Chosen approach:** The API triggers status reconciliation (Feature 13) synchronously during `POST /workflows/agenda` before creating the run record. This ensures the completed-tasks check uses fresh data, and Mastra receives already-reconciled context.

**Alternative:** Mastra calls the reconciliation endpoint itself as its first step. Rejected — this would require Mastra to have reconciliation logic awareness, and reconciliation results would not be available for the pre-flight "no completed tasks" check at the API layer.

### 17.3 PATCH /workflows/{id}/status: Internal vs. External
**Chosen approach:** Expose the status callback as a first-class API endpoint with Mastra service account authentication. This maintains the "API-only data access" principle — Mastra never writes to the database directly.

**Alternative:** Mastra writes directly to the `workflow_runs` table using a restricted database user. Rejected — violates the architectural principle that all data access goes through the API layer.

### 17.4 Cycle Date Fallback for Workflow B
When no `cycle_start` is provided and no prior completed Workflow B run exists for the client, the fallback is the last 30 days. This is a pragmatic default that ensures the first-ever agenda trigger does not span the entire client history. The 30-day window is hard-coded for V1 and can be made configurable per client in V2.

### 17.5 Lazy vs. Proactive Timeout
**Chosen approach:** Lazy timeout — check elapsed time on `GET /workflows/{id}/status`. Requires no background daemon, no cron job, no additional infrastructure. Slightly delayed detection (only triggers when someone polls), but acceptable for V1 where account managers are actively polling while waiting.

**Alternative:** Background job sweeping for stale runs every N minutes. Correct for production at scale; deferred to V2.
