# Web UI — Product Requirements Document

## Overview

A web application that serves as the human interaction layer between iExcel's team and their clients. The UI talks exclusively to the [API layer](./api-prd.md) — it does not communicate with [Mastra](./mastra-prd.md), the [database](./database-prd.md), or external services directly. It provides approval workflows, collaborative editing, multi-account routing, and shareable links — things that don't belong in an agent pipeline or a terminal session.

## Problem Statement

The Mastra agent can generate tasks and agendas, but several steps require human judgment before output reaches external systems:

- Tasks need review and approval before going to Asana.
- Tasks may need to route to different Asana workspaces/accounts.
- Agendas need internal team review and editing before being shared with clients.
- Clients need a way to view documents without logging into internal tools.
- Documents need to be distributed via email.

Without a UI, these interactions get forced into chat sessions or manual copy-paste — defeating the purpose of automation.

---

## Users

| User | Access Level | Primary Actions |
|---|---|---|
| **Account Manager** | Full access | Trigger workflows, review/approve tasks, edit agendas, manage routing, send emails |
| **Internal Team** | Edit access | Collaborate on agendas, view task details, add notes |
| **Client** | Read-only | View shared agendas and Running Notes via public link |

---

## Short IDs

All tasks and agendas use human-readable **short IDs** throughout the UI:

- Tasks: `TSK-0001`, `TSK-0002`, etc.
- Agendas: `AGD-0001`, `AGD-0002`, etc.

Short IDs are displayed prominently in every list, detail view, and notification. They are the same IDs used in terminal/chat interactions (see [`terminal-prd.md`](./terminal-prd.md)), so an account manager can reference `TSK-0042` in a chat and then find the same task in the UI instantly.

---

## Screens

### Screen 1: Dashboard (Home)

**Route:** `/`

The landing page for authenticated users. Provides an at-a-glance overview of all client activity.

**Layout:**
- **Client cards** — Grid of active clients, each showing:
  - Client name
  - Pending draft tasks count (badge)
  - Current agenda status (`draft`, `in_review`, `finalized`, `shared`)
  - Next scheduled call date (if known)
  - Quick-action buttons: "View Tasks", "View Agenda"
- **Pending approvals panel** — Aggregated list of all draft tasks across clients awaiting review. Each row shows short ID, title, client, and estimated time. Clicking navigates to the task review screen.
- **Recent activity feed** — Chronological log of recent actions: tasks approved, agendas shared, emails sent, workflows triggered. Each entry shows who, what, and when.

### Screen 2: Client Detail

**Route:** `/clients/{client_id}`

Everything related to a single client in one place.

**Layout:**
- **Header** — Client name, default Asana workspace, Grain playlist link.
- **Tabs:**
  - **Tasks** — Filtered task list for this client (see Screen 3).
  - **Agendas** — List of all agendas/Running Notes for this client (see Screen 5).
  - **Transcripts** — List of ingested transcripts with call dates and processing status.
  - **Settings** — Client config: default Asana workspace, default Asana project, email recipient list, routing rules.
  - **History** — Imported historical records (if client was reactivated). Read-only.

### Screen 3: Task Review

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

### Screen 4: Task Detail & Edit Panel

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

### Screen 5: Agenda List

**Route:** `/clients/{client_id}/agendas`

All agendas/Running Notes for a client, ordered by cycle date.

**Layout:**
- **Agenda cards** — Each card shows:
  - Short ID (`AGD-####`)
  - Cycle dates (start → end)
  - Status badge (`draft`, `in_review`, `finalized`, `shared`)
  - Last edited by and when
  - Quick actions: Edit, Finalize, Share, Email

### Screen 6: Agenda Editor

**Route:** `/agendas/{short_id}`

The primary agenda review and editing screen. Used before a follow-up call to finalize the Running Notes.

**Layout:**
- **Header** — Short ID (`AGD-0015`), client name, cycle dates, status badge.
- **Rich text editor** — Full content editor for the Running Notes. Sections:
  - Completed Tasks
  - Incomplete Tasks
  - Relevant Deliverables
  - Recommendations
  - New Ideas
  - Next Steps
- **Collaborative editing** — Real-time multi-user editing. Cursor presence indicators showing who else is viewing/editing.
- **Internal comments** — Annotation sidebar. Team members can leave notes that don't appear in the shared version. Threaded replies.
- **Version history** — Collapsible panel showing all edits with diff view.
- **Action bar:**
  - **Finalize** — Lock editing, mark as ready to share.
  - **Share** — Generate shareable URLs:
    - Client-facing (read-only, no auth)
    - Internal (edit-enabled, auth required)
  - **Email** — Send to recipients. Pre-filled from client config, editable before send.
  - **Export** — Push to Google Docs or download as PDF.

