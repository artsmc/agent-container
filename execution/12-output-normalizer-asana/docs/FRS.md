# Functional Requirement Specification
# Feature 12: output-normalizer-asana

## 1. Overview

The Asana output normalizer is a module inside the API layer that accepts a `NormalizedTask` and produces a created Asana task, writing the resulting `external_ref` JSONB back to the product database task record. It is invoked by the task push endpoint (feature 11) after the endpoint has confirmed task status is `approved`.

The adapter has two responsibilities: **field mapping** (translating internal fields to Asana API format) and **task creation** (calling the Asana REST API and handling the response). It does not own the push endpoint, workspace configuration endpoints, or status reconciliation — those are features 11, 07/API-config, and 13 respectively.

---

## 2. Adapter Interface Contract

### FR-01: OutputAdapter Interface

The Asana output normalizer must implement the `OutputAdapter` interface defined in `@iexcel/shared-types`. This interface is the contract that future adapters (Jira, Linear) will also implement, enabling the push endpoint to swap adapters without changing its own logic.

```typescript
interface OutputAdapter {
  push(task: NormalizedTask, context: AdapterContext): Promise<ExternalRef>;
}
```

Where:

| Type | Description |
|---|---|
| `NormalizedTask` | The internal task representation passed in by feature 11 |
| `AdapterContext` | Workspace GID, project GID, and resolved Asana access token |
| `ExternalRef` | The result written back to the database on success |

The adapter must not throw generic errors. All error cases must use typed error classes with codes from `ApiErrorCode` in `@iexcel/shared-types`.

### FR-02: NormalizedTask Input Fields

The adapter receives a `NormalizedTask` with the following fields relevant to Asana push:

| Field | Type | Required | Asana Mapping |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Used for logging and `external_ref` correlation |
| `shortId` | `string` | Yes | Used for logging |
| `title` | `string` | Yes | Asana `name` |
| `description` | `string` | Yes | Asana `notes` (formatted via 3-section template) |
| `assignee` | `string \| null` | No | Asana `assignee` GID (resolved via lookup) |
| `estimatedTime` | `string` | Yes | Asana custom field — Estimated Time (by GID) |
| `scrumStage` | `string` | Yes | Asana custom field — Scrum Stage enum (by GID) |
| `clientName` | `string` | Yes | Asana custom field — Client (by GID) |
| `asanaWorkspaceId` | `string \| null` | No | Overrides client default if set |
| `asanaProjectId` | `string \| null` | No | Overrides client default if set |
| `clientId` | `string` | Yes | Used to resolve client default workspace/project if task-level override is absent |

---

## 3. Workspace Routing

### FR-10: Workspace Resolution Cascade

Before constructing the Asana API payload, the adapter must resolve the target workspace and project:

1. Check `NormalizedTask.asanaWorkspaceId` and `NormalizedTask.asanaProjectId`. If both are set, use them.
2. If either is null, look up the client record using `NormalizedTask.clientId` and read `client.default_asana_workspace_id` and `client.default_asana_project_id`.
3. If the resolved workspace GID is still null after both checks, throw an `AdapterError` with code `WORKSPACE_NOT_CONFIGURED` and HTTP status 422.

### FR-11: WORKSPACE_NOT_CONFIGURED Error Shape

When workspace resolution fails, the error must include:

```json
{
  "error": {
    "code": "WORKSPACE_NOT_CONFIGURED",
    "message": "No Asana workspace configured for this task or client.",
    "details": {
      "taskId": "<task UUID>",
      "clientId": "<client UUID>"
    }
  }
}
```

The adapter throws this error. The push endpoint handler formats it into the API response envelope.

### FR-12: AdapterContext Construction

Once workspace and project GIDs are resolved, the adapter constructs an `AdapterContext` containing:

| Field | Source |
|---|---|
| `workspaceGid` | Resolved per FR-10 |
| `projectGid` | Resolved per FR-10 |
| `accessToken` | Retrieved from `AsanaWorkspaces` table via `workspaceGid` → `access_token_ref` |
| `customFieldGids` | Retrieved from per-workspace custom field GID configuration (see FR-30) |

---

## 4. Field Mapping

