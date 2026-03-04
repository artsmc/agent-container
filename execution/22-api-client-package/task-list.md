# Task List
# Feature 22: API Client Package (`packages/api-client`)

**Date:** 2026-03-03
**Phase:** 5 — API Client
**Blocked by:** Feature 00 (nx-monorepo-scaffolding), Feature 01 (shared-types-package), Feature 07 (api-scaffolding)

---

## Prerequisites (verify before starting)

- [ ] Feature 00 complete: Nx monorepo scaffolded, `nx.json`, `tsconfig.base.json`, `package.json` exist at root
- [ ] Feature 01 complete: `@iexcel/shared-types` package exists and exports `ApiErrorCode`, `ApiErrorResponse`, `PaginatedResponse`, all request/response types from `api.ts`
- [ ] Feature 07 complete: API endpoints are confirmed and match the endpoint list in `FRS.md` — resolve any open questions in `TR.md §17` against the feature 07 and 11 specs before writing endpoint methods

---

## Phase 1: Package Scaffolding

- [ ] **1.1** Create the directory `packages/api-client/src/` within the Nx monorepo (References: TR.md §4 — File Structure)

- [ ] **1.2** Create `packages/api-client/project.json` with the Nx library configuration: build executor `@nx/js:tsc`, lint, test targets, and tags `["scope:shared", "type:library"]` (References: TR.md §8.1)

- [ ] **1.3** Create `packages/api-client/package.json` with name `@iexcel/api-client`, `"type": "module"`, exports map pointing to `./src/index.ts`, and `peerDependencies` for `@iexcel/shared-types` (References: TR.md §8.2)

- [ ] **1.4** Create `packages/api-client/tsconfig.json` extending `../../tsconfig.base.json` with `strict: true`, `module: ESNext`, `moduleResolution: bundler`, and project reference to `shared-types` (References: TR.md §9.1)

- [ ] **1.5** Create `packages/api-client/tsconfig.lib.json` for declaration emit (Reference: mirror `packages/auth-client/tsconfig.lib.json` pattern from Feature 06)

- [ ] **1.6** Create `packages/api-client/tsconfig.spec.json` for test-specific configuration

- [ ] **1.7** Create `packages/api-client/vite.config.ts` for Vitest configuration with coverage settings (90% line/branch target) (References: TR.md §11.3)

- [ ] **1.8** Add the `@iexcel/api-client` path alias to the root `tsconfig.base.json`:
  ```json
  "@iexcel/api-client": ["packages/api-client/src/index.ts"]
  ```
  (References: TR.md §8.3)

- [ ] **1.9** Verify `nx graph` shows `api-client` as a node with `shared-types` as its only upstream dependency

---

## Phase 2: Type Definitions

- [ ] **2.1** Create `packages/api-client/src/types/client-options.ts` — define `TokenProvider` interface (`getAccessToken`, `refreshAccessToken`) and `ApiClientOptions` interface (`baseUrl`, `tokenProvider`, `fetchImpl`) (References: TR.md §5.1, FRS.md §2)

- [ ] **2.2** Create `packages/api-client/src/types/errors.ts` — define `ApiClientError` class extending `Error` with `code`, `statusCode`, and `details` fields. Import `ApiErrorCode` from `@iexcel/shared-types`. (References: TR.md §5.2, FRS.md §5.1)

- [ ] **2.3** Create `packages/api-client/src/types/additional.ts` — define `ClientStatusResponse`, `AuditQueryParams`, `AuditEntry`, `AddAsanaWorkspaceRequest`, `ImportStatusResponse`, `TriggerImportRequest`, `RejectTaskRequest` (References: TR.md §5.3)

  Note: Confirm with Feature 07/11/14 specs whether these types should live in `shared-types` instead. If so, import from there rather than defining locally.

- [ ] **2.4** Create `packages/api-client/src/types/index.ts` — barrel re-export of all types

---

## Phase 3: HTTP Transport Core

- [ ] **3.1** Create `packages/api-client/src/core/http.ts` — implement the internal `HttpTransport` class (not exported publicly):
  - `request<T>(options: RequestOptions): Promise<T>` — main HTTP method
  - `buildUrl(path, params)` — URL construction with trailing slash normalisation, query param serialisation (omit undefined/null)
  - `buildHeaders(skipAuth?)` — sets `Content-Type: application/json`, `Accept: application/json`, optionally `Authorization: Bearer <token>`
  - Network error wrapping in try/catch → `ApiClientError` with `NETWORK_ERROR`
  - 401 single-retry logic via `tokenProvider.refreshAccessToken()`
  - Error parsing: attempt JSON parse → extract `error.code`/`message`/`details` → `ApiClientError`; fallback to `UNKNOWN_ERROR` if not parseable
  - 204 / empty body handling: return `undefined as T`
  (References: TR.md §6, FRS.md §3, GS.md — Token Attachment and Error Handling scenarios)

