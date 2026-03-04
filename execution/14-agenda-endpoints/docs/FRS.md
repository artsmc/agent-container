# FRS — Functional Requirement Specification
## Feature 14: Agenda Endpoints

**Feature Name:** agenda-endpoints
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Short ID Generation

### FR-SID-01: Format
Short IDs must follow the format `AGD-####` where `####` is a zero-padded decimal integer (minimum 4 digits; grows naturally beyond 4 digits as volume increases, e.g., `AGD-10000`).

### FR-SID-02: Uniqueness
Short IDs are globally unique across all agendas and all clients. There is no per-client sequence. The sequence is a database-level PostgreSQL `SEQUENCE` to guarantee atomicity under concurrent creation.

### FR-SID-03: Immutability
Once assigned, a short ID is never changed, reassigned, or reused — regardless of the agenda's lifecycle outcome.

### FR-SID-04: Auto-Assignment
Short IDs are assigned by the API at agenda creation time. Consumers (including Mastra) do not supply short IDs; any attempt to do so is silently ignored.

---

## 2. Agenda Creation — `POST /clients/{client_id}/agendas`

### FR-CRT-01: Request Body
The endpoint accepts a single agenda object:
```json
{
  "content": { "type": "doc", "content": [...] },
  "cycle_start": "YYYY-MM-DD (required)",
  "cycle_end": "YYYY-MM-DD (required)",
  "source": "agent | ui | terminal (optional, default: agent)"
}
```

**Content format:** The `content` field is a ProseMirror JSON document object (JSONB), not a markdown string. The API validates the root structure (`type: "doc"` with a `content` array) but does not deeply validate individual node types — that is the responsibility of the editor (Feature 28) and the Mastra agent (Feature 20).

### FR-CRT-02: Required Fields
- `content` — required. A ProseMirror JSON document object. The full agenda/Running Notes content stored as structured ProseMirror JSON (not markdown). The API validates that the value is a valid JSON object with a `type: "doc"` root node and a `content` array of ProseMirror nodes.
- `cycle_start` — ISO 8601 date string (`YYYY-MM-DD`). The start of the task cycle this agenda covers.
- `cycle_end` — ISO 8601 date string (`YYYY-MM-DD`). Must be on or after `cycle_start`.

### FR-CRT-03: Default Values
- `status` is always set to `draft` on creation; the caller cannot override this.
- `source` defaults to `agent` if not provided.

### FR-CRT-04: Short ID Assignment
The API atomically increments the global `agenda_short_id_seq` sequence and assigns the resulting `AGD-####` value.

### FR-CRT-05: Initial Version Record
The API writes an Agenda Version row with `version = 1`, capturing the initial content. `edited_by` is set to the authenticated user or service account. `source` is derived from the request `source` field.

### FR-CRT-06: Audit Log
A `agenda.created` audit entry is written, including `short_id`, `client_id`, `cycle_start`, `cycle_end`, and `source` in `metadata`.

### FR-CRT-07: Authorization
Any authenticated user (including the Mastra service account) may create draft agendas for clients they have access to.

### FR-CRT-08: Response
Returns the created agenda object including `id`, `short_id`, `status`, `content`, `cycle_start`, `cycle_end`, and `created_at`. HTTP 201.

### FR-CRT-09: Client Scoping
The `client_id` in the URL is validated against the authenticated user's accessible clients. If the client is not accessible or does not exist: `CLIENT_NOT_FOUND` (404).

---

## 3. Agenda Listing — `GET /clients/{client_id}/agendas`

### FR-LST-01: Filters
| Query Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by agenda status (`draft`, `in_review`, `finalized`, `shared`) |
| `page` | integer | Page number (1-based, default: 1) |
| `per_page` | integer | Items per page (default: 20, max: 100) |

### FR-LST-02: Default Sort
Results sorted by `created_at` descending (newest first).

### FR-LST-03: Response Shape
```json
{
  "data": [ /* array of agenda summary objects */ ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 12,
    "total_pages": 1
  }
}
```
Agenda summary objects include: `id`, `short_id`, `status`, `cycle_start`, `cycle_end`, `finalized_at`, `shared_at`, `google_doc_id`, `created_at`, `updated_at`. The `content` field and `versions` array are NOT included in the list response.