### FR-20: Title Mapping

`NormalizedTask.title` maps directly to the Asana `name` field. No transformation is applied. The value must be a non-empty string. If `title` is empty, the adapter must throw a `VALIDATION_ERROR` before calling the Asana API.

### FR-21: Description Mapping — 3-Section Template

`NormalizedTask.description` maps to the Asana `notes` field. The adapter must format the description as the 3-section plain-text template:

```
TASK CONTEXT
- <content of the Task Context section>

ADDITIONAL CONTEXT
- <content of the Additional Context section>

REQUIREMENTS
- <content of the Requirements section>
```

**Section detection:** The internal `description` field stores structured text that already uses the 3-section format (written by the Mastra intake agent, feature 19). The adapter must detect and extract the three sections using the section headers `**TASK CONTEXT**`, `**ADDITIONAL CONTEXT**`, and `**REQUIREMENTS**` as delimiters.

If the description does not contain all three section markers, the adapter must fall back to writing the entire description text as the `notes` value without reformatting it. This fallback must not throw an error — it is a degraded but valid state.

The formatted `notes` value must be plain text (not Markdown). Asana's API accepts plain text in the `notes` field. Bold markers (`**`) must be stripped before sending.

### FR-22: Assignee Mapping

If `NormalizedTask.assignee` is non-null, the adapter must resolve the assignee name to an Asana user GID before creating the task:

1. Look up the team member by name in the `asana_workspace_members` cache (see FR-40).
2. If found, include `assignee: { gid: "<user_gid>" }` in the Asana API payload.
3. If not found, log a warning and omit the `assignee` field from the payload. The task is still created without an assignee — this is not a fatal error.

### FR-23: Custom Field Mapping — Client

The `clientName` field maps to the Asana custom field identified by the `client_field_gid` in the workspace's custom field GID configuration.

- The value is set as an **enum option** (Asana custom field type: enum). The enum option GID must be looked up by display name against the workspace's custom field options.
- If the client name does not match any enum option, log a warning and omit this field from the payload (non-fatal).
- This lookup uses the custom field enum options cache (see FR-31).

### FR-24: Custom Field Mapping — Scrum Stage

The `scrumStage` field maps to the Asana custom field identified by the `scrum_stage_field_gid` in the workspace's custom field GID configuration.

- Default value when `scrumStage` is not set: `"Backlog"`.
- The value is set as an **enum option** by display name → GID lookup (same mechanism as FR-23).
- If the display name does not match any enum option, default to `"Backlog"` and log a warning.

### FR-25: Custom Field Mapping — Estimated Time

The `estimatedTime` field maps to the Asana custom field identified by the `estimated_time_field_gid` in the workspace's custom field GID configuration.

- `estimatedTime` is stored internally as a PostgreSQL `INTERVAL` and delivered to the adapter as a string in `hh:mm` format (e.g., `"02:30"`).
- The adapter must convert this to the display format expected by Asana: `"2h 30m"` (or as configured per workspace — see FR-33).
- The value is set as a **text custom field** value (not an enum).
- If `estimatedTime` is null or unparseable, omit the field from the payload (non-fatal).

### FR-26: Project Membership

The task must be created with membership in the resolved project. Include in the Asana `POST /tasks` payload:

```json
{
  "projects": ["<projectGid>"]
}
```

This sets the project membership at creation time rather than requiring a separate `POST /tasks/{gid}/addProject` call.

---

## 5. Custom Field GID Configuration

### FR-30: Per-Workspace GID Configuration Store

Custom field GIDs are specific to each Asana workspace. The system must store a mapping of logical field names to Asana GIDs for each configured workspace. This configuration is established during workspace setup (outside the scope of this feature) and consumed read-only by this adapter.

The configuration record for a workspace must contain:

| Logical Name | Config Key | Asana Field Type |
|---|---|---|
| Client | `client_field_gid` | Enum |
| Scrum Stage | `scrum_stage_field_gid` | Enum |
| Estimated Time | `estimated_time_field_gid` | Text |

This configuration is stored in the `asana_workspace_config` JSONB column on the `AsanaWorkspaces` table (or equivalent — see TR.md for the exact schema extension).

