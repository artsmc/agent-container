# Feature 27: UI Task Review

## Summary
Build Screen 3 (Task Review) at route `/clients/{client_id}/tasks` with filter bar (status, transcript, assignee), batch action bar (select all, batch approve/reject/assign workspace), and task table with inline-editable columns (short ID, title, assignee, estimated time, scrum stage, workspace, status, actions). Also build Screen 4 (Task Detail) as a slide-over panel with rich text editor, version history, and source transcript link.

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding — Table, SlideOver, InlineEdit, Badge components), 24 (UI auth flow), 22 (api-client)
- **Blocks**: None (leaf feature)

## Source PRDs
- `ui-prd.md` — Screen 3: Task Review, Screen 4: Task Detail, design inspiration for tasks and review

## Relevant PRD Extracts

### Screen 3: Task Review (ui-prd.md)

**Route:** `/clients/{client_id}/tasks` or `/tasks?transcript={transcript_id}`

The primary task management screen. Used after an intake workflow to review, edit, and approve generated tasks.

**Layout:**
- **Filter bar** — Filter by status (`draft`, `approved`, `rejected`, `pushed`, `completed`), transcript source, assignee.
- **Batch action bar** — Select all / deselect all, batch approve, batch reject, batch assign workspace. Only visible when tasks are selected.
- **Task table** — Each row displays:

  | Column | Description |
  |---|---|
  | Checkbox | For batch selection |
  | Short ID | `TSK-####` — clickable, opens detail/edit panel |
  | Title | Inline-editable (click to edit) |
  | Assignee | Inline-editable dropdown |
  | Estimated Time | Inline-editable (`hh mm`) |
  | Scrum Stage | Inline-editable dropdown |
  | Asana Workspace | Inline-editable dropdown (shows client default if not overridden) |
  | Status | Badge (`draft`, `approved`, `rejected`, `pushed`) |
  | Actions | Approve / Reject / Push buttons per row |

### Screen 4: Task Detail & Edit Panel (ui-prd.md)

**Route:** `/tasks/{short_id}` (or slide-over panel from task table)

Full detail view for a single task. Accessible by clicking a short ID anywhere in the app.

**Layout:**
- **Header** — Short ID (`TSK-0042`), status badge, client name.
- **Inline editor sections:**
  - **Title** — Click to edit.
  - **Description** — Rich text editor with the structured format:
    - Task Context
    - Additional Context
    - Requirements
  - **Custom fields** — Each field is inline-editable:
    - Assignee (dropdown)
    - Estimated Time (time input)
    - Scrum Stage (dropdown)
    - Asana Workspace (dropdown)
    - Asana Project (dropdown, filtered by selected workspace)
- **Version history sidebar** — Collapsible panel showing all edits: who changed what, when, and from which source (agent, UI, terminal).
- **Source transcript link** — Link back to the transcript that generated this task, with relevant quotes highlighted.
- **Action buttons** — Approve, Reject, Push to Asana. Contextual based on current status.

### Task Design Inspiration (ui-prd.md)

| File | Key Takeaways |
|---|---|
| `task/image.png` | Priority-grouped task list. Clean card-style rows. Grouping by meaningful dimension (we group by status). Minimal sidebar navigation. |
| `task/image copy.png` | **Closest match to Task Review screen.** Data table with columns: Task Name, Description, Milestone, Estimation, Members, Priority, Actions. Collapsible sections. Inline data. Search bar and filter/view toggle. |
| `review/image copy.png` | Kanban + detail panel. Right-side detail panel with checklist, description, labels, and action buttons. Replace "Complete" with "Approve / Reject / Push to Asana". |

### API Endpoints Used
- `GET /clients/{id}/tasks` — List tasks (filterable by `status`, `transcript_id`)
- `GET /tasks/{id}` — Get specific task with version history (accepts short ID)
- `PATCH /tasks/{id}` — Edit a draft task (description, assignee, estimated time, routing)
- `POST /tasks/{id}/approve` — Approve a single task
- `POST /tasks/{id}/reject` — Reject a task
- `POST /tasks/{id}/push` — Push an approved task to Asana
- `POST /clients/{id}/tasks/approve` — Batch approve tasks (body: list of short IDs or UUIDs)
- `POST /clients/{id}/tasks/push` — Batch push approved tasks
- `GET /asana/workspaces` — List workspaces for dropdown
- `GET /clients/{id}/transcripts` — List transcripts for filter dropdown

### Permission Model (api-prd.md)

| Role | Task Capabilities |
|---|---|
| **Admin** | Everything |
| **Account Manager** | Full CRUD on assigned clients. Approve tasks, push to Asana. |
| **Team Member** | Read access. Cannot approve or push. |

### Task Routing Logic (api-prd.md)
1. Check task-level override (`asana_workspace_id` on the task).
2. Fall back to client default (`default_asana_workspace_id` on the client).
3. If neither is set, reject the push with `WORKSPACE_NOT_CONFIGURED` error.

## Scope

### In Scope
- Task review page at route `/clients/{client_id}/tasks` within DashboardLayout
- Filter bar component:
  - Status filter dropdown (`draft`, `approved`, `rejected`, `pushed`)
  - Transcript source filter dropdown
  - Assignee filter dropdown
- Batch action bar component (visible when tasks are selected):
  - Select all / deselect all toggle
  - Batch approve button
  - Batch reject button
  - Batch assign workspace dropdown
- Task table component with columns:
  - Checkbox (batch selection)
  - Short ID (`TSK-####`) — clickable, opens slide-over panel
  - Title — inline-editable
  - Assignee — inline-editable dropdown
  - Estimated Time — inline-editable time input
  - Scrum Stage — inline-editable dropdown
  - Asana Workspace — inline-editable dropdown (shows client default if not overridden)
  - Status — badge
  - Actions — Approve / Reject / Push buttons (contextual based on status and user role)
- Task detail slide-over panel (Screen 4):
  - Header with short ID, status badge, client name
  - Rich text editor for description (Task Context, Additional Context, Requirements sections)
  - Inline-editable custom fields (assignee, estimated time, scrum stage, workspace, project)
  - Version history sidebar (collapsible) showing edit history with source (agent/ui/terminal)
  - Source transcript link
  - Action buttons: Approve, Reject, Push to Asana
- Inline edit saves via `PATCH /tasks/{id}`
- Role-based action visibility (team members cannot see approve/push buttons)

### Out of Scope
- Asana push execution logic (that is the API layer, feature 12)
- Task creation (tasks are created by Mastra via workflow, feature 19)
- Workflow triggering (feature 30)
- Drag-and-drop reordering
- Real-time multi-user editing of tasks

## Key Decisions
- The task detail (Screen 4) is implemented as a **slide-over panel** that opens from the task table, not a separate page. This follows the design inspiration pattern — users stay in context while viewing/editing task details.
- Inline editing in the task table saves immediately via `PATCH /tasks/{id}` — no separate "save" button for individual field changes.
- The batch action bar only appears when one or more tasks are selected via checkboxes.
- Action buttons (Approve/Reject/Push) are contextual — they show/hide based on task status (e.g., Push only shows for approved tasks) and user role (team members cannot approve or push).
- The Asana Workspace dropdown shows the client default as a placeholder/hint when the task has no override, making it clear what workspace the task will route to.
- Version history in the slide-over shows the edit source (agent, UI, terminal) so users can see the provenance of each change, matching the cross-platform short ID workflow.
