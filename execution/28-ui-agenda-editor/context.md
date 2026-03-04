# Feature 28: UI Agenda Editor

## Summary
Build Screen 5 (Agenda List) and Screen 6 (Agenda Editor). The agenda list at `/clients/{client_id}/agendas` shows cards with short ID, cycle dates, status, and last edited info. The editor at `/agendas/{short_id}` provides rich text editing for Running Notes sections, collaborative editing, internal comments, version history, and an action bar (finalize, share, email, export).

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding — RichTextEditor, Card, Badge components), 24 (UI auth flow), 22 (api-client)
- **Blocks**: 29 (shared agenda — finalized agendas are shared from the editor)

## Source PRDs
- `ui-prd.md` — Screen 5: Agenda List, Screen 6: Agenda Editor, design inspiration for agendas

## Relevant PRD Extracts

### Screen 5: Agenda List (ui-prd.md)

**Route:** `/clients/{client_id}/agendas`

All agendas/Running Notes for a client, ordered by cycle date.

**Layout:**
- **Agenda cards** — Each card shows:
  - Short ID (`AGD-####`)
  - Cycle dates (start -> end)
  - Status badge (`draft`, `in_review`, `finalized`, `shared`)
  - Last edited by and when
  - Quick actions: Edit, Finalize, Share, Email

### Screen 6: Agenda Editor (ui-prd.md)

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

### Agenda Design Inspiration (ui-prd.md)

| File | Key Takeaways |
|---|---|
| `agenda/image.png` | Numbered agenda builder with drag-and-drop. Numbered, reorderable list for Running Notes sections. Tab flow (edit -> review -> send) maps to agenda lifecycle (draft -> finalized -> shared/emailed). "Proceed to send" CTA. |
| `agenda/image copy 2.png` | Agenda builder with participants and topics. Participant management with roles. Topic cards with time estimates. |
| `agenda/image copy 3.png` | Compact meeting agenda with checkable items. Checklist-with-time-estimates format. Progress tracking. |
| `agenda/image copy 4.png` | **Strongest match for Agenda Editor.** Structured sections with checkable items and assignee avatars. Left sidebar with categorized agenda list. Description block at top. "Suggestions" button (could be AI Suggestions from Mastra). "Finish Meeting" -> "Finalize Agenda". |

### Agenda Lifecycle (api-prd.md)
- Agendas can only be shared or emailed if `status = finalized`.
- Finalizing requires at least one edit or explicit confirmation (prevents accidental sharing of raw agent output).

### Running Notes Format (mastra-prd.md)
1. Completed Tasks
2. Incomplete Tasks
3. Relevant Deliverables
4. Recommendations
5. New Ideas
6. Next Steps

### API Endpoints Used
- `GET /clients/{id}/agendas` — List agendas for a client
- `GET /agendas/{id}` — Get specific agenda with version history (accepts short ID)
- `PATCH /agendas/{id}` — Edit agenda content
- `POST /agendas/{id}/finalize` — Mark as finalized
- `POST /agendas/{id}/share` — Generate shareable URLs (client-facing read-only + internal edit)
- `POST /agendas/{id}/email` — Send to recipients
- `POST /agendas/{id}/export` — Export to Google Docs

### Permission Model
| Role | Agenda Capabilities |
|---|---|
| **Admin** | Everything |
| **Account Manager** | Full CRUD. Finalize agendas, share, email. |
| **Team Member** | Edit agendas (collaborative). Cannot finalize. |

## Scope

### In Scope
- Agenda list page at route `/clients/{client_id}/agendas` within DashboardLayout
- Agenda card component:
  - Short ID (`AGD-####`)
  - Cycle dates (start -> end)
  - Status badge (`draft`, `in_review`, `finalized`, `shared`)
  - Last edited by (user name/avatar) and when (timestamp)
  - Quick action buttons: Edit, Finalize, Share, Email
- Agenda editor page at route `/agendas/{short_id}` within DashboardLayout
- Editor header: short ID, client name, cycle dates, status badge
- Rich text editor for Running Notes content with section structure:
  - Completed Tasks
  - Incomplete Tasks
  - Relevant Deliverables
  - Recommendations
  - New Ideas
  - Next Steps
- Collaborative editing — real-time multi-user editing with cursor presence indicators
- Internal comments sidebar — annotation system with threaded replies (not visible in shared version)
- Version history panel — collapsible, showing all edits with diff view, source (agent/ui/terminal), and editor identity
- Action bar:
  - Finalize button (locks editing, changes status to `finalized`)
  - Share button (generates shareable URLs — client-facing read-only, internal edit-enabled)
  - Email button (send to recipients, pre-filled from client config, editable before send)
  - Export button (push to Google Docs or download as PDF)
- Role-based action visibility (team members can edit but not finalize)
- Auto-save during editing via `PATCH /agendas/{id}`

### Out of Scope
- Shared agenda public view (feature 29)
- Agenda creation (agendas are created by Mastra via workflow, feature 20)
- Google Docs export implementation (API-side, feature 15)
- Email sending implementation (API-side, feature 16)
- Workflow triggering (feature 30)

## Key Decisions
- Collaborative editing requires a real-time communication layer (WebSockets or similar). This is an open question in the PRD (WebSockets vs. polling). The implementation should support cursor presence indicators showing who else is editing.
- Internal comments are stored separately from agenda content and are NOT included when the agenda is shared or exported. They are visible only to authenticated internal users.
- The Finalize action enforces the API's rule that at least one edit or explicit confirmation must occur before finalizing — preventing accidental sharing of raw agent output.
- The version history shows diffs between versions, the editor identity, and the source (agent, UI, terminal) — enabling cross-platform edit tracking.
- The Share action calls `POST /agendas/{id}/share` which returns two URLs: a client-facing read-only URL (no auth, served via `/shared/{token}`) and an internal edit URL (auth required).
- The Email action pre-fills recipients from the client's `email_recipients` config but allows editing the list before sending.
