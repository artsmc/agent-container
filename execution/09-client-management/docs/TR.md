# TR — Technical Requirements
# Feature 09: Client Management

## 1. Technical Context

This feature registers four route handlers onto the HTTP server scaffolded in Feature 07. It reads from and writes to the `clients`, `users`, `client_users`, `tasks`, and `agendas` tables established in Feature 04. Authentication middleware (token validation, user resolution) is provided by Feature 07 and must not be re-implemented here.

The tech stack decision (Node.js/Fastify vs Python/FastAPI) is an open question in the PRD. This document is written in a framework-agnostic style. Specific adapter notes are called out where the choice matters.

---

## 2. API Contracts

### 2.1 GET /clients

**Route:** `GET /clients`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution (`auth_user_id` → product `user_id`, `role`)

**Handler Responsibilities:**
1. Read `page` and `per_page` from query string. Apply defaults (page=1, per_page=20). Validate per_page <= 100.
2. If `role = 'admin'`: query `SELECT * FROM clients ORDER BY name ASC LIMIT per_page OFFSET (page-1)*per_page`.
3. If `role != 'admin'`: join through `client_users` to filter to the user's accessible clients.
4. Run a parallel COUNT query for pagination totals.
5. Return shaped response.

**Response Shape:**
```typescript
interface ListClientsResponse {
  data: ClientRecord[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}
```

---

### 2.2 GET /clients/{id}

**Route:** `GET /clients/:id`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `id` is a valid UUID format. Return `400 INVALID_ID` if not.
2. Query: `SELECT * FROM clients WHERE id = :id`.
3. If no row returned: return `404 CLIENT_NOT_FOUND`.
4. If `role != 'admin'`: verify user has a record in `client_users` for this `client_id`. If not, return `404 CLIENT_NOT_FOUND` (do not reveal existence).
5. Return the client record.

**Response Shape:**
```typescript
interface ClientRecord {
  id: string;           // UUID
  name: string;
  grain_playlist_id: string | null;
  default_asana_workspace_id: string | null;
  default_asana_project_id: string | null;
  email_recipients: EmailRecipient[];
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
}

interface EmailRecipient {
  name: string;
  email: string;
  role?: string;
}
```

---

### 2.3 PATCH /clients/{id}

**Route:** `PATCH /clients/:id`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `id` is a valid UUID format.
2. Check body is non-empty JSON. Reject empty `{}`.
3. Validate all provided fields against the schema (see FRS Section 3.2).
4. Resolve client access (same as GET — 404 for inaccessible, 403 for Team Member role).
5. Build the SQL UPDATE using only the fields present in the body. Do not overwrite absent fields.
6. Set `updated_at = NOW()` on the updated record.
7. Write audit log entry (see Section 5).
8. Return the full updated record.

**Accepted Body Schema (all fields optional, at least one required):**
```typescript
interface PatchClientBody {
  name?: string;                           // non-empty, max 255 chars
  grain_playlist_id?: string | null;       // max 500 chars, nullable
  default_asana_workspace_id?: string | null;
  default_asana_project_id?: string | null;
  email_recipients?: EmailRecipient[];     // max 50 items
}
```

**Validation Rules:**
- Unknown fields in body → `400 INVALID_BODY`
- `name` present and empty string → `400 INVALID_BODY`
- `email_recipients` item missing `email` → `400 INVALID_BODY`
- `email_recipients` item `email` fails RFC 5322 basic validation → `400 INVALID_BODY`
- `email_recipients` array length > 50 → `400 INVALID_BODY`

---

### 2.4 GET /clients/{id}/status

**Route:** `GET /clients/:id/status`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `id` is UUID format.
2. Resolve client access (same as GET).
3. Execute the following queries (can run concurrently):
   - **Task counts:** `SELECT status, COUNT(*) FROM tasks WHERE client_id = :id GROUP BY status`
   - **Current agenda:** `SELECT id, short_id, status, cycle_start, cycle_end, updated_at FROM agendas WHERE client_id = :id ORDER BY updated_at DESC LIMIT 1`
4. Assemble and return the status response.

**Response Shape:**
```typescript
interface ClientStatusResponse {
  client_id: string;
  client_name: string;
  tasks: {
    total: number;
    draft: number;
    pending_approval: number;  // same value as draft in V1
    approved: number;
    pushed: number;
    rejected: number;
  };
  agenda: {
    current: AgendaSummary | null;
    is_ready_to_share: boolean;
  };
  next_call: null;  // Reserved; always null in V1
}

interface AgendaSummary {
  id: string;
  short_id: string;
  status: 'draft' | 'in_review' | 'finalized' | 'shared';
  cycle_start: string;  // ISO 8601 date
  cycle_end: string;    // ISO 8601 date
  updated_at: string;   // ISO 8601 datetime
}
```

---

### 2.5 GET /clients/{id}/users

