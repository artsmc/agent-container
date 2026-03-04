# FRS — Functional Requirement Specification
# Feature 09: Client Management

## 1. Endpoint: GET /clients

### 1.1 Description

Returns a paginated list of client records accessible to the authenticated user. Scope is enforced at the query level — the result set is filtered to clients the user is assigned to, except for Admins who see all clients.

### 1.2 Request

```
GET /clients
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | 1 | Page number (1-indexed) |
| `per_page` | integer | No | 20 | Results per page. Max: 100. |

### 1.3 Response — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Total Life",
      "grain_playlist_id": "grain-playlist-abc",
      "default_asana_workspace_id": "asana-ws-123",
      "default_asana_project_id": "asana-proj-456",
      "email_recipients": [
        { "name": "Jane Doe", "email": "jane@totallife.com" }
      ],
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-02-20T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 42,
    "total_pages": 3
  }
}
```

### 1.4 Permission Rules

| Role | Result |
|---|---|
| Admin | All clients in the system. |
| Account Manager | Only clients where a `client_users` association exists for this user. |
| Team Member | Only clients where a `client_users` association exists for this user. |

### 1.5 Error Cases

| Condition | HTTP Status | Error Code |
|---|---|---|
| Invalid or expired token | 401 | `UNAUTHORIZED` |
| `per_page` exceeds 100 | 400 | `INVALID_PAGINATION` |
| `page` is not a positive integer | 400 | `INVALID_PAGINATION` |

---

## 2. Endpoint: GET /clients/{id}

### 2.1 Description

Returns the full detail record for a single client including all configuration fields. The `id` parameter is the UUID primary key.

### 2.2 Request

```
GET /clients/{id}
Authorization: Bearer <token>
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Client primary key |

### 2.3 Response — 200 OK

```json
{
  "id": "uuid",
  "name": "Total Life",
  "grain_playlist_id": "grain-playlist-abc",
  "default_asana_workspace_id": "asana-ws-123",
  "default_asana_project_id": "asana-proj-456",
  "email_recipients": [
    { "name": "Jane Doe", "email": "jane@totallife.com" },
    { "name": "Mark Smith", "email": "mark@iexcel.com" }
  ],
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-02-20T14:30:00Z"
}
```

### 2.4 Permission Rules

| Role | Access |
|---|---|
| Admin | Any client. |
| Account Manager | Only assigned clients. |
| Team Member | Only assigned clients. |

Attempting to access a client the user is not assigned to returns `404 CLIENT_NOT_FOUND` (not `403`) to avoid leaking the existence of the record.

### 2.5 Error Cases

| Condition | HTTP Status | Error Code |
|---|---|---|
| Invalid or expired token | 401 | `UNAUTHORIZED` |
| Client does not exist | 404 | `CLIENT_NOT_FOUND` |
| Client exists but user has no access | 404 | `CLIENT_NOT_FOUND` |
| `id` is not a valid UUID format | 400 | `INVALID_ID` |

---

## 3. Endpoint: PATCH /clients/{id}

### 3.1 Description

Partially updates a client's configuration fields. Only the fields included in the request body are updated — omitted fields are unchanged. This is a true PATCH (not PUT).

### 3.2 Request

```
PATCH /clients/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Updatable Fields:**

| Field | Type | Validation |
|---|---|---|
| `name` | string | Non-empty, max 255 characters |
| `grain_playlist_id` | string or null | Max 500 characters |
| `default_asana_workspace_id` | string or null | Max 500 characters |
| `default_asana_project_id` | string or null | Max 500 characters |
| `email_recipients` | array | Each item must have `name` (string) and `email` (valid email format). Max 50 recipients. |

**Example Body:**

```json
{
  "name": "Total Life (Renewed)",
  "email_recipients": [
    { "name": "Jane Doe", "email": "jane@totallife.com" },
    { "name": "Bob Jones", "email": "bob@totallife.com" }
  ]
}
```

**Fields That Cannot Be Updated:**

- `id` — immutable.
- `created_at` — immutable.
- `updated_at` — server-managed; always set to the current timestamp on a successful PATCH.

