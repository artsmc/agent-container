# FRD — Feature Requirement Document
# Feature 25: UI Dashboard (`ui-dashboard`)

**Route:** `/`
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)
**Epic:** Web UI — iExcel Automation System
**Date:** 2026-03-03
**Status:** Draft

---

## 1. Business Objectives

The Dashboard is the primary entry point for every authenticated internal user (account managers and internal team). Its purpose is to surface the entire state of iExcel's client portfolio in one glance, removing the need to navigate into individual client pages to discover what needs attention.

### Primary Goals

- Reduce time-to-action: an account manager opening the app should immediately know which tasks need approval and which clients require attention, without clicking into sub-pages.
- Aggregate pending work: rather than remembering which clients have open draft tasks, the system presents a unified queue of everything awaiting review.
- Provide orientation: the recent activity feed lets the team understand what the system (and colleagues) have done recently without consulting an audit tool separately.

### Value Proposition

| Without Dashboard | With Dashboard |
|---|---|
| User must visit every client page to check for pending tasks | Single panel shows all draft tasks across all clients |
| User must remember which agendas are in progress | Client cards show agenda status at a glance |
| User has no quick way to know recent system actions | Activity feed surfaces the last N system events |

---

## 2. Target Users

| User | Role | Primary Dashboard Use |
|---|---|---|
| Account Manager | Full access | Review pending approvals, navigate to client tasks/agendas, monitor activity |
| Internal Team | Edit access | Orientation — see what is pending, who has been active, access client views |

Clients (read-only external users) do NOT access this screen. They access Screen 7 (Shared Agenda) via a public token link.

---

## 3. Dependencies

This feature is only buildable after these features are complete:

| Feature | What it provides |
|---|---|
| 23 — ui-scaffolding | `DashboardLayout`, component stubs, design tokens, SCSS module system |
| 24 — ui-auth-flow | Authentication gate — dashboard requires an authenticated OIDC session |
| 22 — api-client-package | Typed HTTP client for all API calls |

This feature blocks:

| Feature | Why |
|---|---|
| 26 — ui-client-detail | Dashboard links to `/clients/{id}` |
| 27 — ui-task-review | Dashboard pending approvals panel links to `/clients/{id}/tasks` |
| 28 — ui-agenda-editor | Dashboard client cards link to `/clients/{id}/agendas` |
| 30 — ui-workflow-trigger | Dashboard is the shell from which workflow trigger is accessed |
| 31 — ui-admin-settings | Dashboard is the shell from which settings is accessed |

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Dashboard page renders fully (all three sections visible) for a user with 10 clients in under 2 seconds (P95) on a fast connection | Pass |
| A user can navigate from the pending approvals panel to the correct task review screen in one click | Pass |
| All client cards accurately reflect the current agenda status and pending task count sourced from the API | Pass |
| Empty states are shown (not blank sections) when there are no pending approvals or no recent activity | Pass |
| Loading skeleton states appear immediately on navigation before data arrives | Pass |

---

## 5. Business Constraints

- The UI communicates exclusively with the API layer. It has no direct database access, no direct Mastra calls, and no direct external service calls.
- All data displayed on the dashboard is fetched from the four API endpoints listed in the scope. No client-side computation of aggregate counts (those come from the API).
- The dashboard must work within the existing `DashboardLayout` established in feature 23 — it is not a full-page layout; it renders inside the layout shell.
- Short IDs (`TSK-####`) are the canonical task identifiers used throughout the UI and match what is used in terminal/chat interactions.

---

## 6. Out of Scope

The following are explicitly deferred to downstream features:

- Client detail page and its tabs (feature 26)
- Task review, inline editing, batch approve/reject (feature 27)
- Agenda editing, finalising, sharing (feature 28)
- Workflow trigger form (feature 30)
- Admin settings (feature 31)
- Real-time updates via WebSocket (open question in ui-prd.md — deferred)
- Mobile-responsive layout (open question in ui-prd.md — deferred)

---

## 7. Integration with Product Roadmap

The dashboard is the anchor screen of the Web UI. It is the first screen a user sees after login and the hub from which all other screens are accessed. Its primary function is discoverability — ensuring nothing in the system goes unnoticed.

It forms part of the human approval layer that sits between the Mastra agent pipeline and external systems (Asana, Google Docs, email). Without the dashboard, account managers lack the overview needed to manage their approval queue efficiently.