**Route:** `GET /clients/:id/users`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `id` is a valid UUID format.
2. Resolve client access (same as GET — 404 for inaccessible).
3. Query: `SELECT cu.*, u.name, u.email, u.role FROM client_users cu JOIN users u ON cu.user_id = u.id WHERE cu.client_id = :id`.
4. Return the list of user assignments with user details.

---

### 2.6 POST /clients/{id}/users

**Route:** `POST /clients/:id/users`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate `id` is a valid UUID format.
2. Validate body contains `user_id` (UUID). Optional `role` field (defaults to `'member'`).
3. Resolve client access — only Admins can assign users.
4. Verify target user exists.
5. Insert into `client_users`: `INSERT INTO client_users (user_id, client_id, role) VALUES (:userId, :clientId, :role)`.
6. Return the created record.

---

### 2.7 DELETE /clients/{id}/users/{userId}

**Route:** `DELETE /clients/:id/users/:userId`

**Middleware (from Feature 07):**
- Bearer token validation
- User resolution

**Handler Responsibilities:**
1. Validate both `id` and `userId` are valid UUID format.
2. Resolve client access — only Admins can remove assignments.
3. Delete: `DELETE FROM client_users WHERE client_id = :id AND user_id = :userId`.
4. Return `{ "deleted": true }`.

---

## 3. Data Models

### 3.1 Clients Table (from Feature 04)

