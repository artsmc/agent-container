# FRD — Feature Requirement Document
## Feature 28: UI Agenda Editor
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Business Objectives

Feature 28 delivers Screen 5 (Agenda List) and Screen 6 (Agenda Editor) of the iExcel web UI. These two screens enable the internal team to review, collaboratively edit, finalize, and distribute the Running Notes documents that are shared with clients before follow-up calls.

The core workflow problem: after the Mastra agent generates an agenda from completed tasks and deliverables, the document is a raw draft. Before it reaches the client, the account manager and team need to:

1. Review the draft for accuracy and tone.
2. Add internal notes (visible to the team only, never shared with the client).
3. Collaborate with colleagues on refinements in real-time.
4. Finalize the document (locking out further accidental edits).
5. Distribute it — via a shareable URL or email — to the client and internal stakeholders.

Without this screen, the team is forced to export the draft and edit it manually in Google Docs, losing the structured format and requiring manual re-import. This screen eliminates that context switch.

The business goals are:

- **In-app collaborative editing** — Multiple team members can edit an agenda simultaneously with cursor presence indicators, replacing the "pass the doc" workflow.
- **Internal comments** — Annotation sidebar allows team members to leave context notes that never appear in the client-facing shared version, keeping the workflow inside the platform.
- **Finalize gate** — The Finalize action enforces a review checkpoint before distribution, preventing raw agent output from reaching clients accidentally.
- **One-click distribution** — The Email and Share actions send the finalized agenda to the right people without copy-pasting content into separate tools.
- **Version history** — All edits (from agent, UI, and terminal) are tracked with diffs, giving the team full auditability of how a document evolved.

---

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Account Manager** | Review, edit, and send the client agenda from one screen; no Google Docs round-trip |
| **Internal Team** | Collaborative editing and internal comments enable parallel work without file conflicts |
| **Client (external)** | Receives a clean, finalized, readable document — not a raw agent draft |
| **Operations** | Finalize gate prevents premature sharing; version history provides audit trail |

---

## 3. Target Users

| User | Access Level | Actions on This Screen |
|---|---|---|
| **Account Manager** | Full access | Edit content, finalize, share, email, export |
| **Internal Team Member** | Edit (cannot finalize) | Collaborate on content, add internal comments |
| **Admin** | Full access | All account manager capabilities |

Clients (external) do not access Screen 5 or Screen 6. They receive a link to the Shared Agenda view (Screen 7 — feature 29), which is a separate read-only screen.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Agenda list at `/clients/{id}/agendas` renders all agendas as cards | Pass |
| Agenda editor at `/agendas/{short_id}` loads and renders the Running Notes content | Pass |
| Edits to any section save via `PATCH /agendas/{id}` (auto-save on blur or change) | Pass |
| Internal comments can be added and are not visible in the shared version | Pass |
| Collaborative editing: two sessions editing the same agenda do not conflict (at minimum: last-write-wins with conflict indicator) | Pass |
| Finalize button locks editing and changes status to `finalized` | Pass |
| Finalize is blocked for `team_member` role | Pass |
| Share action returns two URLs (client-facing and internal) | Pass |
| Email action pre-fills recipients from client config and sends via API | Pass |
| Export action calls `POST /agendas/{id}/export` | Pass |
| Version history panel shows edits with source labels | Pass |

---

## 5. Business Constraints

- **No agenda creation.** Agendas are created by Mastra via the agenda workflow (feature 20). No "New Agenda" button on the list screen.
- **No shared agenda public view on this screen.** The shared view is feature 29 at `/shared/{token}`. Feature 28 generates the share token; it does not render the public view.
- **No Google Docs implementation.** The export button calls `POST /agendas/{id}/export`; the actual Google Docs push is implemented API-side in feature 15.
- **No email sending implementation.** The email button calls `POST /agendas/{id}/email`; the actual sending is API-side in feature 16.
- **Finalize requires at least one edit.** The API enforces this rule (from `api-prd.md`). The UI must handle the `FINALIZE_REQUIRES_EDIT` error response gracefully.
- **No Tailwind, no shadcn.** All styling via SCSS modules and `@iexcel/ui-tokens`.

---

## 6. Dependencies

### Blocked By

| Feature | Reason |
|---|---|
| 23 — ui-scaffolding | `RichTextEditor`, `Card`, `Badge`, `Button`, `SlideOver` stubs must exist |
| 24 — ui-auth-flow | Authentication and role data required (finalize role check) |
| 22 — api-client-package | `@iexcel/api-client` required for all agenda API calls |
| 25 — ui-dashboard | Dashboard exists; feature 28 is accessible from client detail and dashboard agenda links |

### Blocks

| Feature | Reason |
|---|---|
| 29 — ui-shared-agenda | Shared agendas are generated via the Share action built in feature 28; feature 29 renders the resulting public view |

---

## 7. Integration with Product Roadmap

Feature 28 is in Phase 3 Consumers, Wave 5. It directly enables feature 29 (shared agenda public view) by generating the share tokens that create the URLs feature 29 renders.

The collaborative editing requirement (WebSockets vs. polling) is an open question inherited from `ui-prd.md`. Feature 28 must implement this in a way that does not block feature 29. The decision must be made before implementation begins (see Open Questions).

In V2, the Export action (Google Docs push) and Email action will be fully operational once features 15 and 16 are complete. Feature 28 implements the UI actions that call those API endpoints regardless of whether those features are done — the UI's role is to call the API, not to implement the delivery logic.

---

## 8. Open Questions

| Question | Impact on Feature 28 |
|---|---|
| Real-time collaboration: WebSockets or polling? | This is the largest open question. WebSockets require a persistent connection infrastructure (feature 36 / Render WebSocket support). Polling (e.g., every 5 seconds) is simpler but not true real-time. Recommendation: start with optimistic local editing + polling at 5s interval for V1; plan WebSocket upgrade for V2. |
| Who can leave internal comments — only Account Managers, or all authenticated users including Team Members? | Assumed: all authenticated internal users can leave and reply to comments. Only Account Managers can finalize and share. |
| Should the Finalize action require an explicit confirmation dialog? | Recommended: yes — a confirmation modal ("Are you sure you want to finalize? This will lock the agenda for editing.") to prevent accidental finalization. |
| What is the export format for "Download as PDF"? | If the API handles PDF generation, the Export action calls `POST /agendas/{id}/export?format=pdf` and the API returns a download URL. If the UI handles it, a browser `print()` trigger is used. Recommend API-side PDF for consistent formatting. |
| Should the agenda list be paginated, or show all agendas? | For most clients, agenda count will be manageable (< 50). Use client-side display of all results with no pagination for V1. |