### Screen 7: Shared Agenda (Client View)

**Route:** `/shared/{token}`

Public, read-only view of a finalized agenda. No login required.

**Layout:**
- **Clean, branded view** — iExcel branding. No editing controls, no internal comments visible.
- **Content** — The finalized Running Notes in a readable format.
- **Print / PDF** — Option to print or save as PDF.

### Screen 8: Workflow Trigger

**Route:** `/workflows/new`

Screen for manually triggering a workflow.

**Layout:**
- **Workflow selector** — Choose "Intake → Tasks" or "Completed Tasks → Agenda".
- **Client selector** — Choose which client this workflow is for.
- **Intake workflow inputs:**
  - Transcript source: paste text, upload file, or select from Grain.
  - Call date.
- **Agenda workflow inputs:**
  - Cycle date range (auto-suggested based on last agenda).
- **Progress indicator** — After triggering, show real-time status as the Mastra agent processes. Transition to the task review or agenda editor screen when complete.

### Screen 9: Admin / Settings

**Route:** `/settings`

System-level configuration. Admin and account manager access.

**Tabs:**
- **Asana Workspaces** — Add, remove, test connections to Asana workspaces.
- **Users & Roles** — Manage team members, assign roles, assign client access.
- **Email Config** — Default sender, email templates, delivery settings.
- **Audit Log** — Searchable log of all system actions. Filterable by user, entity, action type, date range.

---

## Relationship to the System

The UI is a **consumer** of the [API layer](./api-prd.md). It does not contain business logic, does not talk to Mastra agents, and does not connect to external services or the database.

```
┌──────────────────────────────────────────────────────────┐
│                      WEB UI                               │
│  - Task approval        - Agenda editing                  │
│  - Multi-account routing - Sharing & email                │
│  - Dashboard             - Client read-only views         │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │  REST API calls
                       ▼
              ┌────────────────┐
              │   API LAYER    │  ← owns business logic,
              │ (api-prd.md)   │    external services,
              │                │    database access
              └────────────────┘
```

**Key principle:** The UI reads data from the API, displays it, allows edits, and tells the API to execute actions (approve tasks, push to Asana, share agenda, send email). The UI never talks to Asana, Google Docs, Mastra, or Postgres directly.

---

## Authentication

Authentication is handled by the [Auth Service](./auth-prd.md) via OIDC. The UI is a registered OIDC client (`iexcel-ui`).

- **Internal users (account managers, team):** OIDC **Authorization Code Flow**. User clicks "Login" → redirected to auth service → IdP authentication (Google/Okta SSO) → redirected back with tokens. SSO session means logging into any iExcel app logs you into all of them.
- **Clients (read-only links):** Token-based access embedded in the URL. No login required. Token scoped to a specific document and client. Served via the API's `/shared/{token}` endpoint. Expiry configurable. These links bypass OIDC — they are not user sessions.

### Related PRDs

| Layer | PRD | Relationship |
|---|---|---|
| **Auth** | [`auth-prd.md`](./auth-prd.md) | Handles all login flows. UI is OIDC client `iexcel-ui`. |
| **API** | [`api-prd.md`](./api-prd.md) | The UI's only backend — all calls go here |
| **Database** | [`database-prd.md`](./database-prd.md) | Where UI data comes from (via the API) |
| **Mastra** | [`mastra-prd.md`](./mastra-prd.md) | Agent layer — UI triggers workflows through the API, not directly |
| **Terminal** | [`terminal-prd.md`](./terminal-prd.md) | Peer consumer — same API, different interface |

---

## Design Inspiration

Reference designs are stored in `ui/inspiration/` and mapped to screens below. These capture the visual direction, interaction patterns, and layout ideas — not literal implementations.

### Dashboard (`ui/inspiration/dashboard/`)

| File | What to take from it |
|---|---|
| `image.png` | **Kanban-style task board with slide-over detail panel.** Shows a left nav + grouped task list (ToDo / In Progress / Completed) with a detail panel on the right. Key takeaway: the slide-over detail panel pattern — clicking a task opens a rich sidebar with description, checklist, attachments, labels, and assignee avatars without leaving the list view. Apply this to our task detail panel (Screen 4). |
| `image copy.png` | **AI-powered meeting notes with chat sidebar.** Two-panel layout: conversational AI chat on the left, structured meeting document on the right. Key takeaways: (1) The chat + document split-view could inspire how we show the Mastra agent's output alongside the generated content. (2) Summarized Notes with sections (Key Topics, Decisions Made, Pending Actions) maps directly to our Running Notes format. (3) Action items rendered as a table with assignee and date at the bottom. (4) Quick-action chip buttons ("List action items", "Show pending tasks") for common operations. |
| `image copy 2.png` | **Timeline-based meeting history with action items.** Chronological feed of meetings, each showing attendees (avatar chips), key points, and checkable next actions with "Go to link" references. Key takeaways: (1) The timeline layout is good inspiration for our client history / transcript list view. (2) Checkbox-style action items with cross-references could work for the agenda's "Next Steps" section. (3) Two-column layout with different meetings side-by-side for comparison. |

