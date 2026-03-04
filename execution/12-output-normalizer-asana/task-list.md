# Task List
# Feature 12: output-normalizer-asana

## Prerequisites

- [ ] Feature 01 (shared-types-package) is complete — `@iexcel/shared-types` exports `NormalizedTask`, `OutputAdapter`, `ExternalRef`, `AsanaExternalRef`, `AdapterContext`, `CustomFieldGidConfig`, and `ApiErrorCode`.
- [ ] Feature 07 (api-scaffolding) is complete — `apps/api/` exists with a working server, structured logger, HTTP client, dependency injection pattern, and error handling middleware.
- [ ] Feature 11 (task-endpoints) is complete or at minimum the `POST /tasks/{id}/push` handler stub exists and is ready to receive the adapter call. Coordinate with feature 11 on the `external_ref` JSONB column migration to avoid duplication.

---

## Phase 1: Shared Types and Interface

- [ ] **1.1** Confirm that `@iexcel/shared-types` already exports the following (added as part of feature 01 or this feature if missing):
  - `NormalizedTask` interface
  - `OutputAdapter` interface with `push(task: NormalizedTask): Promise<ExternalRef>` signature
  - `ExternalRef` type alias
  - `AsanaExternalRef` interface with fields: `provider`, `taskId`, `workspaceId`, `projectId`, `permalinkUrl`
  - `CustomFieldGidConfig` interface with fields: `clientFieldGid`, `scrumStageFieldGid`, `estimatedTimeFieldGid`, `estimatedTimeFormat`
  - `ApiErrorCode` enum values: `PushFailed`, `WorkspaceNotConfigured`, `ValidationError`

  If any are missing, add them to `packages/shared-types/src/` and re-export from the package index.
  References: FRS.md — FR-01, FR-60; TR.md — Section 2.2, 2.3

- [ ] **1.2** Verify TypeScript compiles with zero errors after any shared-types additions:
  ```bash
  nx run shared-types:build
  ```

---

## Phase 2: Database Migration

- [ ] **2.1** Confirm whether the `tasks.external_ref JSONB` migration was applied by feature 11. If not, create a migration file:
  ```sql
  ALTER TABLE tasks DROP COLUMN IF EXISTS asana_task_id;
  ALTER TABLE tasks ADD COLUMN external_ref JSONB;
  ```
  References: TR.md — Section 11.2

- [ ] **2.2** Create a migration file for the `asana_workspaces.custom_field_config` column:
  ```sql
  ALTER TABLE asana_workspaces
  ADD COLUMN custom_field_config JSONB NOT NULL DEFAULT '{}';
  ```
  References: TR.md — Section 11.1; FRS.md — FR-30

- [ ] **2.3** Run migrations against the local development database and confirm the schema changes apply cleanly.

- [ ] **2.4** Verify: Query `\d asana_workspaces` in psql and confirm `custom_field_config` column exists with type `jsonb` and default `{}`.

---

## Phase 3: Module Directory and Error Infrastructure

- [ ] **3.1** Create the adapter module directory and co-located test directory:
  ```
  apps/api/src/adapters/asana/
  apps/api/src/adapters/asana/__tests__/
  ```
  References: TR.md — Section 1.3

- [ ] **3.2** Create `apps/api/src/adapters/asana/errors.ts`.
  - Define and export the `AdapterError` class extending `Error`.
  - Constructor signature: `(code: ApiErrorCode, message: string, httpStatus: number, details?: Record<string, unknown>)`.
  - Set `this.name = 'AdapterError'`.
  - Include `readonly code`, `readonly httpStatus`, `readonly details` fields.
  References: FRS.md — FR-70; TR.md — Section 2.4

- [ ] **3.3** Verify: Import `AdapterError` in a scratch file and confirm TypeScript compiles without errors. Delete scratch file.

---

## Phase 4: Pure Helper Modules

- [ ] **4.1** Create `apps/api/src/adapters/asana/description-formatter.ts`.
  - Implement `parseSections(description: string): ParsedSections | null` using string indexOf for section header detection.
  - Implement and export `formatDescriptionForAsana(description: string): string`.
  - Fallback: if no section markers found, strip all `**` and return trimmed text.
  - Headers in output must be plain text (no `**`).
  References: FRS.md — FR-21; TR.md — Section 3

