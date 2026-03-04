# Task List — Feature 14: Agenda Endpoints

**Feature Name:** agenda-endpoints
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Output Directory:** `/execution/14-agenda-endpoints/`

---

## Prerequisites (Blocked By)

Before beginning any task in this list, confirm the following features are complete:

- Feature 04 (product-database-schema) — Agendas table, Agenda Versions table, agenda_short_id_seq, audit_log table, agenda_status enum
- Feature 07 (api-scaffolding) — App instance, route registration, token validation middleware, error handler, DB pool, source detection convention
- Feature 09 (client-management) — Client read queries, client access validation middleware, email_recipients field available
- Feature 13 (status-reconciliation) — Agenda creation is triggered at the end of the reconciliation cycle

---

## Phase A: Foundation

### A1. Verify Database Prerequisites
- [ ] Confirm `agendas` table exists with all columns specified in TR.md Section 3.1
- [ ] Confirm `agenda_versions` table exists with columns from TR.md Section 3.3
- [ ] Confirm `agenda_short_id_seq` PostgreSQL sequence exists (TR.md Section 3.2)
- [ ] Confirm `next_agenda_short_id()` SQL function exists and returns `AGD-####` format
- [ ] Confirm all four indexes exist (TR.md Section 3.4): `agendas_short_id_idx`, `agendas_client_status_idx`, `agendas_shared_url_token_idx` (partial unique), `agenda_versions_agenda_id_idx`
- [ ] Confirm `agenda_status` enum values are exactly: `draft`, `in_review`, `finalized`, `shared`
- [ ] Confirm `version_source` enum (`agent`, `ui`, `terminal`) already exists from Feature 11; do not recreate it
- **Complexity:** Small
- **References:** TR.md Section 3, FRS.md FR-SID-01 through FR-SID-04

### A2. Create Short ID Resolution Utility
- [ ] Implement `resolveAgendaId(idParam, db)` utility function (TR.md Section 4), mirroring `resolveTaskId` from Feature 11
- [ ] Pattern match against `AGD-\d+` (case-insensitive)
- [ ] If short ID: query `agendas` by `short_id` using `agendas_short_id_idx`; throw `AGENDA_NOT_FOUND` (404) if not found
- [ ] If not a short ID: validate UUID format; throw `INVALID_ID_FORMAT` (422) if invalid
- [ ] Return the resolved UUID
- [ ] Write unit tests covering: valid short ID, valid UUID, unknown short ID, invalid format
- **Complexity:** Small
- **References:** TR.md Section 4, FRS.md FR-CCR-01, GS.md Feature: Get Agenda Detail

### A3. Create Share Token Generation Utility
- [ ] Implement `generateShareToken()` using `crypto.randomBytes(32).toString('base64url')` (TR.md Section 5)
- [ ] Implement `generateShareTokens(agendaId, db)` with idempotency check: if tokens already set, return existing (TR.md Section 5)
- [ ] Write unit tests: token is 43 characters, URL-safe characters only, two consecutive calls on same agenda return same tokens
- **Complexity:** Small
- **References:** TR.md Section 5, FRS.md FR-SHR-02, FR-SHR-03

### A4. Create Agenda Data Access Layer
- [ ] Create `agendas.repository.ts` (or equivalent) with typed query functions:
  - `insertAgenda(data)` — single insert returning created row
  - `findAgendaByShortId(shortId)` — lookup via short ID index
  - `findAgendaById(uuid)` — lookup by primary key
  - `findAgendasByClient(clientId, filters, pagination)` — list with filter/pagination (summary fields only, no content/versions)
  - `updateAgenda(id, fields)` — partial update, sets `updated_at`
  - `insertAgendaVersion(agendaId, data)` — append version record
  - `getLatestVersionNumber(agendaId)` — returns highest version number for an agenda
  - `findAgendaWithVersions(id)` — agenda + all versions ordered by version ASC
  - `findAgendaBySharedToken(token)` — lookup via `agendas_shared_url_token_idx` (used by public endpoint)