### FR-LST-04: Authorization
Results are scoped to the authenticated user's accessible clients. Client-level access is enforced by the same middleware used across all client-scoped routes.

---

## 4. Agenda Detail — `GET /agendas/{id}`

### FR-DET-01: ID Resolution
The `{id}` path parameter accepts either:
- A UUID (e.g., `3f2a1b4c-...`)
- A short ID (e.g., `AGD-0015`)

The API resolves short IDs via the unique index on `agendas.short_id`. The resolution is transparent.

### FR-DET-02: Response Shape
```json
{
  "id": "uuid",
  "short_id": "AGD-0015",
  "client_id": "uuid",
  "status": "in_review",
  "content": "string",
  "cycle_start": "2026-02-01",
  "cycle_end": "2026-02-28",
  "shared_url_token": null,
  "internal_url_token": null,
  "google_doc_id": null,
  "finalized_by": null,
  "finalized_at": null,
  "shared_at": null,
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "versions": [
    {
      "id": "uuid",
      "version": 1,
      "content": "string",
      "edited_by": "uuid",
      "source": "agent",
      "created_at": "ISO8601"
    }
  ]
}
```

### FR-DET-03: Version History
The `versions` array is always included in the detail response, ordered by `version` ascending. The UI uses this to display the full edit history and allow reversion.

### FR-DET-04: Token Visibility
`shared_url_token` and `internal_url_token` are returned in full for authenticated users with access to the agenda's client. These are never returned by the public `/shared/{token}` endpoint.

### FR-DET-05: Authorization
The agenda's `client_id` is cross-referenced against the authenticated user's accessible clients. If the user cannot access that client: `FORBIDDEN` (403).

### FR-DET-06: Not Found
If no agenda matches the UUID or short ID: `AGENDA_NOT_FOUND` (404).

---

## 5. Agenda Edit — `PATCH /agendas/{id}`

### FR-EDT-01: Editable Fields
Only these fields may be included in a PATCH request:
| Field | Type | Validation |
|---|---|---|
| `content` | ProseMirror JSON object | Must be a valid ProseMirror document (`type: "doc"`) |
| `cycle_start` | string | ISO 8601 date format (`YYYY-MM-DD`) |
| `cycle_end` | string | ISO 8601 date format, must be >= `cycle_start` |

Non-editable fields (`status`, `short_id`, `client_id`, `shared_url_token`, `internal_url_token`, `google_doc_id`, `finalized_by`, `finalized_at`, `shared_at`) are silently ignored.

### FR-EDT-02: Status Restriction
PATCH is only allowed when `status` is `draft` or `in_review`. Any other status (`finalized`, `shared`) returns `AGENDA_NOT_EDITABLE` (422).

### FR-EDT-03: Status Promotion on Edit
When an agenda with `status = draft` is successfully edited, the status is automatically promoted to `in_review`. This signals that a human has engaged with the content.

### FR-EDT-04: Version Record Creation
Every successful PATCH creates a new Agenda Version row. The version number increments from the highest existing version for that agenda. `edited_by` is set to the authenticated user. `source` is derived from the caller's token type.

### FR-EDT-05: Audit Log
A `agenda.edited` audit entry is written, capturing `version`, `previous_status` (if status changed), and `source` in `metadata`. Full content diffs are not stored in the audit log (the version records themselves provide content history).

### FR-EDT-06: Response
Returns the full updated agenda object (same shape as GET detail, including updated `versions` array). HTTP 200.

### FR-EDT-07: Authorization
Any authenticated user with access to the agenda's client may edit the agenda. This includes `team_member` role, enabling collaborative editing.

---

## 6. Agenda Finalize — `POST /agendas/{id}/finalize`

### FR-FIN-01: Status Precondition
Only agendas with `status = draft` or `status = in_review` may be finalized. Attempting to finalize an already `finalized` or `shared` agenda returns `AGENDA_ALREADY_FINALIZED` (422).

### FR-FIN-02: Human Review Requirement
The API checks whether the agenda has been edited by a human:
- If the only version record has `source = 'agent'` (version 1 only, no human edits), the agenda is considered unreviewed.
- An unreviewed agenda may only be finalized if the request body includes `{ "force": true }`.
- Without `force: true`, the endpoint returns `AGENDA_NOT_FINALIZABLE` (422) with `requires_force: true` in the error details.

