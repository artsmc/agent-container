# FRD — Feature Requirement Document
## Feature 27: UI Task Review
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Business Objectives

Feature 27 delivers Screen 3 (Task Review) and Screen 4 (Task Detail) of the iExcel web UI. These two screens together form the primary task approval and editing workflow that gates all task delivery to Asana.

The core problem: after an intake call, the Mastra agent generates tasks automatically. But generated tasks are drafts — they may have incorrect assignees, wrong time estimates, or need content refinement before reaching Asana. Account managers need a fast, structured way to review, edit, approve, and route dozens of tasks per client without resorting to chat-based interactions.

The business goals are:

- **Batch review efficiency** — Review, approve, and push groups of tasks with single actions (batch approve/push) rather than editing each individually.
- **Inline editing** — Correct individual fields (assignee, time estimate, workspace) directly in the task table row without opening a separate edit screen for every field.
- **Role-appropriate controls** — Team members can view tasks but cannot approve or push. The UI enforces this by hiding irrelevant controls, reducing confusion and preventing unauthorized actions.
- **Cross-platform short ID consistency** — `TSK-####` IDs displayed in the UI are the same IDs used in terminal and chat sessions. An account manager told "TSK-0042 needs review" in Slack can find it in the UI instantly.
- **Audit trail via version history** — The Task Detail panel shows who changed what, from which source (agent, UI, terminal), and when — providing the provenance needed to trust AI-generated content.

---

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Account Manager** | Batch review replaces one-by-one editing. Push to Asana from the UI eliminates manual task creation. |
| **Internal Team** | Version history shows where each task came from (agent vs. human edit) — builds trust in the automation |
| **Product** | Task approval rate becomes a measurable KPI — the review screen is where it happens |
| **iExcel System** | Tasks must be approved before pushing to Asana. This screen is the approval gate that ensures only reviewed content reaches the client's PM tool. |

---

## 3. Target Users

| User | Access Level | Actions on This Screen |
|---|---|---|
| **Account Manager** | Full access | View, filter, inline-edit, approve, reject, push tasks individually and in batch |
| **Internal Team Member** | Read/Edit (no approve/push) | View task details, edit descriptions, add notes — cannot approve or push to Asana |
| **Admin** | Full access | All account manager capabilities |

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Task table renders with all columns for a client | Pass |
| Filter bar correctly filters the task list by status, transcript, and assignee | Pass |
| Batch action bar appears only when tasks are selected | Pass |
| Inline edit saves via `PATCH /tasks/{id}` without full page reload | Pass |
| Task detail slide-over opens on Short ID click | Pass |
| Approve / Reject / Push buttons are hidden for Team Member role | Pass |
| Batch approve fires `POST /clients/{id}/tasks/approve` with selected IDs | Pass |
| Version history panel shows edits with source (agent/UI/terminal) | Pass |
| Source transcript link is present in the task detail panel | Pass |
| Role-based action visibility enforced client-side | Pass |

---

## 5. Business Constraints

- **No task creation.** Tasks are created by Mastra via the intake workflow (feature 19). No "New Task" button exists on this screen.
- **No workflow triggering.** Triggering a new intake workflow is feature 30.
- **No drag-and-drop reordering.** V1 uses status-based grouping; manual reordering is a V2 consideration.
- **No real-time multi-user task editing.** Task editing is single-user in V1. Optimistic concurrency conflicts are handled by the API (last-write-wins with version history).
- **No Asana push logic in the UI.** The push action calls `POST /tasks/{id}/push` on the API. The UI does not talk to Asana directly (feature 12 handles the API-side push).
- **No Tailwind, no shadcn.** All styling via SCSS modules and `@iexcel/ui-tokens`.

---

## 6. Dependencies

### Blocked By

| Feature | Reason |
|---|---|
| 23 — ui-scaffolding | `Table`, `TableRow`, `SlideOver`, `InlineEdit`, `Badge` stubs must exist |
| 24 — ui-auth-flow | Authentication and role data must be available (role controls action visibility) |
| 22 — api-client-package | `@iexcel/api-client` must be available for all task API calls |
| 25 — ui-dashboard | Dashboard exists; feature 27 is accessible from the Client Detail Tasks tab |

### Blocks

| Feature | Reason |
|---|---|
| None | Leaf feature — nothing in the current roadmap depends on feature 27 |

---

## 7. Integration with Product Roadmap

Feature 27 is in Phase 3 Consumers, Wave 5. It is accessible from two entry points: the Client Detail page Tasks tab (feature 26) and the Dashboard pending approvals panel (feature 25). It is a leaf node — no feature depends on it.

The `TSK-####` short ID system bridges the UI with the terminal (feature 33) and chat. The version history feature (showing agent/UI/terminal sources) directly supports the multi-interface short ID workflow described in `ui-prd.md` and `terminal-prd.md`.

---

## 8. Open Questions

| Question | Impact on Feature 27 |
|---|---|
| What are the valid Scrum Stage values? | The inline dropdown must enumerate the exact values from `shared-types`. Confirm before building the Scrum Stage dropdown. |
| Can a task be pushed directly from `draft` status, or must it be `approved` first? | The Push button visibility rule depends on this. Assumed: Push only available for `approved` tasks. Confirm with api-prd. |
| Batch reject — does it require a rejection reason, or is it a simple status change? | If a rejection reason is required, the batch reject button must open a modal for the reason. Assume no reason required in V1. |
| Does `GET /clients/{id}/tasks` support pagination? | If the client has hundreds of tasks, pagination or infinite scroll must be planned. Assume server-side pagination with `limit`/`offset` params. |