- [ ] All queries use parameterized inputs
- **Complexity:** Medium
- **References:** TR.md Sections 3.1, 3.3, FRS.md all sections

### A5. Confirm Audit Log Utility
- [ ] Verify `writeAuditEntry(action, entityType, entityId, userId, metadata, source)` already exists from Feature 09 or Feature 11
- [ ] If it does not exist, create it using the audit_log table from Feature 04
- [ ] Confirm non-blocking behavior (audit write failure should not roll back the primary operation)
- **Complexity:** Small
- **References:** TR.md Section 8, FRS.md FR-CRT-06, FR-EDT-05, FR-FIN-05, FR-SHR-06, FR-EML-06, FR-EXP-05

### A6. Define Adapter Interface Stubs
- [ ] Define `EmailAdapterService` interface (TR.md Section 9.1)
- [ ] Define `GoogleDocsAdapterService` interface (TR.md Section 9.2)
- [ ] Create `EmailAdapterStub` that throws `NotImplementedError` (to be replaced by Feature 16)
- [ ] Create `GoogleDocsAdapterStub` that throws `NotImplementedError` (to be replaced by Feature 15)
- [ ] Wire both stubs into the DI system established in Feature 07
- [ ] Add injection override point for tests
- **Complexity:** Small
- **References:** TR.md Section 9, TR.md Section 15.2

### A7. Configure APP_BASE_URL Environment Variable
- [ ] Add `APP_BASE_URL` to the app's environment variable schema (e.g., Zod env schema if Feature 07 established one)
- [ ] Implement `buildShareUrls(tokens)` helper (TR.md Section 11)
- [ ] Confirm it reads from `process.env.APP_BASE_URL` and throws a startup error if not set
- **Complexity:** Small
- **References:** TR.md Section 11, FRS.md FR-SHR-05

---

## Phase B: Core CRUD Endpoints