### FR-FIN-03: Force Confirmation
The `force: true` flag explicitly acknowledges that the account manager accepts the agent-generated content as-is. This is logged in the audit entry.

### FR-FIN-04: State Transition
On success:
- `status` → `finalized`
- `finalized_by` → authenticated user's `id`
- `finalized_at` → current UTC timestamp
- `updated_at` → current UTC timestamp

### FR-FIN-05: Audit Log
A `agenda.finalized` audit entry is written, including `finalized_by`, `finalized_at`, and `forced` (boolean, from the force flag) in `metadata`.

### FR-FIN-06: Role Requirement
Only users with `role = account_manager` or `role = admin` may finalize an agenda. Any other role returns `FORBIDDEN` (403).

### FR-FIN-07: Response
Returns the updated agenda object with `status: "finalized"`. HTTP 200.

---

## 7. Agenda Share — `POST /agendas/{id}/share`

### FR-SHR-01: Status Precondition
Only `finalized` or `shared` agendas may have URLs generated. Any other status returns `AGENDA_NOT_SHAREABLE` (422) with `current_status` in details.

### FR-SHR-02: Token Generation
Two tokens are generated (if not already present):
- `shared_url_token` — a cryptographically random opaque token, 32+ bytes of entropy, URL-safe base64 encoded. Used for the public client-facing read-only link.
- `internal_url_token` — same generation approach. Used for the internal edit link.

### FR-SHR-03: Idempotency
If `shared_url_token` and `internal_url_token` are already set, the endpoint returns the existing tokens without regenerating them. No new version or audit entry is created in this case.

### FR-SHR-04: Status Transition
If the agenda was `finalized`, the status transitions to `shared` and `shared_at` is set to the current UTC timestamp. If the agenda was already `shared`, no status change occurs.

### FR-SHR-05: Response
Returns the updated agenda object plus a `share_urls` object:
```json
{
  "agenda": { /* full agenda detail */ },
  "share_urls": {
    "client_url": "https://app.example.com/shared/{shared_url_token}",
    "internal_url": "https://app.example.com/agendas/edit/{internal_url_token}"
  }
}
```
The base URL is configured via environment variable; the endpoint constructs the full URL.

### FR-SHR-06: Audit Log
A `agenda.shared` audit entry is written (only on first share, not on repeated calls that return existing tokens). Includes `shared_at` in `metadata`.

### FR-SHR-07: Role Requirement
Only users with `role = account_manager` or `role = admin` may generate share URLs. Any other role returns `FORBIDDEN` (403).

---

## 8. Agenda Email — `POST /agendas/{id}/email`

### FR-EML-01: Status Precondition
Only `finalized` or `shared` agendas may be emailed. Any other status returns `AGENDA_NOT_EMAILABLE` (422).

### FR-EML-02: Recipient Resolution
Recipients are resolved in order:
1. If the request body includes `recipients` (array of email strings) → use those.
2. Else use the client's `email_recipients` JSONB field.
3. If neither is set → return `NO_EMAIL_RECIPIENTS` (422).

### FR-EML-03: Recipient Validation
Each recipient email address is validated for format (`RFC 5322` basic format check). Invalid addresses return `VALIDATION_ERROR` (422) with the invalid addresses listed in details.

### FR-EML-04: Email Adapter Invocation
The API calls Feature 16's `EmailAdapter` service interface, passing the agenda content, resolved recipients, and client context. This is an internal service call — the API does not directly call an email provider.

### FR-EML-05: Error Handling
If the email adapter returns an error, the agenda's status is not changed. The endpoint returns `EMAIL_FAILED` (502) with the upstream error detail in `details`.

### FR-EML-06: Audit Log
A `agenda.emailed` audit entry is written on successful email dispatch, including `recipients` (array of addresses), `sent_at` (UTC timestamp), and `source` in `metadata`.

### FR-EML-07: Response
Returns the agenda object (unchanged) and a confirmation object:
```json
{
  "agenda": { /* full agenda detail */ },
  "email": {
    "sent_to": ["email@example.com"],
    "sent_at": "ISO8601"
  }
}
```
HTTP 200.

### FR-EML-08: Role Requirement
Only users with `role = account_manager` or `role = admin` may send emails. Any other role returns `FORBIDDEN` (403).

---

## 9. Agenda Export — `POST /agendas/{id}/export`

