# FRD — Feature Requirement Document
## Feature 29: UI Shared Agenda (Client View)

**Version:** 1.0
**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)
**Route:** `/shared/{token}`

---

## 1. Business Objectives

### 1.1 Primary Objective

Enable iExcel clients to view their finalized Running Notes agenda via a secure, shareable public URL — with no account, no login, and no internal tooling required. The client receives a link, clicks it, and sees a clean, professionally branded document ready for review or printing before a follow-up call.

### 1.2 Business Value

| Value Driver | Description |
|---|---|
| Client experience | Clients receive a polished, branded document rather than a raw file attachment or a request to log into an internal system |
| Reduced friction | Zero-auth access eliminates the biggest barrier to client adoption of the shared review flow |
| Trust and credibility | A professional, branded view reinforces iExcel's positioning as a structured, systematic service provider |
| Audit-ready | Token-scoped access means each share event is tied to a specific agenda and client, creating a natural audit trail |

### 1.3 Strategic Context

This screen is the client-facing output of the entire iExcel automation pipeline. Every feature upstream (transcript ingestion, task extraction, agenda generation, editor review, finalization, sharing) exists to produce the content that appears on this page. It is the moment the client interacts with the system, making its quality and reliability disproportionately important relative to its implementation complexity.

---

## 2. Target Users

### 2.1 Primary User: Client

| Attribute | Detail |
|---|---|
| Who | External clients of iExcel account managers |
| Technical level | Non-technical — may be a business owner, executive, or project stakeholder |
| Access method | Token-embedded URL received via email or direct message |
| Device | Desktop (primary), tablet or mobile (secondary) |
| Authentication | None required — access is conferred by possession of the URL |
| Intent | Review the agenda before a scheduled follow-up call; optionally print or save as PDF |

### 2.2 Secondary User: Internal Team (preview use)

Internal account managers and team members may use the shared URL to preview exactly what the client will see before sending it. This is a legitimate secondary use case — the page must look correct for both external and internal viewers.

---

## 3. Use Cases

### UC-01: Client Views Shared Agenda

**Actor:** Client
**Trigger:** Client receives a share URL and navigates to it
**Outcome:** Client sees the finalized Running Notes in a clean, branded layout

### UC-02: Client Prints Agenda

**Actor:** Client
**Trigger:** Client clicks the "Print" action on the shared agenda page
**Outcome:** Browser print dialog opens; page renders correctly in print layout

### UC-03: Client Downloads PDF

**Actor:** Client
**Trigger:** Client clicks "Download as PDF" action
**Outcome:** A formatted PDF of the agenda is downloaded to the client's device

### UC-04: Client Encounters Invalid Token

**Actor:** Client
**Trigger:** Client navigates to `/shared/{token}` with a token that does not exist or has been revoked
**Outcome:** Client sees a clear, branded error page explaining the link is invalid

### UC-05: Client Encounters Expired Token

**Actor:** Client
**Trigger:** Client navigates to `/shared/{token}` with a token past its expiry date
**Outcome:** Client sees a branded error page explaining the link has expired, with guidance to contact their account manager

### UC-06: Internal Team Previews Shared View

**Actor:** Account manager or internal team member
**Trigger:** User navigates to `/shared/{token}` to verify what the client will see
**Outcome:** Identical view to what the client sees — no internal-only information visible

---

## 4. Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Page load time (first paint) | < 1.5s on a standard connection | Lighthouse / real user monitoring |
| PDF download success rate | > 98% | Client-side error tracking |
| Error page clarity | No support tickets about "confusing link errors" | Support log review |
| Print layout correctness | No visible truncation or broken layout on A4/Letter | Manual QA across browsers |
| Mobile readability | All content readable without horizontal scroll on 375px viewport | Responsive QA |

---

## 5. Business Constraints

### 5.1 Zero Authentication

This page must be accessible without any login, OIDC flow, or cookie-based session. The token in the URL is the sole access credential. Any authentication middleware, route guards, or session checks must explicitly exclude `/shared/*` routes.

### 5.2 Finalized Agendas Only

The API endpoint `GET /shared/{token}` will only return content for agendas with `status = finalized`. The UI must handle all non-finalized or error states gracefully.

### 5.3 No Internal Data Exposure

Internal comments, version history, editing metadata, assignee information, and any other data not part of the finalized Running Notes must never appear on this page. The data contract is defined by the API response — the UI must not attempt to display fields beyond what is returned by `GET /shared/{token}`.

### 5.4 Read-Only

No editing, annotation, commenting, or reaction functionality is in scope for V1. The page is strictly a viewer.

### 5.5 Dependency on Feature 23 (UI Scaffolding)

`PublicLayout.tsx` and `PublicLayout.module.scss` must exist before this feature can be implemented. Feature 23 (ui-scaffolding) is a hard prerequisite.

### 5.6 Dependency on Feature 22 (API Client Package)

All API calls to `GET /shared/{token}` must go through the shared `api-client` package. Direct fetch calls against the API URL are not permitted.

---

## 6. Integration with Product Roadmap

This feature is a **Wave 4** delivery (per the Spec Generation Waves in `index.md`). It depends on:
- Feature 23: UI scaffolding (provides `PublicLayout`)
- Feature 22: API client package (provides the typed API client)

It unblocks nothing downstream — it is a leaf node in the dependency graph. However, it is the visible output of features 14 (agenda endpoints), 28 (agenda editor), and the entire Mastra agent pipeline. It should be treated as a high-visibility deliverable despite its leaf status.

---

## 7. Out of Scope (V1)

- Client authentication or account creation
- Client commenting, reactions, or annotations
- Version history display
- Internal comments or metadata
- Editing controls of any kind
- Real-time updates (agenda content is static once finalized)
- Client portal embedding
- Analytics tracking of client views (may be added in V2)
- Token revocation UI (handled via API)