```sql
CREATE TABLE clients (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       VARCHAR(255) NOT NULL,
  grain_playlist_id          VARCHAR(500),
  default_asana_workspace_id VARCHAR(500),
  default_asana_project_id   VARCHAR(500),
  email_recipients           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

No schema migrations are required in this feature — the table is created by Feature 04. This feature is read/write only.

### 3.2 Client Users Join Table (from Feature 04)

The `client_users` table is defined in Feature 04 and supports many-to-many user-client relationships with a role per assignment.

```sql
CREATE TABLE client_users (
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role        VARCHAR(50)   NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_id)
);
```

This feature reads from `client_users` for permission scoping (GET endpoints) and writes to it for user assignment management (POST/DELETE `/clients/{id}/users` endpoints).

### 3.3 Tasks Table (read-only, from Feature 04)

Used by `GET /clients/{id}/status` for count aggregation. No writes in this feature.

```sql
-- Query pattern used:
SELECT status, COUNT(*) as count
FROM tasks
WHERE client_id = $1
GROUP BY status;
```

### 3.4 Agendas Table (read-only, from Feature 04)

Used by `GET /clients/{id}/status` for the current agenda lookup.

```sql
-- Query pattern used:
SELECT id, short_id, status, cycle_start, cycle_end, updated_at
FROM agendas
WHERE client_id = $1
ORDER BY updated_at DESC
LIMIT 1;
```

---

## 4. Indexes

The following indexes are expected to exist from Feature 04. This feature benefits from them but does not create them:

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `clients_pkey` | clients | `id` | Primary key lookup |
| `client_users_user_idx` | client_users | `user_id` | "Which clients can this user access?" |
| `tasks_client_status_idx` | tasks | `(client_id, status)` | Status count aggregation for status endpoint |
| `agendas_client_updated_idx` | agendas | `(client_id, updated_at DESC)` | Current agenda lookup for status endpoint |

If these indexes do not exist, create them as part of this feature's implementation ticket.

---

## 5. Audit Logging

### 5.1 Trigger Point

Only `PATCH /clients/{id}` generates audit log entries. Read endpoints do not log.

### 5.2 Log Entry Structure

```sql
INSERT INTO audit_log (
  user_id,
  action,
  entity_type,
  entity_id,
  metadata,
  source,
  created_at
) VALUES (
  :user_id,           -- product UUID from middleware
  'client.updated',
  'client',
  :client_id,
  :metadata,          -- JSONB: { "changed_fields": ["name", "email_recipients"] }
  :source,            -- 'ui' | 'terminal' | 'agent' from request context
  NOW()
);
```

### 5.3 changed_fields Computation

The `changed_fields` array must contain only the field names whose values actually changed — not all fields present in the body. For example, if the body sends `name` with the same value as the current record, `name` should not appear in `changed_fields`.

Implementation approach: fetch the current record before the update, diff the incoming body fields against the current values, populate `changed_fields` from the diff.

---

## 6. Error Response Format

All error responses follow the standard format established in the API PRD:

```json
{
  "error": {
    "code": "CLIENT_NOT_FOUND",
    "message": "The requested client does not exist or you do not have access to it.",
    "details": {
      "client_id": "00000000-0000-0000-0000-000000000000"
    }
  }
}
```

### 6.1 Error Code Registry (this feature)

| Code | HTTP Status | Trigger |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired Bearer token |
| `FORBIDDEN` | 403 | Team Member attempting PATCH |
| `CLIENT_NOT_FOUND` | 404 | Client does not exist, or user cannot access it |
| `INVALID_ID` | 400 | Path parameter `id` is not a valid UUID |
| `INVALID_BODY` | 400 | Body fails validation (empty, unknown fields, invalid field values) |
| `INVALID_PAGINATION` | 400 | `per_page` > 100 or non-positive integers for page/per_page |

---

## 7. Security Requirements

### 7.1 Existence Hiding

For any client that exists in the database but the requesting user cannot access, all endpoints must return `404 CLIENT_NOT_FOUND` — not `403 FORBIDDEN`. This prevents enumeration of client IDs by unauthorized users.

### 7.2 Input Sanitization

All string inputs (`name`, `grain_playlist_id`, `default_asana_workspace_id`, `default_asana_project_id`, and `email_recipients[].name`) must be stored as-is (no HTML encoding at storage time) but must be parameterized in all SQL queries to prevent injection. The API layer never renders HTML, so XSS encoding is the responsibility of the consumer (Web UI).

### 7.3 JSONB Field Handling

The `email_recipients` JSONB field must be validated against a defined schema before storage. Arbitrary JSON structures must not be accepted. The only valid shape is an array of `{ "name": string, "email": string }` objects.

### 7.4 Token Validation

Token validation is fully delegated to Feature 07 middleware. This feature must not implement its own token parsing.

---

## 8. Performance Requirements

### 8.1 Response Time Targets

| Endpoint | Target P95 Response Time |
|---|---|
| `GET /clients` | < 200ms |
| `GET /clients/{id}` | < 100ms |
| `PATCH /clients/{id}` | < 300ms (includes audit log write) |
| `GET /clients/{id}/status` | < 300ms (includes two parallel aggregate queries) |

### 8.2 Status Endpoint Query Strategy

The two aggregate queries in `GET /clients/{id}/status` (task counts and current agenda) must execute concurrently (e.g., `Promise.all` in Node.js, `asyncio.gather` in Python). Sequential execution is not acceptable given the P95 target.

### 8.3 Pagination

Client list queries must use `LIMIT` / `OFFSET` pagination. Full table scans without `LIMIT` are not acceptable. The total count query runs separately (not via a windowed function) to keep the main query simple.

---

## 9. Dependencies

### 9.1 Internal Dependencies

| Dependency | Feature | What Is Required |
|---|---|---|
| API framework and routing | 07 (api-scaffolding) | Route registration, middleware chain, request/response types |
| Token validation middleware | 07 (api-scaffolding) | `req.user` populated with `user_id`, `role`, `auth_user_id` |
| `clients` table | 04 (product-database-schema) | Table exists with correct schema |
| `client_users` table | 04 (product-database-schema) | Join table for permission scoping |
| `tasks` table | 04 (product-database-schema) | Used for status count aggregation |
| `agendas` table | 04 (product-database-schema) | Used for current agenda lookup |
| `audit_log` table | 04 (product-database-schema) | Used for PATCH audit writes |
| Shared TypeScript types | 01 (shared-types-package) | `ClientRecord`, `EmailRecipient`, `AuditLogEntry` types |

### 9.2 External Dependencies

None. This feature has no external service calls (no Asana, no Google Docs, no Grain, no email).

---

## 10. Testing Requirements

### 10.1 Unit Tests

- Validation logic for PATCH body (each field, each error case from FRS Section 3.5).
- UUID format validation.
- `changed_fields` diff computation for audit log.
- Task count aggregation assembly (given a map of status → count, verify correct response shape).
- `is_ready_to_share` boolean derivation logic.

### 10.2 Integration Tests

- Full request/response cycle for each endpoint using a test database.
- Permission matrix: each role × each endpoint × each access scenario (own client, unassigned client, non-existent client).
- Concurrent status query execution (verify both queries run in parallel by mocking with delays).
- Audit log entry created on successful PATCH with correct `changed_fields`.
- Audit log NOT created on failed PATCH (validation errors, 403, 404).
- Pagination: correct slicing, correct total counts.

### 10.3 Test Data Requirements

Integration tests must seed:
- At least 3 client records.
- At least 3 user records (one per role).
- `client_users` records scoping users to specific clients.
- Task records with varying statuses for at least one client.
- Agenda records with varying statuses for at least one client.

---

## 11. Open Technical Questions

| # | Question | Impact |
|---|---|---|
| 1 | ~~Does Feature 04 define a `client_users` join table?~~ **Resolved**: Feature 04 now defines `client_users` with columns `user_id`, `client_id`, `role`, `created_at` and `PRIMARY KEY (user_id, client_id)`. | Resolved. |
| 2 | What is the API framework? (Node.js/Fastify, Fastify + Zod, Python/FastAPI) | Affects body validation approach (Zod schema vs Pydantic model), UUID parsing, and concurrent query syntax. |
| 3 | Should `GET /clients/{id}/status` include the full client record or just the status fields? | Current spec returns only status fields + client name. If UI needs full config too, merge the two queries. |
| 4 | Is `pending_approval` always the same as `draft` in V1, or is there a distinction between "needs review" and "reviewed but not yet approved"? | Affects whether the task status ENUM needs a `pending_approval` value, or if the status endpoint just aliases `draft`. |