- [ ] **4.2** Write unit tests in `__tests__/description-formatter.test.ts`:
  - 3-section description → correct plain-text output with all three headers
  - Description without markers → text returned with `**` stripped
  - Empty description → `""` returned without error
  - All three markers present but empty bodies → headers present, empty content lines
  References: TR.md — Section 12.1

- [ ] **4.3** Verify: Run `nx run api:test --testPathPattern=description-formatter` and confirm all tests pass.

- [ ] **4.4** Create `apps/api/src/adapters/asana/estimated-time-formatter.ts`.
  - Implement and export `formatEstimatedTime(interval: string | null, format: 'h_m' | 'hh_mm'): string | null`.
  - Parse `"hh:mm"` input string with regex.
  - Return `"Xh Ym"` for `h_m` format, `"HH:MM"` for `hh_mm` format.
  - Return `null` for null input or unparseable string.
  References: FRS.md — FR-25; TR.md — Section 4

- [ ] **4.5** Write unit tests in `__tests__/estimated-time-formatter.test.ts`:
  - `"02:30"` + `h_m` → `"2h 30m"`
  - `"03:00"` + `h_m` → `"3h 0m"`
  - `"00:45"` + `h_m` → `"0h 45m"`
  - `"02:30"` + `hh_mm` → `"02:30"`
  - `"not-a-time"` → `null`
  - `null` input → `null`
  References: TR.md — Section 12.2

- [ ] **4.6** Verify: Run `nx run api:test --testPathPattern=estimated-time-formatter` and confirm all tests pass.

---

## Phase 5: Workspace Router

- [ ] **5.1** Create `apps/api/src/adapters/asana/workspace-router.ts`.
  References: TR.md — Section 5

- [ ] **5.2** Define the internal `ResolvedRouting` interface:
  ```typescript
  interface ResolvedRouting {
    workspaceGid: string;
    projectGid: string;
    accessToken: string;
    customFieldConfig: CustomFieldGidConfig;
  }
  ```

- [ ] **5.3** Implement and export `resolveRouting(task: NormalizedTask, db: DatabaseService): Promise<ResolvedRouting>`:
  1. Attempt task-level override: use `task.asanaWorkspaceId` and `task.asanaProjectId` if both non-null.
  2. Fall back to client defaults: fetch client record via `db.clients.findById(task.clientId)`.
  3. If workspace GID still null: throw `AdapterError(ApiErrorCode.WorkspaceNotConfigured, ..., 422, { taskId, clientId })`.
  4. Fetch `AsanaWorkspace` record via `db.asanaWorkspaces.findByGid(workspaceGid)`.
  5. Validate `customFieldConfig` completeness — throw `WORKSPACE_NOT_CONFIGURED` with `missingFields` array if any GID key is absent.
  6. Return resolved routing.
  References: FRS.md — FR-10, FR-11, FR-12, FR-32; TR.md — Section 5

- [ ] **5.4** Write unit tests in `__tests__/workspace-router.test.ts` with mocked `DatabaseService`:
  - Task-level override: client record not fetched
  - Client default used: correct GIDs returned
  - No workspace at either level: `WORKSPACE_NOT_CONFIGURED` thrown with `taskId` and `clientId`
  - Missing GID config key: `WORKSPACE_NOT_CONFIGURED` thrown with `missingFields`
  References: TR.md — Section 12.3

- [ ] **5.5** Verify: Run `nx run api:test --testPathPattern=workspace-router` and confirm all tests pass.

---

## Phase 6: Assignee Resolver

- [ ] **6.1** Create `apps/api/src/adapters/asana/assignee-resolver.ts`.
  References: TR.md — Section 7

- [ ] **6.2** Implement the in-memory member cache using a `Map<string, { members: AsanaMember[]; fetchedAt: number }>` with `MEMBER_CACHE_TTL_MS = 15 * 60 * 1000`.

- [ ] **6.3** Implement `getWorkspaceMembers(workspaceGid, accessToken): Promise<AsanaMember[]>`:
  - Return cached members if TTL has not expired.
  - Otherwise fetch `GET /workspaces/{gid}/users?opt_fields=gid,name,email` and update cache.

