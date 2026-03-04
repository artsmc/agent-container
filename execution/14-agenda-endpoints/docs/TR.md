# TR — Technical Requirements
## Feature 14: Agenda Endpoints

**Feature Name:** agenda-endpoints
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Implementation Strategy

Feature 14 is implemented entirely within the API layer (established by Feature 07). It adds route handlers, service-layer business logic, a short ID generation utility, share token generation, and database query functions for agendas and agenda versions. It does not introduce new infrastructure.

The implementation follows the same four-layer structure established in Feature 11:

1. **Route Layer** — Route definitions, request validation, auth middleware hooks. The `/shared/{token}` route bypasses auth middleware entirely.
2. **Service Layer** — Business logic: lifecycle enforcement, token generation, version creation, audit logging, adapter delegation.
3. **Data Access Layer** — Database queries via the ORM/query builder from Feature 07.
4. **Short ID Utility** — Isolated module for generating and resolving `AGD-####` identifiers. Pattern mirrors the `TSK-####` utility from Feature 11.

---

## 2. API Endpoint Contracts

### 2.1 Create Draft Agenda

```
POST /clients/{client_id}/agendas
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body Schema:**
```typescript
interface CreateAgendaRequest {
  content: string;        // required, non-empty
  cycle_start: string;    // required, ISO 8601 date "YYYY-MM-DD"
  cycle_end: string;      // required, ISO 8601 date "YYYY-MM-DD", must be >= cycle_start
  source?: 'agent' | 'ui' | 'terminal';  // optional, default: 'agent'
}
```

**Response: 201 Created**
```typescript
interface CreateAgendaResponse {
  id: string;           // UUID
  short_id: string;     // e.g., "AGD-0015"
  client_id: string;
  status: 'draft';
  content: string;
  cycle_start: string;  // "YYYY-MM-DD"
  cycle_end: string;    // "YYYY-MM-DD"
  created_at: string;   // ISO 8601
  updated_at: string;
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 401 | UNAUTHORIZED | Invalid/expired token |
| 403 | FORBIDDEN | User cannot access this client |
| 404 | CLIENT_NOT_FOUND | Client does not exist or is not accessible |
| 422 | VALIDATION_ERROR | Required fields missing, invalid dates, or cycle_end before cycle_start |

---

### 2.2 List Agendas

```
GET /clients/{client_id}/agendas?status=draft&page=1&per_page=20
Authorization: Bearer <token>
```

**Query Parameters:**
| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string | — | One of `draft`, `in_review`, `finalized`, `shared` |
| `page` | integer | 1 | 1-based |
| `per_page` | integer | 20 | Max 100 |

**Response: 200 OK**
```typescript
interface ListAgendasResponse {
  data: AgendaSummary[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface AgendaSummary {
  id: string;
  short_id: string;
  status: AgendaStatus;
  cycle_start: string;
  cycle_end: string;
  finalized_at: string | null;
  shared_at: string | null;
  google_doc_id: string | null;
  created_at: string;
  updated_at: string;
  // content and versions are excluded from list response
}
```

---

### 2.3 Get Agenda Detail

```
GET /agendas/{id}
Authorization: Bearer <token>
```

`{id}` accepts UUID or short ID (e.g., `AGD-0015`).

**Response: 200 OK**
```typescript
interface AgendaDetailResponse {
  id: string;
  short_id: string;
  client_id: string;
  status: AgendaStatus;
  content: string;
  cycle_start: string;
  cycle_end: string;
  shared_url_token: string | null;
  internal_url_token: string | null;
  google_doc_id: string | null;
  finalized_by: string | null;  // user UUID
  finalized_at: string | null;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
  versions: AgendaVersion[];
}

interface AgendaVersion {
  id: string;
  version: number;
  content: string;
  edited_by: string;    // user UUID
  source: 'agent' | 'ui' | 'terminal';
  created_at: string;
}

type AgendaStatus = 'draft' | 'in_review' | 'finalized' | 'shared';
```

---

### 2.4 Edit Agenda

```
PATCH /agendas/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (all fields optional, at least one required):**
```typescript
interface EditAgendaRequest {
  content?: string;       // non-empty
  cycle_start?: string;   // "YYYY-MM-DD"
  cycle_end?: string;     // "YYYY-MM-DD"
}
```

**Response: 200 OK** — Full agenda detail (same as GET /agendas/{id}).

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 422 | AGENDA_NOT_EDITABLE | Agenda status is `finalized` or `shared` |
| 422 | VALIDATION_ERROR | Date format invalid or cycle_end before cycle_start |

---

### 2.5 Finalize Agenda

```
POST /agendas/{id}/finalize
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**
```typescript
interface FinalizeAgendaRequest {
  force?: boolean;  // required only when agenda has no human edits; default false
}
```

**Response: 200 OK** — Full agenda detail with `status: "finalized"`.

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | FORBIDDEN | User role is not `account_manager` or `admin` |
| 422 | AGENDA_NOT_FINALIZABLE | No human edits and force not true; details include requires_force: true |
| 422 | AGENDA_ALREADY_FINALIZED | Status is already `finalized` or `shared` |

---

### 2.6 Share Agenda

```
POST /agendas/{id}/share
Authorization: Bearer <token>
```

No request body.

**Response: 200 OK**
```typescript
interface ShareAgendaResponse {
  agenda: AgendaDetailResponse;
  share_urls: {
    client_url: string;   // full URL with shared_url_token
    internal_url: string; // full URL with internal_url_token
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | FORBIDDEN | User role is not `account_manager` or `admin` |
| 422 | AGENDA_NOT_SHAREABLE | Status is not `finalized` or `shared` |

---

### 2.7 Email Agenda

```
POST /agendas/{id}/email
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (optional):**
```typescript
interface EmailAgendaRequest {
  recipients?: string[];  // optional override; if absent, uses client email_recipients config
}
```

**Response: 200 OK**
```typescript
interface EmailAgendaResponse {
  agenda: AgendaDetailResponse;
  email: {
    sent_to: string[];
    sent_at: string;  // ISO 8601
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | FORBIDDEN | User role is not `account_manager` or `admin` |
| 422 | AGENDA_NOT_EMAILABLE | Status is not `finalized` or `shared` |
| 422 | NO_EMAIL_RECIPIENTS | No recipients in request or client config |
| 422 | VALIDATION_ERROR | Invalid email address in recipients array |
| 502 | EMAIL_FAILED | Email adapter returned an error |

---

### 2.8 Export Agenda

```
POST /agendas/{id}/export
Authorization: Bearer <token>
```

No request body.

**Response: 200 OK**
```typescript
interface ExportAgendaResponse {
  agenda: AgendaDetailResponse;  // includes updated google_doc_id
  export: {
    google_doc_id: string;
    exported_at: string;  // ISO 8601
  };
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 403 | FORBIDDEN | User role is not `account_manager` or `admin` |
| 422 | AGENDA_NOT_EXPORTABLE | Status is not `finalized` or `shared` |
| 502 | EXPORT_FAILED | Google Docs adapter returned an error |

---

### 2.9 Public Shared Agenda

```
GET /shared/{token}
```

No Authorization header required.

**Response: 200 OK**
```typescript
interface PublicAgendaResponse {
  short_id: string;
  client_name: string;  // display name from Clients table
  content: string;
  cycle_start: string;
  cycle_end: string;
  shared_at: string;
}
```

**Error Responses:**
| Status | Code | Condition |
|---|---|---|
| 404 | SHARED_LINK_NOT_FOUND | No agenda matches this token |

---

## 3. Data Models

### 3.1 Agendas Table

Feature 04 is responsible for schema migrations. This feature's requirements for the Agendas table:

```sql
CREATE TYPE agenda_status AS ENUM ('draft', 'in_review', 'finalized', 'shared');

CREATE TABLE agendas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id             VARCHAR(20) NOT NULL UNIQUE,
  client_id            UUID NOT NULL REFERENCES clients(id),
  status               agenda_status NOT NULL DEFAULT 'draft',
  content              TEXT NOT NULL,
  cycle_start          DATE NOT NULL,
  cycle_end            DATE NOT NULL,
  shared_url_token     VARCHAR(64),
  internal_url_token   VARCHAR(64),
  google_doc_id        VARCHAR(255),
  finalized_by         UUID REFERENCES users(id),
  finalized_at         TIMESTAMPTZ,
  shared_at            TIMESTAMPTZ,
  is_imported          BOOLEAN NOT NULL DEFAULT false,
  imported_at          TIMESTAMPTZ,
  import_source        VARCHAR(255),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Short ID Sequence

```sql
CREATE SEQUENCE agenda_short_id_seq START 1 INCREMENT 1 NO CYCLE;

CREATE OR REPLACE FUNCTION next_agenda_short_id() RETURNS VARCHAR AS $$
  SELECT 'AGD-' || LPAD(nextval('agenda_short_id_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;
```

Usage at insert time:
```sql
INSERT INTO agendas (short_id, ...) VALUES (next_agenda_short_id(), ...);
```

This mirrors the `next_task_short_id()` function pattern from Feature 11.

### 3.3 Agenda Versions Table

```sql
CREATE TABLE agenda_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id   UUID NOT NULL REFERENCES agendas(id),
  version     INTEGER NOT NULL,
  content     TEXT NOT NULL,
  edited_by   UUID NOT NULL REFERENCES users(id),
  source      version_source NOT NULL,  -- reuses enum from Feature 11
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agenda_id, version)
);
```

The `version_source` enum (`agent`, `ui`, `terminal`) is shared with `task_versions`. Feature 04 defines it once.

### 3.4 Required Indexes

These indexes are specified here for Feature 04 to implement:

```sql
CREATE UNIQUE INDEX agendas_short_id_idx ON agendas(short_id);
CREATE INDEX agendas_client_status_idx ON agendas(client_id, status);
CREATE UNIQUE INDEX agendas_shared_url_token_idx ON agendas(shared_url_token) WHERE shared_url_token IS NOT NULL;
CREATE INDEX agenda_versions_agenda_id_idx ON agenda_versions(agenda_id);
```

The `UNIQUE` partial index on `shared_url_token` ensures uniqueness while allowing multiple NULLs.

---

## 4. Short ID Resolution Logic

```typescript
async function resolveAgendaId(idParam: string, db: Database): Promise<string> {
  const SHORT_ID_PATTERN = /^AGD-\d+$/i;

  if (SHORT_ID_PATTERN.test(idParam)) {
    const agenda = await db.agendas.findOne({ where: { short_id: idParam.toUpperCase() } });
    if (!agenda) throw new NotFoundError('AGENDA_NOT_FOUND');
    return agenda.id;
  }

  if (!isValidUUID(idParam)) throw new ValidationError('INVALID_ID_FORMAT');

  return idParam;
}
```

Pattern mirrors `resolveTaskId` from Feature 11. Short ID lookup hits the `agendas_short_id_idx` unique index — single index scan, sub-millisecond.

---

## 5. Share Token Generation

```typescript
import { randomBytes } from 'crypto';

function generateShareToken(): string {
  // 32 bytes = 256 bits of entropy; URL-safe base64 = 43 characters
  return randomBytes(32).toString('base64url');
}

async function generateShareTokens(agendaId: string, db: Database): Promise<{
  shared_url_token: string;
  internal_url_token: string;
}> {
  // Check if tokens already exist (idempotency)
  const existing = await db.agendas.findOne({
    where: { id: agendaId },
    select: ['shared_url_token', 'internal_url_token'],
  });

  if (existing.shared_url_token && existing.internal_url_token) {
    return {
      shared_url_token: existing.shared_url_token,
      internal_url_token: existing.internal_url_token,
    };
  }

  // Generate new tokens
  const shared_url_token = generateShareToken();
  const internal_url_token = generateShareToken();

  await db.agendas.update(agendaId, { shared_url_token, internal_url_token });

  return { shared_url_token, internal_url_token };
}
```

Token uniqueness: the `UNIQUE` partial index on `shared_url_token` prevents collision. Given 32 bytes of entropy, collision probability under 1 million agendas is negligible (birthday bound >> 10^9).

---

## 6. Agenda Lifecycle Service

```typescript
type AgendaStatus = 'draft' | 'in_review' | 'finalized' | 'shared';

interface FinalizeParams {
  agendaId: string;
  userId: string;
  force: boolean;
  db: Database;
}

async function finalizeAgenda(params: FinalizeParams): Promise<Agenda> {
  const { agendaId, userId, force, db } = params;
  const agenda = await db.agendas.findWithVersions(agendaId);

  // Precondition: not already finalized/shared
  if (agenda.status === 'finalized' || agenda.status === 'shared') {
    throw new BusinessError('AGENDA_ALREADY_FINALIZED', 422, {
      current_status: agenda.status,
    });
  }

  // Human review check
  const hasHumanEdit = agenda.versions.some(v => v.source !== 'agent');
  if (!hasHumanEdit && !force) {
    throw new BusinessError('AGENDA_NOT_FINALIZABLE', 422, {
      requires_force: true,
      reason: 'Agenda has not been edited by a human. Pass force: true to confirm.',
    });
  }

  // Execute transition
  await db.agendas.update(agendaId, {
    status: 'finalized',
    finalized_by: userId,
    finalized_at: new Date(),
    updated_at: new Date(),
  });

  await writeAuditEntry('agenda.finalized', 'agenda', agendaId, userId, {
    forced: force,
    finalized_at: new Date().toISOString(),
  }, detectSource(/* request */));

  return db.agendas.findWithVersions(agendaId);
}
```

---

## 7. Source Detection

Follows the convention from Feature 11 (Feature 07 establishes the mechanism):

| Token Type | Detected Source | Version source value |
|---|---|---|
| Mastra service account (`client_credentials` grant) | Service identity | `agent` |
| User token + `X-Client-Type: terminal` header | Terminal/MCP client | `terminal` |
| User token (no special header, or `X-Client-Type: ui`) | Web UI | `ui` |

---

## 8. Audit Log Entries

| Action | entity_type | metadata fields |
|---|---|---|
| `agenda.created` | `agenda` | `short_id`, `client_id`, `cycle_start`, `cycle_end`, `source` |
| `agenda.edited` | `agenda` | `version`, `previous_status` (if promoted), `source` |
| `agenda.finalized` | `agenda` | `finalized_by`, `finalized_at`, `forced` (boolean) |
| `agenda.shared` | `agenda` | `shared_at` |
| `agenda.emailed` | `agenda` | `recipients` (array), `sent_at`, `source` |
| `agenda.exported` | `agenda` | `google_doc_id`, `exported_at` |

Status-transition events (finalize, share) do NOT create a new Agenda Version record. Version records capture content edits only. Status history lives in the Audit Log.

---

## 9. Adapter Interface Contracts

### 9.1 Email Adapter Interface (Feature 16)

Feature 14 calls Feature 16 via this internal service contract:

```typescript
interface EmailAdapterService {
  sendAgenda(params: {
    agenda: {
      short_id: string;
      content: string;
      cycle_start: string;
      cycle_end: string;
    };
    client_name: string;
    recipients: string[];
  }): Promise<{ sent_at: string }>;
}
```

On any error from the adapter, Feature 14 wraps it as `EMAIL_FAILED` (502) and does not change the agenda's status.

### 9.2 Google Docs Adapter Interface (Feature 15)

```typescript
interface GoogleDocsAdapterService {
  exportAgenda(params: {
    agenda: {
      short_id: string;
      content: string;
      cycle_start: string;
      cycle_end: string;
    };
    client_name: string;
    existing_doc_id?: string | null;  // passed if re-exporting
  }): Promise<{ google_doc_id: string }>;
}
```

On any error from the adapter, Feature 14 wraps it as `EXPORT_FAILED` (502) and does not change the agenda's `google_doc_id`.

---

## 10. Public Route Configuration

The `/shared/{token}` route must be registered outside the authenticated router. In the framework established by Feature 07:

```typescript
// Authenticated routes (all use JWT validation middleware)
authenticatedRouter.get('/agendas/:id', agendaController.getDetail);
// ...

// Public routes (no JWT middleware)
publicRouter.get('/shared/:token', agendaController.getPublicShared);
```

The public handler must:
1. Query the agendas table by `shared_url_token` using the partial unique index.
2. Return the minimal public response shape (no internal fields).
3. Never return 401 — only 200 or 404.

---

## 11. URL Construction for Share Responses

The full share URLs are constructed by the API using a configured base URL:

```typescript
const APP_BASE_URL = process.env.APP_BASE_URL; // e.g., "https://app.example.com"

function buildShareUrls(tokens: { shared_url_token: string; internal_url_token: string }) {
  return {
    client_url: `${APP_BASE_URL}/shared/${tokens.shared_url_token}`,
    internal_url: `${APP_BASE_URL}/agendas/edit/${tokens.internal_url_token}`,
  };
}
```

`APP_BASE_URL` is set per environment (dev/staging/prod). The `/agendas/edit/{token}` path is consumed by the UI (Feature 28); the route is served by the UI, not the API.

---

## 12. Performance Requirements

| Operation | Target P95 Latency | Conditions |
|---|---|---|
| `POST /clients/{id}/agendas` | < 500ms | Sequence fetch, agenda insert, version insert, audit entry |
| `GET /agendas/{id}` by short ID | < 100ms | Index scan + join to agenda_versions |
| `GET /clients/{id}/agendas` | < 200ms | Paginated, index-covered query |
| `PATCH /agendas/{id}` | < 300ms | Update + version insert + audit entry |
| `POST /agendas/{id}/finalize` | < 200ms | Version count query + status update + audit entry |
| `POST /agendas/{id}/share` | < 200ms | Token generation + update + audit entry |
| `GET /shared/{token}` | < 150ms | Single index scan + client name join; no auth overhead |
| `POST /agendas/{id}/email` | Depends on Feature 16 | Adapter call excluded from this feature's latency budget |
| `POST /agendas/{id}/export` | Depends on Feature 15 | Adapter call excluded from this feature's latency budget |

---

## 13. Security Requirements

### 13.1 Authentication
All endpoints except `GET /shared/{token}` require a valid Bearer token validated against the auth service JWKS (Feature 07 middleware).

### 13.2 Authorization Matrix

| Endpoint | Required Role / Access |
|---|---|
| `POST /clients/{id}/agendas` | Access to client (any role, including service account) |
| `GET /clients/{id}/agendas` | Access to client (any role) |
| `GET /agendas/{id}` | Access to agenda's client (any role) |
| `PATCH /agendas/{id}` | Access to agenda's client (any role, including team_member) |
| `POST /agendas/{id}/finalize` | `account_manager` or `admin` role |
| `POST /agendas/{id}/share` | `account_manager` or `admin` role |
| `POST /agendas/{id}/email` | `account_manager` or `admin` role |
| `POST /agendas/{id}/export` | `account_manager` or `admin` role |
| `GET /shared/{token}` | None — public endpoint |

### 13.3 Data Scoping
Agenda routes without `client_id` in the path (e.g., `GET /agendas/{id}`, `PATCH /agendas/{id}`) must cross-reference the agenda's `client_id` against the authenticated user's accessible clients. This prevents cross-client data leakage.

### 13.4 Share Token Security
- Tokens are generated using `crypto.randomBytes(32)` — cryptographically secure random, 256 bits of entropy.
- Tokens are never logged in application logs.
- The `/shared/{token}` response never echoes the token back (no `shared_url_token` field in the public response).

### 13.5 Input Validation
All request bodies are validated with the schema validation library established in Feature 07. Unknown fields are stripped. Date fields are validated for format and logical consistency (`cycle_end >= cycle_start`).

---

## 14. Error Codes Reference

| Code | HTTP Status | Trigger |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `FORBIDDEN` | 403 | Authenticated but lacks required role or client access |
| `CLIENT_NOT_FOUND` | 404 | Client doesn't exist or not accessible to the user |
| `AGENDA_NOT_FOUND` | 404 | No agenda matches the UUID or short ID |
| `SHARED_LINK_NOT_FOUND` | 404 | No agenda matches the share token |
| `VALIDATION_ERROR` | 422 | Request body fails schema validation |
| `INVALID_ID_FORMAT` | 422 | Path parameter is neither a UUID nor a valid AGD-#### pattern |
| `AGENDA_NOT_EDITABLE` | 422 | PATCH attempted on agenda with status `finalized` or `shared` |
| `AGENDA_NOT_FINALIZABLE` | 422 | No human edits and `force` not set; includes `requires_force: true` in details |
| `AGENDA_ALREADY_FINALIZED` | 422 | Finalize attempted on already-finalized or shared agenda |
| `AGENDA_NOT_SHAREABLE` | 422 | Share attempted on non-finalized/non-shared agenda |
| `AGENDA_NOT_EMAILABLE` | 422 | Email attempted on non-finalized/non-shared agenda |
| `AGENDA_NOT_EXPORTABLE` | 422 | Export attempted on non-finalized/non-shared agenda |
| `NO_EMAIL_RECIPIENTS` | 422 | No recipients in request body and none configured on client |
| `EMAIL_FAILED` | 502 | Email adapter returned an error |
| `EXPORT_FAILED` | 502 | Google Docs adapter returned an error |

---

## 15. Dependencies and Tech Stack

### 15.1 Internal Dependencies

| Feature | What This Feature Uses |
|---|---|
| Feature 04 | Agendas table, Agenda Versions table, agenda_short_id_seq, Audit Log table, agenda_status enum |
| Feature 07 | App instance, token validation middleware, error handling, DB pool, route registration, source detection convention |
| Feature 09 | Client record (`email_recipients` JSONB, `name` for public endpoint) |
| Feature 11 | Short ID resolution pattern (mirror for AGD-####); version_source enum already defined |

### 15.2 Downstream Interface Stubs

Both adapter interfaces should have stub implementations created here for testability:

```typescript
// EmailAdapter stub — to be replaced by Feature 16
class EmailAdapterStub implements EmailAdapterService {
  async sendAgenda(_params: unknown): Promise<{ sent_at: string }> {
    throw new Error('EmailAdapter not implemented — Feature 16 pending');
  }
}

// GoogleDocsAdapter stub — to be replaced by Feature 15
class GoogleDocsAdapterStub implements GoogleDocsAdapterService {
  async exportAgenda(_params: unknown): Promise<{ google_doc_id: string }> {
    throw new Error('GoogleDocsAdapter not implemented — Feature 15 pending');
  }
}
```

Wire stubs into the DI system established in Feature 07. Tests inject mock implementations directly.

### 15.3 No New npm Packages Required
This feature uses only:
- The ORM/query builder from Feature 07.
- The schema validation library from Feature 07.
- Node.js built-in `crypto` module for token generation (no additional package needed).
- The authentication middleware from Feature 07.

### 15.4 Environment Variables Required

| Variable | Description | Example |
|---|---|---|
| `APP_BASE_URL` | Base URL for constructing share links | `https://app.example.com` |

---

## 16. Implementation Notes and Alternatives

### 16.1 Token Generation: crypto.randomBytes vs. UUID
**Chosen approach:** `crypto.randomBytes(32).toString('base64url')` — 43 characters, 256 bits of entropy.
**Alternative:** UUID v4 (122 bits of entropy, 36 characters including hyphens). Sufficient, but base64url tokens are slightly more opaque and harder to pattern-match as UUIDs.
**Rationale:** Using tokens that don't look like UUIDs reduces the chance of miscategorization by clients; 256 bits of entropy provides comfortable security margin.

### 16.2 Finalization Force Check: Version-Based vs. Status-Based
**Chosen approach:** Check whether any Agenda Version has a `source` other than `agent`. This is semantically correct — it checks whether a human actually modified the content, not just whether the status advanced.
**Alternative:** Require `status = in_review` before finalizing (implying a human edit promoted it). Simpler but prevents the Mastra agent from creating an agenda that is immediately finalized in an automated workflow if needed.
**Rationale:** Version-based check is more precise and aligns with the business intent of "has a human actually reviewed and modified this content."

### 16.3 Share Endpoint Idempotency
**Chosen approach:** Return existing tokens if already set. Do not regenerate.
**Alternative:** Always regenerate, invalidating the old link. Rejected — would break any client who already received a link.
**Rationale:** Stability is essential for client-facing links. Token revocation can be added as an admin feature later without disrupting this behavior.

### 16.4 PATCH Status Promotion (draft → in_review)
**Chosen approach:** Any successful PATCH on a `draft` agenda automatically promotes it to `in_review`.
**Alternative:** Require an explicit status field in the PATCH body to signal review. Rejected — adds unnecessary friction; the act of editing is sufficient signal.
**Rationale:** Automatic promotion is transparent to callers and removes the need for a separate "begin review" action.

### 16.5 Cycle Date Validation
`cycle_end` must be on or after `cycle_start`. Both must be valid calendar dates. The API validates at the route layer before any database operation. The database stores them as `DATE` type (not `TIMESTAMPTZ`) — only the date matters, not the time or timezone.