- [ ] **3.2** Write unit tests for `http.ts` covering all scenarios in `GS.md`:
  - Token attached on every authenticated request
  - Public endpoint bypass (`skipAuth: true`) — no token, no `getAccessToken` call
  - 401 triggers refresh + retry once
  - Second 401 after refresh throws `ApiClientError(UNAUTHORIZED)`
  - 403 does not trigger refresh, throws `ApiClientError(FORBIDDEN)`
  - API JSON error parsed correctly into `ApiClientError` fields
  - Non-JSON 502 results in `ApiClientError(UNKNOWN_ERROR)` with raw body
  - Network error (`ECONNREFUSED`) results in `ApiClientError(NETWORK_ERROR)`
  - URL trailing slash normalised
  - Undefined params omitted from query string
  (References: GS.md — all scenarios under Token Attachment, Token Refresh, Error Handling)

---

## Phase 4: ApiClient Class

- [ ] **4.1** Create `packages/api-client/src/core/api-client.ts` — implement the `ApiClient` class and `createApiClient` factory function:
  - Constructor accepts `ApiClientOptions`, instantiates `HttpTransport`
  - Factory function `createApiClient(options): ApiClient`
  (References: TR.md §7, FRS.md §3)

- [ ] **4.2** Implement auth endpoint method in `src/endpoints/auth.ts`:
  - `getMe()` — `GET /me`
  (References: FRS.md §4.1, FR-10)

- [ ] **4.3** Implement client endpoint methods in `src/endpoints/clients.ts`:
  - `listClients(params?)` — `GET /clients`
  - `getClient(clientId)` — `GET /clients/{id}`
  - `updateClient(clientId, body)` — `PATCH /clients/{id}`
  - `getClientStatus(clientId)` — `GET /clients/{id}/status`
  (References: FRS.md §4.2, FR-11 through FR-14)

- [ ] **4.4** Implement transcript endpoint methods in `src/endpoints/transcripts.ts`:
  - `listTranscripts(clientId, params?)` — `GET /clients/{id}/transcripts`
  - `submitTranscript(clientId, body)` — `POST /clients/{id}/transcripts`
  - `getTranscript(transcriptId)` — `GET /transcripts/{id}`
  (References: FRS.md §4.3, FR-15 through FR-17)

- [ ] **4.5** Implement task endpoint methods in `src/endpoints/tasks.ts`:
  - `listTasks(clientId, params?)` — `GET /clients/{id}/tasks`
  - `createTasks(clientId, body)` — `POST /clients/{id}/tasks`
  - `getTask(taskId)` — `GET /tasks/{id}` (accepts UUID or short ID)
  - `updateTask(taskId, body)` — `PATCH /tasks/{id}`
  - `approveTask(taskId)` — `POST /tasks/{id}/approve`
  - `rejectTask(taskId, body?)` — `POST /tasks/{id}/reject`
  - `pushTask(taskId)` — `POST /tasks/{id}/push`
  - `batchApproveTasks(clientId, body)` — `POST /clients/{id}/tasks/approve`
  - `batchPushTasks(clientId, body)` — `POST /clients/{id}/tasks/push`
  (References: FRS.md §4.4, FR-18 through FR-26)

- [ ] **4.6** Implement agenda endpoint methods in `src/endpoints/agendas.ts`:
  - `listAgendas(clientId, params?)` — `GET /clients/{id}/agendas`
  - `createAgenda(clientId, body)` — `POST /clients/{id}/agendas`
  - `getAgenda(agendaId)` — `GET /agendas/{id}` (accepts UUID or short ID)
  - `updateAgenda(agendaId, body)` — `PATCH /agendas/{id}`
  - `finalizeAgenda(agendaId)` — `POST /agendas/{id}/finalize`
  - `shareAgenda(agendaId)` — `POST /agendas/{id}/share`
  - `emailAgenda(agendaId, body?)` — `POST /agendas/{id}/email`
  - `exportAgenda(agendaId)` — `POST /agendas/{id}/export`
  - `getSharedAgenda(shareToken)` — `GET /shared/{token}` (no auth)
  (References: FRS.md §4.5, FR-27 through FR-35)

- [ ] **4.7** Implement workflow endpoint methods in `src/endpoints/workflows.ts`:
  - `triggerIntakeWorkflow(body)` — `POST /workflows/intake`
  - `triggerAgendaWorkflow(body)` — `POST /workflows/agenda`
  - `getWorkflowStatus(workflowId)` — `GET /workflows/{id}/status`
  (References: FRS.md §4.6, FR-36 through FR-38)