### FR-31: Enum Option Caching

For enum-type custom fields (Client, Scrum Stage), the adapter must resolve display name → enum option GID at push time. To avoid per-push API calls to fetch field metadata, the adapter must maintain a short-lived in-memory cache (TTL: 5 minutes) of enum options per workspace per field.

Cache population: on first push to a workspace after server start (or after TTL expiry), the adapter fetches the custom field definition via `GET /custom_fields/{gid}` and caches the enum options array.

### FR-32: GID Configuration Validation

On adapter initialization (module load), the adapter must validate that all three required GID config keys are present for any workspace it is about to push to. If a required GID is missing, the adapter must throw `WORKSPACE_NOT_CONFIGURED` (not `PUSH_FAILED`) before calling the Asana API.

### FR-33: Estimated Time Format Configuration

The display format for the Estimated Time custom field value is configurable per workspace (some workspaces may use `"2h 30m"`, others may use `"2:30"`). The workspace config record must include an `estimated_time_format` key (`"h_m"` or `"hh_mm"`). Default: `"h_m"`.

---

## 6. Asana API Integration

### FR-40: Workspace Members Cache

To resolve assignee names to Asana user GIDs without making a per-push API call, the adapter must maintain an in-memory cache of workspace members (TTL: 15 minutes).

Cache population: on first push to a workspace after server start (or TTL expiry), the adapter fetches `GET /workspaces/{workspace_gid}/users` and stores the `{ name, email, gid }` array.

Lookup: first attempt exact name match (`NormalizedTask.assignee === member.name`), then case-insensitive name match, then email match.

### FR-41: Task Creation API Call

The adapter creates an Asana task via:

```
POST https://app.asana.com/api/1.0/tasks
```

Request headers:
```
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json
```

Request body (all resolved fields):
```json
{
  "data": {
    "workspace": "<workspaceGid>",
    "projects": ["<projectGid>"],
    "name": "<title>",
    "notes": "<formatted_description>",
    "assignee": "<assignee_gid_or_omitted>",
    "custom_fields": {
      "<client_field_gid>": "<client_enum_option_gid>",
      "<scrum_stage_field_gid>": "<scrum_stage_enum_option_gid>",
      "<estimated_time_field_gid>": "<estimated_time_string>"
    }
  }
}
```

Custom fields must be omitted individually (not set to null) if their value could not be resolved (see FR-23, FR-24, FR-25).

### FR-42: Successful Response Handling

On HTTP 201 from Asana, the adapter must:

1. Extract from the response: `data.gid` (Asana task GID), `data.permalink_url` (public task URL).
2. Construct the `ExternalRef` object:
   ```typescript
   {
     system: "asana",
     externalId: data.gid,
     externalUrl: data.permalink_url,
     workspaceId: resolvedWorkspaceGid,
     projectId: resolvedProjectGid
   }
   ```
