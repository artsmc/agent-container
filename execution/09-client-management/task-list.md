# Task List — Feature 09: Client Management

## Prerequisites

Before starting any task in this list, confirm the following are complete:

- [ ] Feature 07 (api-scaffolding) is merged: the API server is running, middleware chain exists, `req.user` is populated by token validation.
- [ ] Feature 04 (product-database-schema) is merged: `clients`, `users`, `client_users`, `tasks`, `agendas`, and `audit_log` tables exist.
- [ ] Feature 01 (shared-types-package) is merged (or in progress): shared TypeScript types are available.

---

## Phase 1: Setup and Validation Layer

- [ ] **1.1** Confirm `client_users` join table exists in the database schema from Feature 04. If not, write and apply a migration to create it: `(client_id UUID, user_id UUID, PRIMARY KEY (client_id, user_id))`.
  - References: TR.md — Section 3.2
  - Size: Small

- [ ] **1.2** Confirm the following indexes exist (from Feature 04). If any are missing, create a migration to add them: `client_users(user_id)`, `tasks(client_id, status)`, `agendas(client_id, updated_at DESC)`.
  - References: TR.md — Section 4
  - Size: Small

- [ ] **1.3** Define the shared `ClientRecord` TypeScript type (or Pydantic model) in the shared-types package. Fields: `id`, `name`, `grain_playlist_id`, `default_asana_workspace_id`, `default_asana_project_id`, `email_recipients` (array of `EmailRecipient`), `created_at`, `updated_at`.
  - References: TR.md — Section 2.2, FRS Section 2.3
  - Size: Small

- [ ] **1.4** Define the `EmailRecipient` type: `{ name: string, email: string }`.
  - References: TR.md — Section 2.2
  - Size: Small (part of 1.3 ticket if types are co-located)

- [ ] **1.5** Define the PATCH body validation schema for `PATCH /clients/{id}`. Use Zod (if Node.js/Fastify) or a Pydantic model (if Python/FastAPI). Cover all fields, all type constraints, email format validation, and the "at least one field" requirement.
  - References: FRS Section 3.2, TR.md Section 2.3
  - Size: Medium

- [ ] **1.6** Define the `ClientStatusResponse` type: `client_id`, `client_name`, `tasks` (with all status counts), `agenda` (with `current: AgendaSummary | null` and `is_ready_to_share: boolean`), `next_call: null`.
  - References: TR.md — Section 2.4
  - Size: Small

---

## Phase 2: Database Query Layer (Repository / Service)

- [ ] **2.1** Implement `listClients(userId, role, page, perPage)` function:
  - Admin path: `SELECT * FROM clients ORDER BY name ASC LIMIT $1 OFFSET $2`.
  - Non-admin path: join through `client_users` for the given `userId`.
  - Parallel COUNT query for pagination totals.
  - Returns `{ rows: ClientRecord[], total: number }`.
  - References: TR.md — Section 2.1, FRS Section 1.2
  - Size: Medium

- [ ] **2.2** Implement `getClientById(clientId, userId, role)` function:
  - Query client by `id`.
  - For non-admin: verify `client_users` record exists for this user+client combo.
  - Return `ClientRecord | null` (null if not found or not accessible).
  - References: TR.md — Section 2.2, FRS Section 2
  - Size: Medium

- [ ] **2.3** Implement `updateClient(clientId, patchBody)` function:
  - Accepts only the fields present in `patchBody` (dynamic SQL update or ORM partial update).
  - Always sets `updated_at = NOW()`.
  - Returns the full updated `ClientRecord`.
  - References: TR.md — Section 2.3, FRS Section 3
  - Size: Medium

- [ ] **2.4** Implement `getClientTaskCounts(clientId)` function:
  - `SELECT status, COUNT(*) FROM tasks WHERE client_id = $1 GROUP BY status`.
  - Returns `{ draft: n, approved: n, pushed: n, rejected: n, total: n }` with zero-filled defaults for missing statuses.
  - References: TR.md — Section 2.4
  - Size: Small

- [ ] **2.5** Implement `getMostRecentAgenda(clientId)` function:
  - `SELECT id, short_id, status, cycle_start, cycle_end, updated_at FROM agendas WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 1`.
  - Returns `AgendaSummary | null`.
  - References: TR.md — Section 2.4
  - Size: Small

- [ ] **2.6** Implement `writeAuditLog(entry)` function (if not already provided by Feature 07 scaffolding):
  - Accepts `{ user_id, action, entity_type, entity_id, metadata, source }`.
  - Inserts into `audit_log`.
  - References: TR.md — Section 5
  - Size: Small

---

## Phase 3: Route Handlers

- [ ] **3.1** Implement `GET /clients` route handler:
  - Parse and validate `page` and `per_page` query parameters (defaults: 1, 20; max per_page: 100).
  - Call `listClients()`.
  - Return `ListClientsResponse` with `data` and `pagination`.
  - References: FRS Section 1, GS — "List Clients" scenarios, TR.md Section 2.1
  - Size: Medium

