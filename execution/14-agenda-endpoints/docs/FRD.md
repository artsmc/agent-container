# FRD — Feature Requirement Document
## Feature 14: Agenda Endpoints

**Feature Name:** agenda-endpoints
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Specification

---

## 1. Business Objectives

### 1.1 Overview

The iExcel automation system produces two categories of deliverables from every client engagement cycle: tasks (work items pushed to Asana) and agendas (Running Notes documents delivered to the client). Feature 14 owns the complete lifecycle of agendas — from initial draft creation by the Mastra agent through human review, finalization, sharing, email distribution, and Google Docs export.

An agenda is the primary human-facing artifact of a workflow cycle. It summarizes what happened during the period, what was accomplished, and what comes next. It is the document an account manager presents to — or shares with — the client. Getting the lifecycle right is critical: agendas must be thoroughly reviewed before they reach clients, and the system must make distribution effortless once they are ready.

### 1.2 Business Value

| Objective | Current State | Target State |
|---|---|---|
| Agenda creation time | Manually written after every call; 30–60 minutes per cycle | Agent generates a draft in seconds after task reconciliation; account manager reviews and edits |
| Distribution risk | Accidental sharing of raw, unreviewed AI output is possible | Hard lifecycle gate: sharing and emailing require `status = finalized`; finalization requires at least one human edit or explicit confirmation |
| Client access | Agendas are emailed as attachments; no self-service access | Shareable read-only URLs allow clients to view their Running Notes at any time |
| Audit trail | No record of who edited, finalized, or distributed a document | Every status transition, edit, share event, and email send is recorded in the audit log |
| Document portability | Agendas exist only in email; no persistent document | Google Docs export creates a canonical Google Doc linked to the agenda record |
| Version recovery | Edits overwrite history | Immutable version history: every edit creates a new Agenda Version row; agent-generated original is always recoverable |

### 1.3 Strategic Context

Feature 14 sits on the critical path of the workflow pipeline:

```
00 → 01 → 04 → 07 → 11 → 12 → 13 → [14] → 17 → 19/20 → 21 → 33
```

Feature 14 directly blocks:
- **Feature 15** (Google Docs Adapter) — the export endpoint defined here calls Feature 15's adapter
- **Feature 16** (Email Adapter) — the email endpoint defined here calls Feature 16's adapter
- **Feature 17** (Workflow Orchestration) — workflow completion depends on agenda creation and state
- **Feature 20** (Workflow B Agenda Agent) — the agent POSTs draft agendas to the endpoint built here
- **Feature 28** (UI Agenda Editor) — the UI consumes all agenda endpoints defined here

Nothing in the product distributes a Running Notes document to a client without this feature.

---

## 2. Target Users

### 2.1 Primary Users

| User Type | Role | Interaction |
|---|---|---|
| Account Manager | Edits, reviews, finalizes, shares, and emails agendas | Web UI (Feature 28) and possibly terminal |
| Admin | All account manager capabilities plus system configuration | Web UI |
| Mastra Agent (Workflow B) | Creates draft agendas via POST after task reconciliation | Service-to-service (OIDC client credentials) |

### 2.2 Secondary Users

| User Type | Role | Interaction |
|---|---|---|
| Team Member | Collaborative editing of agendas in review | Web UI (Feature 28) |
| Terminal Operator | Edit agendas, trigger finalization and sharing via MCP tools | Terminal / Claude (Feature 33) |
| Client (Unauthenticated) | Reads their shared Running Notes via a public URL | Browser — `/shared/{token}` endpoint |

### 2.3 User Journeys

**Journey A — Automated Draft Creation (Mastra)**
1. Workflow B (Feature 20) completes task reconciliation for a client.
2. Mastra calls `POST /clients/{id}/agendas` with the generated agenda content and cycle dates.
3. The API auto-assigns a short ID (e.g., `AGD-0015`), saves the agenda as `draft`, creates version 1, writes an audit entry.
4. The agenda appears in the UI agenda editor (Feature 28) for review.

**Journey B — Human Review and Finalization**
1. Account manager opens the agenda editor.
2. Reviews and edits content; each save creates a new version record.
3. Once satisfied, calls finalize — which enforces that at least one human edit exists (or provides explicit confirmation).
4. Agenda status transitions to `finalized`.

**Journey C — Share and Distribute**
1. Account manager generates share URLs via `POST /agendas/{id}/share`.
2. Two tokens are created: one for client read-only access, one for internal edit access.
3. Account manager optionally sends the agenda by email via `POST /agendas/{id}/email`.
4. Account manager optionally exports to Google Docs via `POST /agendas/{id}/export`.

**Journey D — Client Self-Service Access**
1. Client receives an email containing their Running Notes link.
2. Client clicks the link (e.g., `https://app.example.com/shared/abc123token`).
3. The browser calls `GET /shared/{token}` — no authentication required.
4. The API returns the agenda content for the read-only client view.

---

## 3. Success Metrics and KPIs