### 3.3 Response — 200 OK

Returns the full updated client record (same shape as `GET /clients/{id}` response).

```json
{
  "id": "uuid",
  "name": "Total Life (Renewed)",
  "grain_playlist_id": "grain-playlist-abc",
  "default_asana_workspace_id": "asana-ws-123",
  "default_asana_project_id": "asana-proj-456",
  "email_recipients": [
    { "name": "Jane Doe", "email": "jane@totallife.com" },
    { "name": "Bob Jones", "email": "bob@totallife.com" }
  ],
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-03-03T09:15:00Z"
}
```

### 3.4 Permission Rules

| Role | Access |
|---|---|
| Admin | Can PATCH any client. |
| Account Manager | Can PATCH only assigned clients. |
| Team Member | Cannot PATCH any client. Returns `403 FORBIDDEN`. |

### 3.5 Audit Logging

Every successful PATCH must write an entry to the `audit_log` table:

| Field | Value |
|---|---|
| `action` | `client.updated` |
| `entity_type` | `client` |
| `entity_id` | The client UUID |
| `user_id` | The requesting user's product UUID |
| `metadata` | JSON object with `changed_fields`: array of field names that were actually modified |
| `source` | `ui` or `terminal` (derived from request context from feature 07 middleware) |

### 3.6 Error Cases

| Condition | HTTP Status | Error Code |
|---|---|---|
| Invalid or expired token | 401 | `UNAUTHORIZED` |
| Client does not exist or user has no access | 404 | `CLIENT_NOT_FOUND` |
| User is a Team Member | 403 | `FORBIDDEN` |
| Body contains unknown fields | 400 | `INVALID_BODY` |
| `name` is empty string | 400 | `INVALID_BODY` |
| `email_recipients` item missing `email` field | 400 | `INVALID_BODY` |
| `email_recipients` item has malformed email | 400 | `INVALID_BODY` |
| `email_recipients` array exceeds 50 items | 400 | `INVALID_BODY` |
| Body is not valid JSON | 400 | `INVALID_BODY` |
| Empty body (no fields provided) | 400 | `INVALID_BODY` |

---

## 4. Endpoint: GET /clients/{id}/status

### 4.1 Description

Returns an aggregated cycle status overview for the client. This is a computed endpoint — it queries multiple tables to assemble the response. It does not return raw entity data; it returns a summary suitable for driving the cycle overview UI panel and terminal status checks.

### 4.2 Request

```
GET /clients/{id}/status
Authorization: Bearer <token>
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Client primary key |

### 4.3 Response — 200 OK

```json
{
  "client_id": "uuid",
  "client_name": "Total Life",
  "tasks": {
    "total": 24,
    "draft": 6,
    "pending_approval": 6,
    "approved": 4,
    "pushed": 10,
    "rejected": 4
  },
  "agenda": {
    "current": {
      "id": "uuid",
      "short_id": "AGD-0015",
      "status": "in_review",
      "cycle_start": "2026-02-17",
      "cycle_end": "2026-02-28",
      "updated_at": "2026-03-01T11:00:00Z"
    },
    "is_ready_to_share": false
  },
  "next_call": null
}
```

**Field Definitions:**

| Field | Source | Description |
|---|---|---|
| `tasks.total` | COUNT of tasks WHERE `client_id` matches | All non-deleted tasks for this client |
| `tasks.draft` | COUNT WHERE `status = 'draft'` | Tasks awaiting review |
| `tasks.pending_approval` | COUNT WHERE `status = 'draft'` | Alias for tasks requiring an approval action (same as draft for now) |
| `tasks.approved` | COUNT WHERE `status = 'approved'` | Approved, not yet pushed |
| `tasks.pushed` | COUNT WHERE `status = 'pushed'` | Successfully delivered to Asana |
| `tasks.rejected` | COUNT WHERE `status = 'rejected'` | Rejected tasks |
| `agenda.current` | Most recent agenda for this client by `updated_at` | The active or most recent agenda record |
| `agenda.is_ready_to_share` | `agenda.current.status = 'finalized'` | Boolean convenience flag |
| `next_call` | Reserved field | `null` in V1; will be populated from calendar integration in a future feature |

### 4.4 Permission Rules

Same as `GET /clients/{id}` — all three roles (Admin, Account Manager, Team Member) can access the status endpoint for their accessible clients.

### 4.5 Error Cases

| Condition | HTTP Status | Error Code |
|---|---|---|
| Invalid or expired token | 401 | `UNAUTHORIZED` |
| Client does not exist or user has no access | 404 | `CLIENT_NOT_FOUND` |
| `id` is not a valid UUID format | 400 | `INVALID_ID` |

---

## 5. Client User Assignments

### 5.1 Endpoint: GET /clients/{id}/users

Returns the list of users assigned to a client via the `client_users` join table.

**Request:**
```
GET /clients/{id}/users
Authorization: Bearer <token>
```

**Response — 200 OK:**
```json
{
  "data": [
    {
      "user_id": "uuid",
      "client_id": "uuid",
      "role": "member",
      "created_at": "2026-01-15T10:00:00Z",
      "user": {
        "id": "uuid",
        "name": "Mark Smith",
        "email": "mark@iexcel.com",
        "role": "account_manager"
      }
    }
  ]
}
```

**Permission Rules:**

| Role | Access |
|---|---|
| Admin | Any client. |
| Account Manager | Only assigned clients. |
| Team Member | Only assigned clients. |

### 5.2 Endpoint: POST /clients/{id}/users

Assigns a user to a client. Creates a row in the `client_users` join table.

**Request:**
```
POST /clients/{id}/users
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "user_id": "uuid",
  "role": "member"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `user_id` | UUID | Yes | — | The user to assign |
