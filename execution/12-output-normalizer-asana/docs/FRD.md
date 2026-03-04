# Feature Requirement Document
# Feature 12: output-normalizer-asana

## 1. Business Objective

The iExcel automation system generates structured tasks from call transcripts and delivers them to Asana — the primary project management tool used by the iExcel team. Once a task has been reviewed and approved by an account manager, it must be pushed to the correct Asana workspace and project with the correct field values, so that team members can pick up and execute the work without needing to context-switch to any other tool.

This feature delivers the **Asana output normalizer** — a module inside the API layer that accepts a `NormalizedTask` (the internal representation of an approved task), translates it into Asana's REST API format, creates the task in Asana, and writes the resulting Asana task reference back to the product database record.

Without this normalizer:
- The API's task push endpoint (`POST /tasks/{id}/push`) would have no mechanism to deliver tasks to Asana.
- Custom field values (Client, Scrum Stage, Estimated Time) would not be populated, degrading the iExcel team's visibility in Asana boards.
- Workspace routing would be undefined — tasks could silently target the wrong project or fail with opaque errors.
- Replacing Asana with another PM tool in the future would require invasive changes across the API layer rather than a single adapter swap.

The normalizer enforces a clean boundary: anything upstream deals with the internal `NormalizedTask` shape; anything downstream (Asana) deals only with Asana's own API format. The adapter interface is designed for pluggability so that future adapters (Jira, Linear, Monday.com) can slot in without changing the push endpoint.

---

## 2. Target Users

| User | Role | Interaction |
|---|---|---|
| Account Manager | Trigger | Clicks "Push to Asana" in the UI or uses the terminal to push an approved task; sees the resulting Asana task link in the system |
| iExcel Team Members | Downstream consumer | Receives Asana tasks created by this adapter and executes the work |
| API layer (internal) | Direct caller | The `POST /tasks/{id}/push` and `POST /clients/{id}/tasks/push` handlers invoke this adapter after confirming task status is `approved` |
| Feature 13 (status-reconciliation) | Downstream consumer | Reads the `external_ref` written by this adapter to locate the task in Asana and sync its completion status back |
| Future output adapters | Parallel implementations | Jira, Linear, and other PM tool adapters will implement the same `OutputAdapter` interface established here |

---

## 3. User Problems Solved

**Problem 1 — Manual task entry into Asana:**
Before this system, the iExcel account manager built Asana tasks manually after each intake call, copying information from call notes and ChatGPT outputs. This feature eliminates that manual step entirely: approved tasks are pushed directly to Asana via API with all fields pre-populated.

**Problem 2 — Inconsistent Asana field population:**
Manual task entry led to missing or inconsistent custom field values (Client not set, Scrum Stage blank, Estimated Time missing). The normalizer guarantees that every pushed task has all three custom fields populated correctly using the GID-based mapping that Asana requires.

**Problem 3 — Workspace routing errors:**
Tasks needed to land in the correct Asana workspace and project for the corresponding client. The routing logic in this adapter (task-level override then client default then reject) makes this deterministic and auditable.

**Problem 4 — No record of what was pushed:**
Without the `external_ref` write-back, the system would have no way to link a product database task to its Asana counterpart for status reconciliation (feature 13) or for generating direct Asana links in the UI.

**Problem 5 — Adapter lock-in:**
The V1 system uses Asana. The V1 adapter establishes the `OutputAdapter` interface contract so that future PM tool integrations are isolated swaps, not rewrites.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Push success rate for valid approved tasks | 100% — every approved task with a configured workspace reaches Asana |
| Custom field population rate | 100% — Client, Scrum Stage, and Estimated Time fields are populated on every pushed task |
| `external_ref` write-back reliability | 100% — every successfully pushed task has its `external_ref` JSONB written to the database before the push endpoint returns |
| `WORKSPACE_NOT_CONFIGURED` error rate | 0% for clients with a configured `default_asana_workspace_id`; expected and correct for misconfigured clients |
| Asana API retry success on rate-limit | Retry with exponential back-off recovers within 3 attempts for transient 429 and 5xx responses |
| Batch push partial failure reporting | Per-task success/failure detail returned; no silent partial failures |
| Assignee resolution accuracy | 100% lookup success for team members whose name or email is registered in the Asana workspace |

---

## 5. Business Constraints

- **V1 is Asana only.** Jira, Linear, and Monday.com adapters are out of scope. The `OutputAdapter` interface must be designed for them, but they are not implemented.
- **Asana does not support batch task creation.** Each task is created via an individual `POST /tasks` call. Batch push from feature 11 iterates and calls this adapter once per task.
- **Custom fields are mapped by GID, not name.** Asana custom field identifiers are globally unique IDs, not human-readable names. The system must maintain a per-workspace mapping of logical names (Client, Scrum Stage, Estimated Time) to their GIDs. This mapping is configured during workspace setup, not at push time.
- **Workspace Premium requirement.** Asana workspace-wide search requires a Premium plan and is not used. Validation of workspace access is done by querying by project.
- **No credential management in this feature.** Asana API tokens are stored via workspace configuration (already established). This adapter reads the token reference; it does not manage the credential lifecycle.
- **Module boundary.** The normalizer lives inside `apps/api/` as a module, not a separate service. It is invoked synchronously by the push endpoint handler.
- **Description format is the 3-section template.** The Asana `notes` field must receive the exact template format (TASK CONTEXT / ADDITIONAL CONTEXT / REQUIREMENTS) as defined in `asana-task-build.md`. The adapter converts the internal description field to this formatted text.

---

## 6. Integration With Product Roadmap

| Position | Feature | Relationship |
|---|---|---|
| Prerequisite | 01 (shared-types-package) | Defines `NormalizedTask`, `AsanaExternalRef`, `OutputAdapter` interface, and `ApiErrorCode` types consumed by this feature |
| Prerequisite | 07 (api-scaffolding) | Provides the API application, HTTP client infrastructure, error handling patterns, and structured logging that this module uses |
| Prerequisite | 11 (task-endpoints) | The `POST /tasks/{id}/push` and `POST /clients/{id}/tasks/push` handlers call this adapter; feature 11 owns the push endpoint logic and invokes this module |
| Blocks | 13 (status-reconciliation) | Feature 13 reads `external_ref.taskId` (the Asana task GID) from every pushed task to check completion status; it cannot function without the data this feature writes |
| Blocks | 38 (historical-import) | Historical import uses this adapter's interface to push imported tasks to Asana |
| Future parallel | 15 (google-docs-adapter) | Follows the same isolated adapter pattern established here |
| Future parallel | Jira/Linear adapters | Will implement the `OutputAdapter` interface established in this feature |