### B1. Implement POST /clients/{client_id}/agendas
- [ ] Register route following the pattern from Feature 07
- [ ] Apply client access middleware (validates `client_id` against user's accessible clients)
- [ ] Validate request body (TR.md Section 2.1): `content` required, `cycle_start` required, `cycle_end` required and >= `cycle_start`
- [ ] Call `next_agenda_short_id()` to obtain the next short ID
- [ ] Insert agenda row with `status = 'draft'` and provided fields
- [ ] Insert Agenda Version row with `version = 1`, `source` from the `source` field (or `detectSource(request)` if absent), `edited_by` = authenticated user/service
- [ ] Write `agenda.created` audit entry (TR.md Section 8)
- [ ] Return 201 with created agenda object (TR.md Section 2.1 response shape)
- **Complexity:** Medium
- **References:** FRS.md FR-CRT-01 through FR-CRT-09, GS.md Feature: Create Draft Agenda, TR.md Section 2.1

### B2. Implement GET /clients/{client_id}/agendas
- [ ] Register route
- [ ] Apply client access middleware
- [ ] Parse and validate query parameters: `status` (enum check), `page` (positive integer), `per_page` (1–100, cap at 100)
- [ ] Build query with applicable filters; sort by `created_at DESC`
- [ ] Return paginated response with `data` array (summary shape — no `content`, no `versions`) and `pagination` object (TR.md Section 2.2)
- **Complexity:** Small
- **References:** FRS.md FR-LST-01 through FR-LST-04, GS.md Feature: List Agendas, TR.md Section 2.2

### B3. Implement GET /agendas/{id}
- [ ] Register route (no `client_id` in path)
- [ ] Resolve `{id}` via the short ID resolution utility (Task A2)
- [ ] Fetch agenda + all versions via `findAgendaWithVersions`
- [ ] Cross-check agenda's `client_id` against user's accessible clients; return `FORBIDDEN` (403) if not accessible
- [ ] Return full agenda detail response including `versions` array ordered by version ASC (TR.md Section 2.3)
- [ ] Ensure `shared_url_token` and `internal_url_token` are included in the response for authenticated users
- **Complexity:** Small
- **References:** FRS.md FR-DET-01 through FR-DET-06, GS.md Feature: Get Agenda Detail, TR.md Section 2.3

### B4. Implement PATCH /agendas/{id}
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify agenda `client_id` is accessible to the caller (any role permitted)
- [ ] Validate agenda status is `draft` or `in_review`; return `AGENDA_NOT_EDITABLE` (422) otherwise
- [ ] Validate and strip request body: only allow `content`, `cycle_start`, `cycle_end`; silently ignore all other fields
- [ ] Validate date formats (`YYYY-MM-DD`) and logical consistency (`cycle_end >= cycle_start`) if dates provided
- [ ] If status is `draft`, promote to `in_review` (TR.md Section 6 / FRS.md FR-EDT-03)
- [ ] Update agenda record, set `updated_at`
- [ ] Compute next version number via `getLatestVersionNumber` + 1
- [ ] Insert Agenda Version row with new content (or existing content if only dates changed), `edited_by`, and detected source
- [ ] Write `agenda.edited` audit entry with `version`, `previous_status` (if status changed), `source` in metadata
- [ ] Return updated full agenda detail (including updated `versions` array)
- **Complexity:** Medium
- **References:** FRS.md FR-EDT-01 through FR-EDT-07, GS.md Feature: Edit Agenda, TR.md Section 2.4

---

## Phase C: Lifecycle Transition Endpoints

### C1. Implement Finalization Service
- [ ] Implement `finalizeAgenda(agendaId, userId, force, db)` service function (TR.md Section 6)
- [ ] Fetch agenda with versions
- [ ] Check `status` is not `finalized` or `shared`; throw `AGENDA_ALREADY_FINALIZED` (422) if so
- [ ] Check whether any version has `source != 'agent'`; if none and `force = false`, throw `AGENDA_NOT_FINALIZABLE` (422) with `requires_force: true`
- [ ] Transition `status → finalized`, set `finalized_by`, `finalized_at`, `updated_at`
- [ ] Write `agenda.finalized` audit entry with `forced` in metadata
- [ ] Write unit tests for all branches: in_review with human edits, draft with agent-only, force=true, already finalized
- **Complexity:** Medium
- **References:** FRS.md FR-FIN-01 through FR-FIN-07, GS.md Feature: Finalize Agenda, TR.md Section 6

### C2. Implement POST /agendas/{id}/finalize
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify agenda `client_id` is accessible to the caller
- [ ] Enforce role check: `account_manager` or `admin`; return `FORBIDDEN` (403) otherwise
- [ ] Parse optional `force` boolean from request body (default false)
- [ ] Call `finalizeAgenda(...)` service function (C1)
- [ ] Return updated full agenda detail
- **Complexity:** Small
- **References:** FRS.md FR-FIN-01 through FR-FIN-07, GS.md Feature: Finalize Agenda, TR.md Section 2.5

### C3. Implement Share Service
- [ ] Implement `shareAgenda(agendaId, userId, db)` service function
- [ ] Verify `status` is `finalized` or `shared`; throw `AGENDA_NOT_SHAREABLE` (422) with `current_status` if not
- [ ] Call `generateShareTokens(agendaId, db)` — handles idempotency (TR.md Section 5)
- [ ] If status was `finalized` (first share call), transition `status → shared`, set `shared_at`, write `agenda.shared` audit entry
- [ ] If status was already `shared` (repeat call), skip status update and audit write
- [ ] Return `{ agenda, share_urls }` (TR.md Section 2.6 response shape)
- [ ] Write unit tests: first share transitions status, second share returns existing tokens unchanged
- **Complexity:** Medium
- **References:** FRS.md FR-SHR-01 through FR-SHR-07, GS.md Feature: Generate Share URLs, TR.md Sections 2.6, 5

### C4. Implement POST /agendas/{id}/share
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify agenda `client_id` is accessible
- [ ] Enforce role check: `account_manager` or `admin`
- [ ] Call `shareAgenda(...)` service function (C3)
- [ ] Build `share_urls` using `buildShareUrls(tokens)` (Task A7)
- [ ] Return response with `agenda` and `share_urls`
- **Complexity:** Small
- **References:** FRS.md FR-SHR-01 through FR-SHR-07, GS.md Feature: Generate Share URLs, TR.md Section 2.6

---

## Phase D: Distribution Endpoints

### D1. Implement Email Recipient Resolution
- [ ] Implement `resolveEmailRecipients(requestRecipients, clientId, db)` service function
- [ ] If `requestRecipients` is provided and non-empty → validate each email format; return valid list or throw `VALIDATION_ERROR`
- [ ] Else → fetch client `email_recipients` JSONB from the Clients table (via Feature 09 queries)
- [ ] If client `email_recipients` is null or empty → throw `NO_EMAIL_RECIPIENTS` (422)
- [ ] Write unit tests for all three branches
- **Complexity:** Small
- **References:** FRS.md FR-EML-02, FR-EML-03, GS.md Feature: Email Agenda

### D2. Implement POST /agendas/{id}/email
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify agenda `client_id` is accessible
- [ ] Enforce role check: `account_manager` or `admin`
- [ ] Verify agenda status is `finalized` or `shared`; return `AGENDA_NOT_EMAILABLE` (422) otherwise
- [ ] Call `resolveEmailRecipients(...)` (D1) to get final recipient list
- [ ] Call `emailAdapterService.sendAgenda(...)` via the adapter interface (A6); pass agenda content, `client_name`, recipients
- [ ] On success: write `agenda.emailed` audit entry with recipients and `sent_at`
- [ ] On adapter error: do NOT change agenda status; return `EMAIL_FAILED` (502) with upstream detail
- [ ] Return `{ agenda, email: { sent_to, sent_at } }`
- **Complexity:** Medium
- **References:** FRS.md FR-EML-01 through FR-EML-08, GS.md Feature: Email Agenda, TR.md Sections 2.7, 9.1

### D3. Implement POST /agendas/{id}/export
- [ ] Register route
- [ ] Resolve `{id}` using short ID resolution utility
- [ ] Verify agenda `client_id` is accessible
- [ ] Enforce role check: `account_manager` or `admin`
- [ ] Verify agenda status is `finalized` or `shared`; return `AGENDA_NOT_EXPORTABLE` (422) otherwise
- [ ] Call `googleDocsAdapterService.exportAgenda(...)` via the adapter interface (A6); pass agenda content, `client_name`, existing `google_doc_id` if set
- [ ] On success: update agenda with returned `google_doc_id`, set `updated_at`; write `agenda.exported` audit entry
- [ ] On adapter error: do NOT change `google_doc_id`; return `EXPORT_FAILED` (502) with upstream detail
- [ ] Return `{ agenda, export: { google_doc_id, exported_at } }`
- **Complexity:** Medium
- **References:** FRS.md FR-EXP-01 through FR-EXP-07, GS.md Feature: Export Agenda to Google Docs, TR.md Sections 2.8, 9.2

---

## Phase E: Public Endpoint

### E1. Register Public Route (No Auth Middleware)
- [ ] Register `GET /shared/:token` on the public router (not the authenticated router) — confirm with Feature 07 pattern for public vs. authenticated route registration
- [ ] Ensure the JWT validation middleware is NOT applied to this route
- [ ] Confirm that providing a valid Bearer token on this route does not cause a 401 (auth is simply ignored)
- **Complexity:** Small
- **References:** TR.md Section 10, FRS.md FR-PUB-01

### E2. Implement GET /shared/{token}
- [ ] Look up agenda by `shared_url_token` using `findAgendaBySharedToken(token)` (index scan, no full table scan)
- [ ] If not found: return `SHARED_LINK_NOT_FOUND` (404); do not distinguish "never existed" from "wrong token"
- [ ] Fetch `client_name` from the Clients table for the agenda's `client_id`
- [ ] Construct the public response shape (TR.md Section 2.9): only `short_id`, `client_name`, `content`, `cycle_start`, `cycle_end`, `shared_at`
- [ ] Verify the response contains NONE of: `id`, `client_id`, `shared_url_token`, `internal_url_token`, `finalized_by`, `google_doc_id`, `versions`
- [ ] No audit log entry is written for public reads (read-only, no state change)
- **Complexity:** Small
- **References:** FRS.md FR-PUB-01 through FR-PUB-06, GS.md Feature: Public Shared Agenda Access, TR.md Sections 2.9, 10

---

## Phase F: Testing

### F1. Unit Tests — Short ID Utility
- [ ] Covers: first ID is `AGD-0001`, sequential across clients, IDs > 9999 produce `AGD-10000`+, resolution of valid short ID, UUID passthrough, unknown short ID → AGENDA_NOT_FOUND, invalid format → INVALID_ID_FORMAT
- **Complexity:** Small
- **References:** GS.md Feature: Short ID Generation, TR.md Section 4

### F2. Unit Tests — Share Token Generation
- [ ] Token is 43 URL-safe base64 characters
- [ ] Two calls for the same agenda with tokens already set return identical tokens
- [ ] First call for an agenda without tokens generates two distinct tokens
- **Complexity:** Small
- **References:** TR.md Section 5, GS.md Feature: Generate Share URLs

### F3. Unit Tests — Finalization Service
- [ ] in_review agenda with human edit → finalized, forced: false
- [ ] draft agenda with only agent version, force=false → AGENDA_NOT_FINALIZABLE with requires_force: true
- [ ] draft agenda with only agent version, force=true → finalized, forced: true in audit
- [ ] Already finalized → AGENDA_ALREADY_FINALIZED
- [ ] Shared agenda → AGENDA_ALREADY_FINALIZED
- **Complexity:** Small
- **References:** GS.md Feature: Finalize Agenda, TR.md Section 6

### F4. Unit Tests — Email Recipient Resolution
- [ ] Override recipients provided and valid → returns override list
- [ ] Override with invalid email → VALIDATION_ERROR
- [ ] No override, client has recipients → returns client list
- [ ] No override, client has no recipients → NO_EMAIL_RECIPIENTS
- **Complexity:** Small
- **References:** FRS.md FR-EML-02, FR-EML-03, GS.md Feature: Email Agenda

### F5. Integration Tests — Create Draft Agenda
- [ ] Happy path: returns 201, short ID assigned, status draft, version 1 created with source agent, audit entry written
- [ ] Missing `content` → 422 VALIDATION_ERROR
- [ ] Missing `cycle_start` → 422 VALIDATION_ERROR
- [ ] `cycle_end` before `cycle_start` → 422 VALIDATION_ERROR with field reference
- [ ] Inaccessible client → 404 CLIENT_NOT_FOUND
- [ ] Supplied `short_id` in body is silently ignored
- **Complexity:** Medium
- **References:** GS.md Feature: Create Draft Agenda

### F6. Integration Tests — List Agendas
- [ ] No filter returns all agendas, ordered by created_at DESC, no content/versions fields in response
- [ ] Status filter returns correct subset
- [ ] Pagination: correct page, total, total_pages
- [ ] per_page > 100 capped at 100
- **Complexity:** Small
- **References:** GS.md Feature: List Agendas

### F7. Integration Tests — Get Agenda Detail
- [ ] Fetch by short ID returns full detail with versions ordered ASC
- [ ] Fetch by UUID returns identical result
- [ ] Unknown short ID → 404 AGENDA_NOT_FOUND
- [ ] Agenda from inaccessible client → 403 FORBIDDEN
- [ ] Shared agenda response includes shared_url_token for authenticated user
- **Complexity:** Small
- **References:** GS.md Feature: Get Agenda Detail

### F8. Integration Tests — Edit Agenda
- [ ] PATCH on draft agenda promotes status to in_review, creates version 2, audit entry written
- [ ] PATCH on in_review agenda stays in_review, creates new version
- [ ] PATCH cycle dates only → version record created
- [ ] PATCH on finalized agenda → 422 AGENDA_NOT_EDITABLE
- [ ] PATCH on shared agenda → 422 AGENDA_NOT_EDITABLE
- [ ] team_member can PATCH in_review agenda
- [ ] Non-editable fields (status, short_id, finalized_by) are silently ignored
- [ ] Invalid date format → 422 VALIDATION_ERROR
- [ ] cycle_end before cycle_start → 422 VALIDATION_ERROR
- **Complexity:** Medium
- **References:** GS.md Feature: Edit Agenda

### F9. Integration Tests — Finalize Agenda
- [ ] account_manager finalizes in_review agenda with human edit → 200, status finalized, finalized_by set, audit forced: false
- [ ] admin finalizes → 200
- [ ] Draft with agent-only version, no force → 422 AGENDA_NOT_FINALIZABLE, requires_force: true in details
- [ ] Draft with agent-only version, force: true → 200, finalized, audit forced: true
- [ ] Already finalized → 422 AGENDA_ALREADY_FINALIZED
- [ ] Shared agenda → 422 AGENDA_ALREADY_FINALIZED
- [ ] team_member → 403 FORBIDDEN
- **Complexity:** Medium
- **References:** GS.md Feature: Finalize Agenda

### F10. Integration Tests — Share Agenda
- [ ] Finalized agenda: returns 200 with share_urls, status becomes shared, shared_at set, audit entry written
- [ ] Second call on already-shared agenda: returns 200 with same tokens, no new audit entry
- [ ] draft agenda → 422 AGENDA_NOT_SHAREABLE with current_status
- [ ] in_review agenda → 422 AGENDA_NOT_SHAREABLE
- [ ] team_member → 403 FORBIDDEN
- [ ] share_urls.client_url contains APP_BASE_URL + /shared/ + token
- **Complexity:** Medium
- **References:** GS.md Feature: Generate Share URLs

### F11. Integration Tests — Email Agenda
- [ ] Finalized agenda, no body → email adapter called with client recipients, 200, audit entry written
- [ ] Finalized agenda, recipients override → email adapter called with override
- [ ] draft agenda → 422 AGENDA_NOT_EMAILABLE
- [ ] in_review agenda → 422 AGENDA_NOT_EMAILABLE
- [ ] No recipients anywhere → 422 NO_EMAIL_RECIPIENTS
- [ ] Invalid email in recipients → 422 VALIDATION_ERROR
- [ ] Email adapter throws → 502 EMAIL_FAILED, agenda status unchanged
- [ ] team_member → 403 FORBIDDEN
- **Complexity:** Large (requires mock email adapter)
- **References:** GS.md Feature: Email Agenda

### F12. Integration Tests — Export Agenda
- [ ] Finalized agenda → adapter called, google_doc_id stored, 200, audit entry
- [ ] Re-export updates google_doc_id
- [ ] draft agenda → 422 AGENDA_NOT_EXPORTABLE
- [ ] Google Docs adapter throws → 502 EXPORT_FAILED, google_doc_id unchanged
- [ ] team_member → 403 FORBIDDEN
- **Complexity:** Medium (requires mock Google Docs adapter)
- **References:** GS.md Feature: Export Agenda to Google Docs

### F13. Integration Tests — Public Shared Endpoint
- [ ] Valid token, no auth header → 200, public response shape, no internal fields
- [ ] Valid token, with auth header → 200, same response (auth ignored not rejected)
- [ ] Unknown token → 404 SHARED_LINK_NOT_FOUND
- [ ] Response does not include id, client_id, shared_url_token, internal_url_token, finalized_by, google_doc_id, versions
- [ ] Response includes client_name (from Clients table)
- **Complexity:** Small
- **References:** GS.md Feature: Public Shared Agenda Access

---

## Phase G: Documentation and Handoff

### G1. Update Memory Bank
- [ ] Document agenda-endpoints patterns in `memory-bank/systemPatterns.md`:
  - `AGD-####` short ID resolution pattern (mirrors TSK-#### from Feature 11)
  - Lifecycle enforcement pattern (status precondition checks)
  - Force-confirmation pattern for finalization
  - Share token generation and idempotency pattern
  - Public route bypass pattern (no auth middleware)
  - Adapter stub pattern for Features 15 and 16
- [ ] Note `EmailAdapterService` and `GoogleDocsAdapterService` interface contracts for Feature 15 and 16 implementors
- **Complexity:** Small

### G2. Notify Downstream Feature Owners
- [ ] Communicate to Feature 15 team: `GoogleDocsAdapterService` stub interface (TR.md Section 9.2) is in place; they need to replace the stub with the real implementation
- [ ] Communicate to Feature 16 team: `EmailAdapterService` stub interface (TR.md Section 9.1) is in place; they need to replace the stub
- [ ] Communicate to Feature 20 team: `POST /clients/{id}/agendas` request schema (TR.md Section 2.1) is final; the Mastra agent output must conform
- [ ] Communicate to Feature 28 team: all endpoint contracts (TR.md Section 2) are available for the UI Agenda Editor
- [ ] Communicate to Feature 29 team: `GET /shared/{token}` response shape (TR.md Section 2.9) is final for the public client-facing view
- **Complexity:** Small

---

## Routing Registration Note

When registering routes, ensure the public route is on the public router (no JWT middleware), and all other agenda routes are on the authenticated router. There are no path-segment conflicts in the agenda routing, but confirm with Feature 07's router structure:

```
Authenticated:
  GET  /clients/:client_id/agendas
  POST /clients/:client_id/agendas
  GET  /agendas/:id
  PATCH /agendas/:id
  POST /agendas/:id/finalize
  POST /agendas/:id/share
  POST /agendas/:id/email
  POST /agendas/:id/export

Public (no JWT middleware):
  GET  /shared/:token
```

The literal-path action segments (`/finalize`, `/share`, `/email`, `/export`) on `/agendas/:id/` must be registered before the parameterized `:id` segment is reached by the router — confirm this is handled by the framework's registration order.

---

## Summary Checklist

- [ ] A1 — Database prerequisites verified
- [ ] A2 — Short ID resolution utility
- [ ] A3 — Share token generation utility
- [ ] A4 — Agenda data access layer
- [ ] A5 — Audit log utility confirmed/created
- [ ] A6 — Adapter interface stubs (Email, Google Docs)
- [ ] A7 — APP_BASE_URL env variable and share URL builder
- [ ] B1 — POST /clients/{id}/agendas
- [ ] B2 — GET /clients/{id}/agendas
- [ ] B3 — GET /agendas/{id}
- [ ] B4 — PATCH /agendas/{id}
- [ ] C1 — Finalization service
- [ ] C2 — POST /agendas/{id}/finalize
- [ ] C3 — Share service
- [ ] C4 — POST /agendas/{id}/share
- [ ] D1 — Email recipient resolution
- [ ] D2 — POST /agendas/{id}/email
- [ ] D3 — POST /agendas/{id}/export
- [ ] E1 — Public route registration (no auth middleware)
- [ ] E2 — GET /shared/{token}
- [ ] F1–F13 — All test suites passing
- [ ] G1 — Memory bank updated
- [ ] G2 — Downstream teams notified