3. Return the `ExternalRef` to the caller (feature 11's push handler), which writes it to `tasks.external_ref` and sets `tasks.status = "pushed"` and `tasks.pushed_at = NOW()`.

The adapter itself does not write to the database. It returns the `ExternalRef` and lets the push handler own the database write.

### FR-43: Asana API Error Handling

| Asana HTTP Status | Adapter Response |
|---|---|
| 400 Bad Request | Throw `AdapterError` with code `PUSH_FAILED` (502), include Asana error body in `details` |
| 401 Unauthorized | Throw `AdapterError` with code `PUSH_FAILED` (502), message "Asana access token is invalid or expired" |
| 403 Forbidden | Throw `AdapterError` with code `PUSH_FAILED` (502), message "Asana access denied to workspace or project" |
| 404 Not Found | Throw `AdapterError` with code `PUSH_FAILED` (502), message "Asana workspace or project GID not found" |
| 429 Too Many Requests | Retry with exponential back-off (see FR-44) |
| 500 / 503 | Retry with exponential back-off (see FR-44) |
| Other 4xx | Throw `AdapterError` with code `PUSH_FAILED` (502), include status and Asana error body |

### FR-44: Retry Logic for Transient Failures

For 429 (rate limited) and 5xx (server error) responses, the adapter must retry:

- Maximum retries: 3 attempts (initial attempt + 2 retries).
- Back-off strategy: exponential with jitter. Wait times: ~1s, ~2s, ~4s (with ±20% jitter).
- For 429 responses: honour the `Retry-After` header if present, using it as the minimum wait before the first retry.
- After exhausting retries: throw `AdapterError` with code `PUSH_FAILED` (502) and a message indicating the retry count was exceeded.

### FR-45: Timeout

The Asana API HTTP call must time out after 10 seconds. On timeout, throw `AdapterError` with code `PUSH_FAILED` (502) and message "Asana API request timed out".

---

## 7. Batch Push Behaviour

### FR-50: Per-Task Isolation

When the push endpoint calls this adapter as part of a batch (`POST /clients/{id}/tasks/push`), each task is pushed independently. A failure on one task must not abort the remaining tasks in the batch.

The adapter itself handles a single task per invocation. Batch iteration is feature 11's responsibility. The adapter must not have any shared mutable state between concurrent invocations.

### FR-51: Partial Failure Propagation

The adapter returns either a resolved `ExternalRef` or throws an `AdapterError`. Feature 11's batch handler collects per-task results and returns them in the batch push response:

```json
{
  "results": [
    { "taskId": "TSK-0042", "status": "pushed", "externalRef": { ... } },
    { "taskId": "TSK-0043", "status": "failed", "error": { "code": "PUSH_FAILED", "message": "..." } }
  ]
}
```

---

## 8. External Reference Write-Back

### FR-60: external_ref Schema

The `external_ref` JSONB field on the `tasks` table stores the result of a successful push. For the Asana adapter, the shape is:

```typescript
interface AsanaExternalRef {
  system: "asana";           // Identifies the external system (aligned to Feature 01 ExternalRef convention)
  externalId: string;        // Asana task GID
  externalUrl: string;       // https://app.asana.com/0/.../...
  workspaceId: string;       // Asana workspace GID
  projectId: string;         // Asana project GID
}
```

This shape is defined in `@iexcel/shared-types` and follows the shared `ExternalRef` naming convention from Feature 01 (`system`, `externalId`, `externalUrl`). Feature 13 (status reconciliation) reads `external_ref->>'externalId'` to locate the task in Asana.

### FR-61: Write Responsibility

The adapter returns the `AsanaExternalRef` object. The push endpoint handler (feature 11) performs the database write:

```sql
UPDATE tasks
SET external_ref = $1, status = 'pushed', pushed_at = NOW()
WHERE id = $2;
```

The adapter must not write directly to the database.

---

## 9. Error Handling Summary

### FR-70: AdapterError Class

The adapter must throw instances of `AdapterError` (not generic `Error`). The class:

```typescript
class AdapterError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, httpStatus: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
```

### FR-71: Error Codes Used by This Module

| Code | HTTP Status | Condition |
|---|---|---|
| `PUSH_FAILED` | 502 | Asana API returned a non-retryable error, retry exhausted, or request timed out |
| `WORKSPACE_NOT_CONFIGURED` | 422 | No workspace GID resolved for the task or client |
| `VALIDATION_ERROR` | 422 | `title` is empty; cannot create a task with no name |

---

## 10. Logging

### FR-80: Structured Log Events

The adapter must emit structured log entries at the following points:

| Event | Level | Fields |
|---|---|---|
| Push attempt started | `info` | `taskId`, `shortId`, `workspaceGid`, `projectGid` |
| Asana API call made | `debug` | `taskId`, `workspaceGid`, `projectGid`, `hasAssignee`, `customFieldCount` |
| Asana API call succeeded | `info` | `taskId`, `asanaTaskGid`, `permalinkUrl` |
| Retry triggered | `warn` | `taskId`, `attempt`, `waitMs`, `asanaStatus` |
| Push failed | `error` | `taskId`, `errorCode`, `asanaStatus`, `asanaErrorBody` (truncated) |
| Assignee not found | `warn` | `taskId`, `assigneeName` |
| Custom field enum not found | `warn` | `taskId`, `fieldName`, `displayName` |

Task descriptions must never appear in log output. The `notes` field value must not be logged at any level.