- [ ] **6.4** Implement and export `resolveAssigneeGid(assigneeName: string | null, workspaceGid: string, accessToken: string): Promise<string | null>`:
  - Return `null` immediately if `assigneeName` is null.
  - Attempt: exact name match, case-insensitive name match, email match (in that order).
  - If no match: log warning with `assigneeName` and `workspaceGid`, return `null`.
  References: FRS.md — FR-22, FR-40; TR.md — Section 7

- [ ] **6.5** Write unit tests in `__tests__/assignee-resolver.test.ts` with mocked Asana HTTP calls:
  - Exact name match → correct GID
  - Case-insensitive match → correct GID
  - Email match → correct GID
  - No match → `null` and warning logged
  - Null assignee → `null` without HTTP call
  - Second call uses cache (HTTP called only once)
  - Call after TTL expiry refetches (HTTP called twice)
  References: TR.md — Section 12.4

- [ ] **6.6** Verify: Run `nx run api:test --testPathPattern=assignee-resolver` and confirm all tests pass.

---

## Phase 7: Custom Field Resolver

- [ ] **7.1** Create `apps/api/src/adapters/asana/custom-field-resolver.ts`.
  References: TR.md — Section 8

- [ ] **7.2** Implement the in-memory enum option cache using a `Map<string, { options: EnumOption[]; fetchedAt: number }>` with `ENUM_CACHE_TTL_MS = 5 * 60 * 1000`.

- [ ] **7.3** Implement `getEnumOptions(fieldGid, accessToken): Promise<EnumOption[]>`:
  - Return cached options if TTL has not expired.
  - Otherwise fetch `GET /custom_fields/{gid}?opt_fields=enum_options` and update cache.

- [ ] **7.4** Implement and export `resolveEnumOptionGid(fieldGid, displayName, accessToken, fieldLabel): Promise<string | null>`:
  - Case-insensitive name match against cached enum options.
  - If no match: log warning with `fieldName`, `displayName`, and `fieldGid`. Return `null`.
  References: FRS.md — FR-23, FR-24, FR-31; TR.md — Section 8

- [ ] **7.5** Write unit tests in `__tests__/custom-field-resolver.test.ts` with mocked Asana HTTP calls:
  - Exact display name match → correct enum option GID
  - Case-insensitive match → correct enum option GID
  - No match → `null` and warning logged with `fieldName`
  - Second call uses cache (HTTP called only once)
  - Call after TTL expiry refetches (HTTP called twice)
  References: TR.md — Section 12.5

- [ ] **7.6** Verify: Run `nx run api:test --testPathPattern=custom-field-resolver` and confirm all tests pass.

---

## Phase 8: Asana HTTP Client

- [ ] **8.1** Create `apps/api/src/adapters/asana/asana-client.ts`.
  References: TR.md — Section 6

- [ ] **8.2** Implement `fetchWithTimeout(url, options, timeoutMs): Promise<Response>` using `AbortController`. On abort: throw `AdapterError(ApiErrorCode.PushFailed, 'Asana API request timed out', 502)`.
  References: FRS.md — FR-45; TR.md — Section 6.3