- [ ] **3.2** Implement `GET /clients/:id` route handler:
  - Validate `id` is a UUID. Return `400 INVALID_ID` if not.
  - Call `getClientById()`. Return `404 CLIENT_NOT_FOUND` if null.
  - Return `ClientRecord`.
  - References: FRS Section 2, GS — "Get Client Detail" scenarios, TR.md Section 2.2
  - Size: Small

- [ ] **3.3** Implement `PATCH /clients/:id` route handler:
  - Validate UUID format.
  - Apply PATCH body validation schema (from Task 1.5). Return `400 INVALID_BODY` on failure.
  - Check role: Team Member → `403 FORBIDDEN`.
  - Call `getClientById()` for access check. Return `404 CLIENT_NOT_FOUND` if null.
  - Compute `changed_fields` by diffing body against current record values.
  - Call `updateClient()`.
  - Call `writeAuditLog()` with `action: 'client.updated'` and `changed_fields`.
  - Return full updated `ClientRecord`.
  - References: FRS Section 3, GS — "Update Client Configuration" scenarios, TR.md Sections 2.3, 5
  - Size: Large

- [ ] **3.4** Implement `GET /clients/:id/status` route handler:
  - Validate UUID format.
  - Call `getClientById()` for access check. Return `404 CLIENT_NOT_FOUND` if null.
  - Execute `getClientTaskCounts()` and `getMostRecentAgenda()` concurrently.
  - Assemble and return `ClientStatusResponse`.
  - Set `is_ready_to_share = agenda.current?.status === 'finalized'`.
  - Always set `next_call = null`.
  - References: FRS Section 4, GS — "Get Client Status" scenarios, TR.md Section 2.4
  - Size: Medium

---

## Phase 4: Error Handling

- [ ] **4.1** Verify that all error responses from this feature's handlers match the standard API error format (`{ error: { code, message, details } }`). Confirm consistency with the format established in Feature 07.
  - References: TR.md — Section 6, api-prd.md — Error Handling
  - Size: Small

- [ ] **4.2** Verify that `404 CLIENT_NOT_FOUND` is returned (not `403`) for clients that exist but the user cannot access — across all four endpoints.
  - References: TR.md — Section 7.1
  - Size: Small (review/test task)

---

## Phase 5: Unit Tests

- [ ] **5.1** Unit test: PATCH body validation schema — test each field's valid and invalid inputs, including email format, max lengths, max array size, empty `name`, empty body, unknown fields.
  - References: GS — "Update Client Configuration" error scenarios, FRS Section 3.5
  - Size: Medium

- [ ] **5.2** Unit test: `changed_fields` diff logic — given current record and patch body, verify only actually-changed fields appear in the output.
  - References: TR.md — Section 5.3
  - Size: Small

- [ ] **5.3** Unit test: task count aggregation — given a `GROUP BY` result with some statuses missing, verify zero-fill and `total` computation.
  - References: TR.md — Section 2.4
  - Size: Small

- [ ] **5.4** Unit test: `is_ready_to_share` derivation — verify true only for `finalized` status, false for all others and for null agenda.
  - References: FRS Section 4.3
  - Size: Small

- [ ] **5.5** Unit test: UUID validation function — valid UUIDs, empty string, non-UUID strings, path-like strings.
  - References: FRS Sections 2.5, 4.5
  - Size: Small

---

## Phase 6: Integration Tests

- [ ] **6.1** Seed integration test database with: 3 clients, 3 users (one per role), `client_users` records scoping users to specific clients, task records with all statuses for one client, agenda records with all statuses for one client.
  - References: TR.md — Section 10.3
  - Size: Medium

- [ ] **6.2** Integration test: `GET /clients` — Admin sees all, Account Manager sees assigned only, Team Member sees assigned only, pagination works correctly, invalid pagination params return 400.
  - References: GS — "List Clients" scenarios
  - Size: Medium

- [ ] **6.3** Integration test: `GET /clients/{id}` — all three roles on assigned/unassigned/non-existent clients, invalid UUID in path.
  - References: GS — "Get Client Detail" scenarios
  - Size: Medium

- [ ] **6.4** Integration test: `PATCH /clients/{id}` — Admin and Account Manager on assigned clients, Team Member blocked, unassigned client blocked, all validation error cases, audit log created with correct `changed_fields`, `updated_at` advances.
  - References: GS — "Update Client Configuration" scenarios
  - Size: Large

- [ ] **6.5** Integration test: `GET /clients/{id}/status` — correct task counts by status, correct `is_ready_to_share` for each agenda status, null agenda and null task counts for new client, `next_call` is always null.
  - References: GS — "Get Client Status" scenarios
  - Size: Medium

- [ ] **6.6** Integration test: Verify audit log NOT written when PATCH fails (400, 403, 404).
  - References: GS — "Update Client Configuration" — Team Member scenario
  - Size: Small

---

## Phase 7: Documentation and Wrap-Up

- [ ] **7.1** Add the `/job-queue` entry to `.gitignore` in the repository root if it does not already exist.
  - Size: Small

- [ ] **7.2** Update `execution/job-queue/index.md` — set Feature 09 `Spec Status` to `complete`.
  - Size: Small

- [ ] **7.3** Confirm that any open technical questions from TR.md Section 11 have been resolved and document the decisions (inline in TR.md or in a decision log).
  - Size: Small