- [ ] **4.8** Implement Asana workspace endpoint methods in `src/endpoints/asana.ts`:
  - `listAsanaWorkspaces()` — `GET /asana/workspaces`
  - `addAsanaWorkspace(body)` — `POST /asana/workspaces`
  - `deleteAsanaWorkspace(workspaceId)` — `DELETE /asana/workspaces/{id}` (returns void)
  (References: FRS.md §4.7, FR-39 through FR-41)

- [ ] **4.9** Implement import endpoint methods in `src/endpoints/import.ts`:
  - `triggerImport(clientId, body)` — `POST /clients/{id}/import`
  - `getImportStatus(clientId)` — `GET /clients/{id}/import/status`
  (References: FRS.md §4.8, FR-42 through FR-43)

- [ ] **4.10** Implement audit endpoint methods in `src/endpoints/audit.ts`:
  - `queryAuditLog(params)` — `GET /audit`
  (References: FRS.md §4.9, FR-44)

---

## Phase 5: Barrel Exports

- [ ] **5.1** Create `packages/api-client/src/endpoints/index.ts` — re-export all endpoint methods (these are mixed into `ApiClient` class, not re-exported as standalone functions; this file may simply re-export the grouping types)

- [ ] **5.2** Create `packages/api-client/src/core/index.ts` — export `ApiClient` class and `createApiClient` factory

- [ ] **5.3** Create `packages/api-client/src/index.ts` — root barrel export:
  - `export { createApiClient, ApiClient } from './core'`
  - `export { ApiClientError } from './types/errors'`
  - `export type { TokenProvider, ApiClientOptions } from './types/client-options'`
  - `export type { ClientStatusResponse, AuditEntry, AuditQueryParams, ... } from './types/additional'`
  - Do NOT re-export `shared-types` — consumers import those directly

---

## Phase 6: Endpoint Unit Tests

- [ ] **6.1** Write unit tests for all auth and client endpoints (References: GS.md, TR.md §11.1)

- [ ] **6.2** Write unit tests for all transcript endpoints

- [ ] **6.3** Write unit tests for all task endpoints — including short ID vs UUID, batch operation partial success (References: GS.md — Task Endpoint Methods scenarios)

- [ ] **6.4** Write unit tests for all agenda endpoints — including `getSharedAgenda` no-auth behaviour (References: GS.md — Agenda Endpoint Methods, Public Endpoint Bypass scenarios)

- [ ] **6.5** Write unit tests for workflow, Asana, import, and audit endpoints

- [ ] **6.6** Run `nx test api-client --coverage` and confirm coverage is >= 90% line/branch

---

## Phase 7: Integration and Validation

- [ ] **7.1** Run `nx build api-client` — confirm zero TypeScript errors and clean output in `dist/packages/api-client/`

- [ ] **7.2** Run `nx lint api-client` — confirm zero lint violations

- [ ] **7.3** Run `nx type-check api-client` (or `tsc --noEmit`) — confirm strict TypeScript compliance

- [ ] **7.4** Run `nx affected:build` from root — confirm `apps/ui` and `apps/mastra` still build correctly after adding the new path alias (if those packages exist at this stage)

- [ ] **7.5** Verify `nx graph` shows `api-client` with correct upstream (`shared-types`) and downstream (`ui`, `mastra`) edges

---

## Phase 8: Consumer Integration Smoke Test

These tasks are only possible once at least one consumer (Feature 23/24 for UI, or Feature 33 for terminal) begins implementation. They serve as acceptance gates.

- [ ] **8.1** UI consumer: import `createApiClient` from `@iexcel/api-client` in `apps/ui` — confirm TypeScript resolves correctly without errors

- [ ] **8.2** Mastra consumer: import `createApiClient` in `apps/mastra` — confirm TypeScript resolves correctly

- [ ] **8.3** Verify that a `TokenProvider` implementation in the UI (using httpOnly cookie/session) compiles without error against the `TokenProvider` interface

- [ ] **8.4** Verify that a `TokenProvider` implementation in Mastra (using `auth-client` client credentials) compiles without error

---

## Completion Criteria

- [ ] All four documentation files (`FRD.md`, `FRS.md`, `GS.md`, `TR.md`) exist in `/execution/22-api-client-package/docs/`
- [ ] All endpoint methods are implemented and typed (no `any` in public API surface)
- [ ] Unit test coverage >= 90% line/branch
- [ ] `nx build api-client` passes cleanly
- [ ] `nx lint api-client` passes cleanly
- [ ] `nx test api-client` passes cleanly
- [ ] Path alias `@iexcel/api-client` registered in root `tsconfig.base.json`
- [ ] `nx graph` shows correct dependency edges
- [ ] Open questions in `TR.md §17` resolved or deferred with explicit notes