- [ ] **8.3** Add `p-retry` to `apps/api/package.json` if not already present (check feature 07's dependency list first).

- [ ] **8.4** Implement `createTaskWithRetry(payload, accessToken): Promise<AsanaCreateTaskResponse>`:
  - Use `p-retry` with `retries: 2`, exponential back-off, and `randomize: true`.
  - Non-retryable errors (400, 401, 403, 404, other 4xx except 429): use `AbortError` to stop retries immediately. Throw `AdapterError(ApiErrorCode.PushFailed, ..., 502, { asanaStatus, asanaBody })`.
  - Retryable (429, 5xx): honour `Retry-After` header if present; log warning with `attempt` number before retry.
  - After retries exhausted: throw `AdapterError(ApiErrorCode.PushFailed, 'Asana API push failed after maximum retries', 502)`.
  References: FRS.md — FR-43, FR-44; TR.md — Section 6.2

- [ ] **8.5** Export `createTaskWithRetry` and `AsanaCreateTaskPayload` type from `asana-client.ts`.

- [ ] **8.6** Write unit tests in `__tests__/asana-client.test.ts` using mocked HTTP responses:
  - 201 response → returns parsed body
  - 401 → `PUSH_FAILED` with token message, no retry
  - 403 → `PUSH_FAILED` with access denied message, no retry
  - 404 → `PUSH_FAILED` with GID not found message, no retry
  - 400 with error body → `PUSH_FAILED` with error body in details, no retry
  - 429 then 201 → success after retry; warning logged per retry
  - 503 three times → `PUSH_FAILED` with retry exhausted message
  - Timeout → `PUSH_FAILED` with timeout message
  References: TR.md — Section 12.6

- [ ] **8.7** Verify: Run `nx run api:test --testPathPattern=asana-client` and confirm all tests pass.

---

## Phase 9: Adapter Orchestration

- [ ] **9.1** Create `apps/api/src/adapters/asana/adapter.ts`.
  References: TR.md — Section 9

- [ ] **9.2** Implement the `AsanaOutputAdapter` class:
  - Constructor: `constructor(private readonly db: DatabaseService)`
  - Method: `async push(task: NormalizedTask): Promise<ExternalRef>`
  - Sequence: validate title → resolve routing → format notes → resolve assignee GID → resolve all three custom field values → build payload → call `createTaskWithRetry` → return `AsanaExternalRef`.
  - Custom fields: include key in `custom_fields` only if GID was successfully resolved (omit on null — do not set to null).
  - Log events at each significant step per FRS.md — FR-80.
  References: FRS.md — FR-20 through FR-26, FR-41, FR-42, FR-80; TR.md — Section 9.1

- [ ] **9.3** Validate `task.title` is non-empty at the start of `push()`. If empty, throw `AdapterError(ApiErrorCode.ValidationError, 'Task title is required to create an Asana task', 422)`.
  References: FRS.md — FR-20

- [ ] **9.4** Confirm the `push()` method has no shared mutable state (all state is local to the invocation or read-only cached). Safe for concurrent calls.
  References: FRS.md — FR-50; TR.md — Section 13

---

## Phase 10: Public Export

- [ ] **10.1** Create `apps/api/src/adapters/asana/index.ts`.
  - Export `AsanaOutputAdapter` from `./adapter`.
  - Export `AdapterError` from `./errors`.
  - Do not export internal sub-module functions (`resolveRouting`, `formatDescriptionForAsana`, etc.).
  References: TR.md — Section 1.3

---

## Phase 11: Integration Tests

- [ ] **11.1** Set up HTTP mocking library (`msw` or `nock`) in the test environment if not already configured.

- [ ] **11.2** Write `__tests__/adapter.integration.test.ts`:
  - Create a mock `DatabaseService` that returns configurable workspace and client records.
  - Mock Asana HTTP endpoints: `POST /tasks`, `GET /workspaces/{gid}/users`, `GET /custom_fields/{gid}`.
  References: TR.md — Section 12.6

- [ ] **11.3** Implement happy path integration tests:
  - Full task push with all fields: verify `ExternalRef` shape, correct `POST /tasks` payload structure.
  - Null assignee: verify `assignee` field absent from payload.
  - Unknown client name: verify `clientFieldGid` key absent from `custom_fields`; verify warning logged.
  References: TR.md — Section 12.6

- [ ] **11.4** Implement workspace routing integration tests:
  - Task-level override: client API not called; correct GIDs in payload.
  - Client default: client API called; correct GIDs in payload.
  - No workspace configured: `WORKSPACE_NOT_CONFIGURED` error thrown; Asana API not called.
  References: FRS.md — FR-10, FR-11; TR.md — Section 12.6

- [ ] **11.5** Implement error handling integration tests:
  - 401 → `PUSH_FAILED` with correct message.
  - 403 → `PUSH_FAILED` with correct message.
  - 404 → `PUSH_FAILED` with correct message.
  - 400 with body → `PUSH_FAILED` with Asana body in details.
  References: FRS.md — FR-43; TR.md — Section 12.6

- [ ] **11.6** Implement retry integration tests:
  - 429 on first attempt, 201 on second → success; retry warning logged.
  - 503 on all three attempts → `PUSH_FAILED` after retries exhausted.
  - Timeout → `PUSH_FAILED` with timeout message.
  References: FRS.md — FR-44, FR-45; TR.md — Section 12.6

- [ ] **11.7** Implement concurrent push isolation test:
  - Two simultaneous `push()` calls with different task/workspace data.
  - Confirm each returns the correct `ExternalRef` for its own task.
  References: FRS.md — FR-51; TR.md — Section 12.6

- [ ] **11.8** Verify: Run `nx run api:test --testPathPattern=adapter.integration` and confirm all tests pass.

---

## Phase 12: API Handler Integration Point

- [ ] **12.1** Register `AsanaOutputAdapter` in the API application's dependency container (per the pattern established by feature 07). It must be instantiated once at startup with the shared `DatabaseService` instance.
  References: TR.md — Section 10.2

- [ ] **12.2** In feature 11's push handler stub, replace the placeholder with the real adapter call:
  ```typescript
  const externalRef = await adapter.push(normalizedTask);
  await db.tasks.update(task.id, {
    external_ref: externalRef,
    status: 'pushed',
    pushed_at: new Date(),
  });
  ```
  The adapter does not write to the database — that remains feature 11's responsibility.
  References: FRS.md — FR-60, FR-61; TR.md — Section 10.1

---

## Phase 13: Security and Logging Verification

- [ ] **13.1** Review all log statements added in this feature.
  Confirm no access tokens appear in any log output (including error `details`).
  References: TR.md — Section 14.1

- [ ] **13.2** Confirm no task title or description content appears in any log output at any level.
  Only structural metadata is logged: `taskId`, `shortId`, `workspaceGid`, `projectGid`, `asanaTaskGid`, `hasAssignee`, `customFieldCount`, retry/error metadata.
  References: FRS.md — FR-80; TR.md — Section 14.2

- [ ] **13.3** Verify `PUSH_FAILED` error `details` objects do not contain the Asana access token or raw task description.
  References: TR.md — Section 14.1, 14.2

---

## Phase 14: Final Verification

- [ ] **14.1** Run the full API test suite: `nx run api:test`. Confirm zero failures and zero new skipped tests.

- [ ] **14.2** Run TypeScript type check: `nx run api:type-check`. Confirm zero type errors.

- [ ] **14.3** Confirm `AsanaOutputAdapter` structurally satisfies the `OutputAdapter` interface from `@iexcel/shared-types` — TypeScript type check confirms no errors.

- [ ] **14.4** Confirm the `ExternalRef` returned by `push()` exactly matches the `AsanaExternalRef` interface: `provider`, `taskId`, `workspaceId`, `projectId`, `permalinkUrl` all present as non-empty strings.

- [ ] **14.5** Confirm `push()` never writes to the database directly — it only returns the `ExternalRef`.

- [ ] **14.6** Confirm workspace routing cascade order: task-level override > client default > `WORKSPACE_NOT_CONFIGURED`. Verify with the workspace-router unit tests.

- [ ] **14.7** Confirm all three custom fields (Client, Scrum Stage, Estimated Time) are present in the `POST /tasks` payload for a fully-configured happy path push.

- [ ] **14.8** Confirm `scrumStage` defaults to `"Backlog"` in the payload when `NormalizedTask.scrumStage` is null.

- [ ] **14.9** Confirm the `notes` field in the Asana payload contains no `**` bold markers.

- [ ] **14.10** Confirm the database schema changes (migrations from Phase 2) are included in the feature branch and do not conflict with feature 11's migrations.

---

## Completion Criteria

This feature is complete when:

- [ ] All seven source files exist under `apps/api/src/adapters/asana/`
- [ ] `AsanaOutputAdapter` is exported from `apps/api/src/adapters/asana/index.ts`
- [ ] All unit tests pass (description formatter, estimated time formatter, workspace router, assignee resolver, custom field resolver, Asana client)
- [ ] All integration tests pass (adapter.integration.test.ts — all 12 test suites)
- [ ] TypeScript strict mode reports zero errors
- [ ] The adapter structurally satisfies `OutputAdapter` from `@iexcel/shared-types`
- [ ] The `ExternalRef` shape exactly matches `AsanaExternalRef` from `@iexcel/shared-types`
- [ ] No access tokens or task content appear in any log output
- [ ] Database migrations for `asana_workspaces.custom_field_config` and `tasks.external_ref` are included
- [ ] Feature 11's push handler is wired to call this adapter
- [ ] Feature 13 implementer can read `external_ref.taskId` from the database without reading this feature's internals