### FR-EXP-01: Status Precondition
Only `finalized` or `shared` agendas may be exported. Any other status returns `AGENDA_NOT_EXPORTABLE` (422).

### FR-EXP-02: Google Docs Adapter Invocation
The API calls Feature 15's `GoogleDocsAdapter` service interface, passing the agenda content and client context. The adapter creates or updates a Google Doc and returns a `google_doc_id`.

### FR-EXP-03: google_doc_id Storage
On success, the returned `google_doc_id` is stored on the agenda record. Subsequent export calls update this field (the adapter may update the same doc or create a new one — that decision belongs to Feature 15).

### FR-EXP-04: Error Handling
If the adapter returns an error, the agenda's `google_doc_id` is not changed. The endpoint returns `EXPORT_FAILED` (502) with the upstream error detail.

### FR-EXP-05: Audit Log
A `agenda.exported` audit entry is written on success, including `google_doc_id` and `exported_at` in `metadata`.

### FR-EXP-06: Response
Returns the updated agenda object (with `google_doc_id` populated) and a confirmation:
```json
{
  "agenda": { /* full agenda detail, including google_doc_id */ },
  "export": {
    "google_doc_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "exported_at": "ISO8601"
  }
}
```
HTTP 200.

### FR-EXP-07: Role Requirement
Only users with `role = account_manager` or `role = admin` may export agendas. Any other role returns `FORBIDDEN` (403).

---

## 10. Public Shared Agenda — `GET /shared/{token}`

### FR-PUB-01: No Authentication Required
This endpoint must not require a Bearer token. It is publicly accessible. The Feature 07 auth middleware must be bypassed for this route.

### FR-PUB-02: Token Lookup
The `{token}` path parameter is matched against the `shared_url_token` column in the Agendas table using the `agendas(shared_url_token)` index.

### FR-PUB-03: Not Found Behavior
If no agenda matches the token: return `SHARED_LINK_NOT_FOUND` (404). Do not indicate whether the token ever existed or what it would have resolved to.

### FR-PUB-04: Response Shape
Returns a minimal public view of the agenda — no internal fields, no user IDs, no version history:
```json
{
  "short_id": "AGD-0015",
  "client_name": "Total Life",
  "content": "string",
  "cycle_start": "2026-02-01",
  "cycle_end": "2026-02-28",
  "shared_at": "ISO8601"
}
```
The `client_name` is fetched from the Clients table for display purposes only.

### FR-PUB-05: No Internal Fields
The public response must never include: `id` (UUID), `client_id`, `shared_url_token`, `internal_url_token`, `finalized_by`, `google_doc_id`, version records, or audit data.

### FR-PUB-06: Security Note
Token enumeration must be infeasible. The token must have sufficient entropy (32+ bytes) that brute-force or sequential guessing is not viable.

---

## 11. Cross-Cutting Functional Requirements

### FR-CCR-01: ID Resolution
A shared utility function resolves an `{id}` path parameter to an agenda UUID before the route handler executes:
1. Check if the parameter matches `AGD-\d+` (case-insensitive).
2. If yes: query `agendas` by `short_id` via the unique index; throw `AGENDA_NOT_FOUND` (404) if not found.
3. If no: validate UUID format; throw `INVALID_ID_FORMAT` (422) if invalid.
4. Return the resolved UUID.

This follows the same pattern established for tasks in Feature 11.

### FR-CCR-02: Client Access Enforcement
All authenticated agenda endpoints (all except `/shared/{token}`) verify that the resolved agenda's `client_id` is in the authenticated user's accessible clients before proceeding. Failure returns `FORBIDDEN` (403).

### FR-CCR-03: Source Detection
The `source` field on Agenda Version records is determined by inspecting the caller's token, following the convention established in Feature 07:
- Mastra service account token → `agent`
- User token with `X-Client-Type: terminal` header → `terminal`
- All other user tokens → `ui`

### FR-CCR-04: Validation Errors
Field validation errors return HTTP 422 with the standard error envelope:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation.",
    "details": {
      "validation_errors": [
        { "field": "cycle_end", "message": "cycle_end must be on or after cycle_start." }
      ]
    }
  }
}
```

### FR-CCR-05: Standard Error Envelope
All errors use the standard format established in Feature 07:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": {}
  }
}
```