### Task Management (`ui/inspiration/task/`)

| File | What to take from it |
|---|---|
| `image.png` | **Priority-grouped task list with left nav.** Clean, minimal task list grouped by High / Medium / Low priority. Left sidebar has project navigation with starred projects. Key takeaways: (1) Grouping tasks by a meaningful dimension (we'd group by status: draft / approved / pushed / completed). (2) Clean card-style rows with project label and due date. (3) Minimal sidebar navigation pattern. |
| `image copy.png` | **Data table with collapsible sections.** Full task table with columns: Task Name, Description, Milestone, Estimation, Members, Priority, Actions. Sections collapse (Ongoing Task / Completed Task). Key takeaways: (1) This is the closest match to our Task Review screen (Screen 3). (2) Column layout with inline data aligns with our inline-editable table design. (3) Collapsible sections by status. (4) Member avatars and priority badges per row. (5) Search bar and filter/view toggle (Table / Calendar) at the top. |
| `image copy 2.png` | Same as dashboard `image.png` — Kanban board with detail panel. Reinforces the slide-over pattern for task detail editing. |

### Task Review / Approval (`ui/inspiration/review/`)

| File | What to take from it |
|---|---|
| `image.png` | Same as task `image.png` — Priority-grouped list. For the review context: the grouping pattern works well for separating tasks by approval status (draft / approved / rejected). The clean card rows make scanning and batch selection intuitive. |
| `image copy.png` | Same as dashboard `image.png` — Kanban + detail panel. For the review context: the right-side detail panel with checklist, description, labels, and action buttons (Complete) is directly applicable to our approval flow. Replace "Complete" with "Approve / Reject / Push to Asana" buttons. |

### Agenda (`ui/inspiration/agenda/`)

| File | What to take from it |
|---|---|
| `image.png` | **Numbered agenda builder with drag-and-drop.** Clean, minimal agenda editor with numbered items, drag handles, and a "+ New agenda item" action. Tabbed workflow (Basic data → Agenda → Send). Key takeaways: (1) The numbered, reorderable list is great for our Running Notes sections (Completed Tasks, Incomplete Tasks, Deliverables, Recommendations, New Ideas, Next Steps). (2) The tab flow (edit → review → send) maps to our agenda lifecycle (draft → finalized → shared/emailed). (3) "Proceed to send" CTA aligns with our email distribution action. |
| `image copy.png` | **Client-facing agenda with branded header and PDF export.** Public-facing view with event branding, time-based agenda, attendee photos, and "Download the Agenda as PDF" button. Key takeaway: This is inspiration for our **Shared Agenda / Client View** (Screen 7). Clean, branded, read-only, with a PDF export option. The professional formatting with clear hierarchy is what the client should see. |
| `image copy 2.png` | **Agenda builder with participants and topics.** Create Agenda modal with: date/meeting selector, participant list with roles (Admin/Speaker/Non-Speaker), agenda title, tags, and a right panel showing Topics with talk-time allocation. Key takeaways: (1) Participant management with roles could inspire our attendee/recipient management before sharing. (2) Topic cards with time estimates parallel our task-based agenda items with estimated hours. (3) The "Create Agenda" / "Edit Agenda" / "Delete Agenda" action buttons. |
| `image copy 3.png` | **Compact meeting agenda with checkable items.** Dark-themed card view with: meeting title, attendee info, numbered agenda sections with time estimates and completion checkmarks. Key takeaways: (1) The compact checklist-with-time-estimates format is useful for how agenda items could look in our Dashboard (Screen 1) as summary cards. (2) Time estimates per agenda item. (3) Progress tracking (completed vs. remaining items). |
| `image copy 4.png` | **Structured agenda with sections, checkboxes, and sidebar navigation.** Full app view with: left sidebar (agendas list organized by One-on-Ones / Team Meetings / Discussions), main content area with structured sections (Problem Statement, Goal/Hypothesis, Success, Timeline), each with checkable sub-items and assignee avatars. Bottom action bar with "+ Add Item", "Suggestions", and "Finish Meeting". Key takeaways: (1) **Strongest match for our Agenda Editor (Screen 6).** The structured sections with checkable items and assignee avatars maps almost directly to our Running Notes format. (2) Left sidebar with categorized agenda list. (3) Description block at top for context. (4) "Suggestions" button — could be "AI Suggestions" powered by Mastra for our agenda. (5) "Finish Meeting" → "Finalize Agenda" in our flow. |

### Design Direction Summary

Across all inspiration images, the consistent patterns are:

- **Clean, minimal aesthetic** — White/light backgrounds, generous whitespace, subtle borders.
- **Left sidebar navigation** — Persistent nav for switching between views/clients.
- **Slide-over detail panels** — Click an item in a list to open a rich detail view on the right, without leaving context.
- **Inline-editable tables** — Data presented in structured rows with editable fields.
- **Collapsible grouped sections** — Items grouped by status, priority, or category with expandable/collapsible headers.
- **Action bars** — Primary actions (Approve, Finalize, Send) are prominent CTAs, either per-row or in a fixed bottom/top bar.
- **Avatar chips** — Team members shown as small circular avatars, used for assignees, attendees, and editors.
- **Tab-based workflows** — Multi-step flows (edit → review → send) presented as tabs rather than separate pages.

---

## Tech Stack

### Framework: Next.js

Next.js as the React framework — server-side rendering for the shared client views (Screen 7), app router for the authenticated dashboard, and API routes if needed for BFF (backend-for-frontend) patterns.

### Styling: Custom SCSS with Design Tokens

**No Tailwind. No shadcn. No component library.**

The goal is a distinct visual identity that doesn't look like every other LLM-generated SaaS dashboard. The inspiration images show clean, professional designs — the objective is to take those patterns and express them through a custom design system that feels uniquely iExcel.

**Approach:**

- **SCSS modules** — Co-located with components. Each component owns its styles. No global utility class soup.
- **Design tokens** — A centralized token system (colors, spacing, typography, shadows, radii, transitions) defined as SCSS variables and CSS custom properties. One place to tune the entire look.
- **Custom component library** — Built in-house. Every button, input, table, card, modal, sidebar, and badge is hand-crafted. This is the investment that pays off — components look and feel intentional, not generic.
- **Theming** — CSS custom properties enable theming (light/dark, or client-branded shared views) without rebuilding.

**Token structure:**

```
packages/
└── ui-tokens/
    ├── _colors.scss          # Brand palette, semantic colors (success, warning, danger)
    ├── _typography.scss       # Font families, sizes, weights, line heights
    ├── _spacing.scss          # Spacing scale (4px base grid)
    ├── _shadows.scss          # Elevation levels
    ├── _radii.scss            # Border radius scale
    ├── _transitions.scss      # Animation timing and easing
    ├── _breakpoints.scss      # Responsive breakpoints
    └── index.scss             # Exports all tokens
```

**Component structure:**

```
apps/ui/
└── src/
    ├── components/
    │   ├── Button/
    │   │   ├── Button.tsx
    │   │   ├── Button.module.scss
    │   │   └── index.ts
    │   ├── Table/
    │   │   ├── Table.tsx
    │   │   ├── TableRow.tsx
    │   │   ├── Table.module.scss
    │   │   └── index.ts
    │   ├── SlideOver/
    │   │   ├── SlideOver.tsx
    │   │   ├── SlideOver.module.scss
    │   │   └── index.ts
    │   ├── Sidebar/
    │   ├── Badge/
    │   ├── Avatar/
    │   ├── Card/
    │   ├── Modal/
    │   ├── InlineEdit/
    │   └── RichTextEditor/
    ├── layouts/
    │   ├── DashboardLayout.tsx
    │   ├── DashboardLayout.module.scss
    │   ├── PublicLayout.tsx       # For shared/client views
    │   └── PublicLayout.module.scss
    └── styles/
        ├── globals.scss           # Reset, base typography, CSS custom properties
        └── mixins.scss            # Reusable SCSS mixins (responsive, truncate, etc.)
```

**Why this matters:**
- Full creative control over every pixel. No fighting a component library's opinions.
- The design can evolve without being constrained by what shadcn or Tailwind makes easy.
- Client-facing shared views (Screen 7) can be branded and polished — not "obviously a developer dashboard."
- SCSS modules give scoped styles with the full power of SCSS (nesting, mixins, functions, variables) — something utility-class approaches give up.

**Trade-off acknowledged:** Building custom components takes more upfront time than dropping in shadcn. But the result is a product that has its own look, not a template.

---

## Open Questions

- [x] ~~Tech stack for the UI~~ → Resolved: Next.js with custom SCSS and design tokens. No Tailwind, no shadcn.
- [ ] Real-time collaboration — WebSockets, or polling-based?
- [ ] Should the client-facing link be a standalone page or embedded in an existing client portal?
- [ ] Email provider — SendGrid, Resend, or leverage Google Workspace?
- [ ] Should the UI support mobile, or desktop-only for now?
- [ ] Do clients need to leave comments or reactions on the shared agenda, or strictly read-only?
- [ ] Should `ui-tokens` live as its own Nx package (shareable across future apps) or stay inside `apps/ui`?
