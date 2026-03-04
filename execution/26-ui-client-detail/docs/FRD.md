# FRD — Feature Requirement Document
## Feature 26: UI Client Detail
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## 1. Business Objectives

Feature 26 delivers Screen 2 of the iExcel web UI: the Client Detail page at `/clients/{client_id}`. This screen is the central hub for everything related to a single client. Currently, account managers must switch between Asana, email threads, and manual notes to get a complete picture of a client's standing. This screen consolidates that picture into one authenticated view.

The concrete business goals are:

- **Unified client context** — A single URL shows the client's tasks, agendas, transcripts, configuration, and import history without context switching.
- **Streamlined settings management** — Account managers can update Asana workspace routing and email recipient lists directly from the client detail page, without requiring a developer or admin to change configuration.
- **Lazy-loaded tabs** — Only the data for the active tab is fetched, keeping the initial page load fast even for clients with large task and agenda histories.
- **Read-only history** — Imported historical records are clearly surfaced and protected from accidental editing, preserving data integrity for reactivated clients.

---

## 2. Value Proposition

| Stakeholder | Value Delivered |
|---|---|
| **Account Manager** | One page shows everything about a client — tasks, agendas, transcripts, settings — without switching tools |
| **Internal Team** | Clear view of client configuration (workspace, project, recipients) prevents routing errors when approving tasks |
| **Operations** | Settings tab allows self-service config updates without engineering involvement |
| **Client (indirect)** | Correct routing config means tasks land in the right Asana project and agendas reach the right email recipients |

---

## 3. Target Users

| User | Access Level | Actions on This Screen |
|---|---|---|
| **Account Manager** | Full access | View all tabs, edit settings, navigate to task review and agenda editor |
| **Internal Team Member** | Read/edit | View all tabs, edit settings (role permitting), navigate to child screens |
| **Admin** | Full access | All of the above |

Clients (external, read-only users) do not access this screen. The Client Detail page is an internal-only authenticated view.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Page renders for a valid client ID without error | Pass |
| Each tab's content loads only when that tab is activated (lazy load) | Verified via Network tab — no pre-fetching inactive tabs |
| Settings tab saves via `PATCH /clients/{id}` with correct payload | Pass |
| History tab renders imported records as read-only (no edit controls visible) | Pass |
| Loading, empty, and error states render correctly per tab | Pass |
| Agendas tab links navigate to `/agendas/{short_id}` | Pass |
| Transcripts tab displays call date, call type, and processing status | Pass |
| No navigation to this page is possible without authentication (covered by feature 24) | Pass |

---

## 5. Business Constraints

- **No task inline editing on this screen.** The Tasks tab in Client Detail provides a summary view or a link to the full Task Review screen (feature 27). Inline editing belongs to feature 27.
- **No agenda editing on this screen.** The Agendas tab links to the agenda editor at `/agendas/{short_id}`. Agenda editing belongs to feature 28.
- **No transcript upload.** Transcript ingestion is triggered via the Workflow Trigger screen (feature 30).
- **No historical import triggering.** Triggering a historical import is feature 38. The History tab is read-only display only.
- **No client creation or deletion.** This screen manages an existing client. Admin-level client lifecycle management is out of scope.
- **No Tailwind, no shadcn.** All styling uses SCSS modules and the `@iexcel/ui-tokens` design token system established in feature 23.

---

## 6. Dependencies

### Blocked By

| Feature | Reason |
|---|---|
| 23 — ui-scaffolding | DashboardLayout, Badge, Card, Tab, Avatar component stubs must exist |
| 24 — ui-auth-flow | Authentication guard on DashboardLayout must be in place before this screen goes live |
| 22 — api-client-package | `@iexcel/api-client` must be available for data fetching hooks |
| 25 — ui-dashboard | Feature 25 establishes the dashboard and client list; feature 26 is the next navigation step from that list |

### Blocks

| Feature | Reason |
|---|---|
| None directly | Features 27 (task review) and 28 (agenda editor) are peer screens linked from this page's tabs but are built independently |

### Peer Screens (linked from tabs)

| Screen | Route | How It's Linked |
|---|---|---|
| Task Review (Feature 27) | `/clients/{client_id}/tasks` | Tasks tab links/navigates here |
| Agenda Editor (Feature 28) | `/agendas/{short_id}` | Agendas tab links per agenda card |

---

## 7. Integration with Product Roadmap

Feature 26 is a Phase 3 Consumers feature, part of the Wave 5 spec generation batch (alongside features 12, 14, 25, 27, 28). It sits in the UI branch of the dependency tree: `00 → 23 → 24 → 25 → 26`.

The Client Detail page is the navigation hub for the entire client-specific workflow: from here, account managers navigate to task review (feature 27) and agenda editing (feature 28). It also surfaces the entry point into the settings that govern how tasks and agendas are distributed (routing and email config).

In V2, features 37 (Grain integration) and 38 (historical import) will extend the Transcripts and History tabs respectively. Feature 26 must leave those tabs extensible.

---

## 8. Open Questions (Inherited and New)

| Question | Impact on Feature 26 |
|---|---|
| Tasks tab: summary view embedded vs. navigate to `/clients/{client_id}/tasks`? | Key Decision: a lightweight summary list with a "View All" link to feature 27 is preferred — avoids duplicating the full inline-edit table here |
| Routing rules format: what are the valid routing rule structures in the Settings tab? | Depends on API specification for `PATCH /clients/{id}` — routing rules field format must be confirmed before Settings tab form is built |
| Should the Settings tab auto-save on blur, or require an explicit Save button? | Explicit Save button preferred for destructive config fields (email recipients, workspace) to avoid accidental saves |
| Should the Asana workspace dropdown in Settings fetch workspaces from `GET /asana/workspaces`? | Yes — same endpoint used by Task Review (feature 27) — confirm the api-client exposes this |