| Metric | Target |
|---|---|
| Draft creation latency (POST) | < 500ms including short ID assignment, version insert, audit entry |
| Short ID lookup latency (GET /agendas/{AGD-####}) | < 100ms (unique index scan) |
| Share token generation | < 200ms including both token inserts and audit entry |
| Public shared endpoint (GET /shared/{token}) | < 150ms; no auth overhead |
| Lifecycle enforcement accuracy | 100% — zero agendas shared or emailed without `status = finalized` |
| Audit log completeness | 100% of status transitions, edits, shares, emails, and exports captured |
| Short ID uniqueness | Zero collisions guaranteed by PostgreSQL sequence |
| Email delivery gate | 100% of email calls blocked when status is not `finalized` |

---

## 4. Business Constraints and Rules

### 4.1 Finalization Gate
An agenda may not be shared or emailed unless its `status = finalized`. This is a hard business rule. The intent is to prevent raw, unreviewed AI-generated content from reaching clients.

### 4.2 Finalization Requires Human Review
Finalizing an agenda that has only version 1 (the agent-generated original, no human edits) requires an explicit confirmation flag in the request body. Without it, the API returns `AGENDA_NOT_FINALIZABLE` (422). This prevents accidental finalization of untouched agent output.

The logic: if `version_count = 1` and `versions[0].source = 'agent'`, then the agenda has not been edited by a human. The finalize endpoint must require `force: true` to proceed in this case.

### 4.3 Short IDs are Permanent
Once a short ID (`AGD-0015`) is assigned, it is globally unique and immutable. It is never reused, even if the agenda is archived or the client engagement ends.

### 4.4 Version History is Immutable
Every edit to agenda content creates a new Agenda Version row. Version rows are never updated or deleted. The original agent-generated content (version 1) is always recoverable.

### 4.5 Share Tokens are Stable Once Generated
Calling `POST /agendas/{id}/share` a second time returns the existing tokens (does not regenerate them). Tokens are stable throughout the agenda's lifecycle. If regeneration is required, an admin must perform an explicit reset (out of scope for this feature; token stability is the default behavior).

### 4.6 The Public Endpoint Requires No Authentication
`GET /shared/{token}` is public. It must not require a Bearer token. It must not leak any data beyond the agenda's content and metadata (no user IDs, no internal fields, no other agendas).

### 4.7 Email and Export Delegate to Adapters
The `/email` and `/export` endpoints own the lifecycle check and audit logging but delegate the actual operation to Feature 16 (Email Adapter) and Feature 15 (Google Docs Adapter) respectively. If an adapter returns an error, the agenda's status does not change.

### 4.8 Recipient Override on Email
The email endpoint accepts an optional `recipients` array in the request body. If provided, the email is sent to those recipients. If not provided, the API falls back to the client's `email_recipients` config (from the Clients table). If neither is set, the endpoint returns a validation error.

---

## 5. Dependencies

### 5.1 Upstream (Blocked By)

| Feature | Dependency |
|---|---|
| Feature 07 (API Scaffolding) | Express/Fastify app, middleware stack, auth token validation, error handling |
| Feature 09 (Client Management) | Client records must exist; `email_recipients` JSONB read from here |
| Feature 04 (Product Database Schema) | Agendas and Agenda Versions tables, indexes, and short ID sequence must exist |
| Feature 13 (Status Reconciliation) | Agenda creation is triggered after task reconciliation completes |

### 5.2 Downstream (Blocks)

| Feature | What It Needs From This Feature |
|---|---|
| Feature 15 (Google Docs Adapter) | The export endpoint calls Feature 15's adapter service; the google_doc_id is stored here |
| Feature 16 (Email Adapter) | The email endpoint calls Feature 16's adapter service |
| Feature 17 (Workflow Orchestration) | Workflow B completion depends on agenda creation via `POST /clients/{id}/agendas` |
| Feature 20 (Workflow B Agenda Agent) | Agent calls `POST /clients/{id}/agendas` to save the draft agenda it generates |
| Feature 28 (UI Agenda Editor) | Consumes all agenda endpoints for the review and editing UI |
| Feature 29 (UI Shared Agenda) | Consumes `GET /shared/{token}` for the public client-facing view |
| Feature 33 (Terminal MCP Tools) | Terminal tools invoke these endpoints for agenda operations |

---

## 6. Out of Scope

| Excluded | Reason |
|---|---|
| Google Docs conversion logic | Feature 15 (Google Docs Adapter) |
| Email sending and delivery tracking | Feature 16 (Email Adapter) |
| Agenda content generation from tasks | Feature 20 (Workflow B Agenda Agent) |
| Collaborative real-time editing (WebSocket, CRDT) | Feature 28 (UI Agenda Editor) |
| Rich text storage format decision | Open question in database-prd.md; Feature 04 owns this |
| Share token regeneration / revocation | Admin-only capability; deferred |
| Agenda deletion | Open question: soft delete vs. hard delete; deferred to Feature 04 |
| Pagination on version history | Version counts are expected to be small (< 50 per agenda); full list is acceptable |