| `role` | string | No | `"member"` | Role within this client context |

**Response — 200 OK:** Returns the created `client_users` record.

**Permission Rules:**

| Role | Access |
|---|---|
| Admin | Can assign users to any client. |
| Account Manager | Cannot assign users. Returns `403 FORBIDDEN`. |
| Team Member | Cannot assign users. Returns `403 FORBIDDEN`. |

**Error Cases:**

| Condition | HTTP Status | Error Code |
|---|---|---|
| User already assigned to this client | 409 | `CONFLICT` |
| Target user does not exist | 404 | `USER_NOT_FOUND` |
| Client does not exist or user has no access | 404 | `CLIENT_NOT_FOUND` |

### 5.3 Endpoint: DELETE /clients/{id}/users/{userId}

Removes a user's assignment from a client. Deletes the row from the `client_users` join table.

**Request:**
```
DELETE /clients/{id}/users/{userId}
Authorization: Bearer <token>
```

**Response — 200 OK:**
```json
{ "deleted": true }
```

**Permission Rules:**

| Role | Access |
|---|---|
| Admin | Can remove any assignment. |
| Account Manager | Cannot remove assignments. Returns `403 FORBIDDEN`. |
| Team Member | Cannot remove assignments. Returns `403 FORBIDDEN`. |

---

## 6. Cross-Cutting Functional Requirements

### 6.1 Permission Enforcement Pattern

All endpoints must use the same pattern from Feature 07 middleware:

1. Extract and validate Bearer token (JWKS validation).
2. Resolve `auth_user_id` (from token `sub`) to product `user_id` and `role`.
3. For client-scoped endpoints, verify the user has access to the requested `client_id` (via `client_users` join table or Admin bypass).
4. Deny with `404 CLIENT_NOT_FOUND` for inaccessible clients (not `403`, to avoid existence leakage).
5. Deny with `403 FORBIDDEN` for valid clients where the operation exceeds the user's role.

### 6.2 Response Consistency

All successful responses use `200 OK`. No `201 Created` or `204 No Content` is used — PATCH returns the updated record.

### 6.3 Content Type

All requests with a body must use `Content-Type: application/json`. Requests with unexpected content types return `415 Unsupported Media Type`.

### 6.4 `updated_at` Handling

The `updated_at` field on the `clients` table is managed exclusively by the API on PATCH. It must be set to the current server timestamp (UTC) on every successful write. The database should also have an `ON UPDATE` trigger or equivalent as a backstop.
