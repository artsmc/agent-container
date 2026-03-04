# FRD — Feature Requirement Document
## Feature 17: Workflow Orchestration

**Feature Name:** workflow-orchestration
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## 1. Business Objective

The iExcel automation system exists to eliminate repetitive, manual work from the account manager's weekly client call cycle. Two core workflows drive this automation:

- **Workflow A (Post-Intake):** After an intake call, an account manager triggers the system to parse the call transcript and generate structured Asana tasks — removing the need to manually build tickets from notes.
- **Workflow B (Pre-Call):** Before a follow-up client call, an account manager triggers the system to compile completed Asana tasks into a "Running Notes" agenda document — removing the need to manually pull and summarize status updates.

Feature 17 is the **orchestration hub** that makes both workflows triggerable and trackable. It does not contain the LLM intelligence (that is Features 19 and 20) — it is the API layer's responsibility to accept trigger requests, validate preconditions, persist run records, invoke Mastra asynchronously, and expose status tracking so consumers know when work is done.

Without Feature 17, Mastra agents cannot be triggered from the API. It is a hard prerequisite for all downstream automation features.

---

## 2. Value Proposition

| Stakeholder | Pain Removed | Value Delivered |
|---|---|---|
| Account Manager | Manual task-building from call notes after every intake session | One-click trigger; draft tasks appear in review queue automatically |
| Account Manager | Manual compilation of completed tasks before every follow-up call | One-click trigger; draft agenda appears for review automatically |
| Development Team | No defined contract between API and Mastra agent runtime | Clear async invocation pattern, run record lifecycle, and status contract |
| System Integrity | No audit trail for automated actions | Every workflow trigger and completion is logged to the audit log |

---

## 3. Target Users

### Primary: Account Managers
Account managers initiate both workflows manually via the Web UI (Feature 30) or terminal (Feature 33). They need to:
- Trigger Workflow A after completing an intake call.
- Trigger Workflow B in the hours before a follow-up client call.
- Check workflow status when results are not immediately available.
- Understand clearly when a workflow fails and why.

### Secondary: Mastra Service (machine consumer)
The Mastra agent runtime calls back to the API to save draft tasks and draft agendas. It uses OIDC client credentials flow and goes through the same auth/authz pipeline as human consumers.

### Tertiary: Developers / Operators
Need visibility into workflow run history for debugging, monitoring, and incident response.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Workflow trigger to run record creation | < 500ms |
| Async Mastra invocation time (fire, not await) | < 100ms after run record created |
| Status polling response time | < 150ms |
| Workflow A end-to-end completion (draft tasks visible) | < 60 seconds (Mastra processing time) |
| Workflow B pre-condition check (no completed tasks) returns warning | < 500ms |
| Failed workflows surface a structured error code | 100% of failures |
| All workflow triggers and completions appear in audit log | 100% coverage |

---

## 5. Business Constraints

- **Asynchronous only.** LLM processing via Mastra can take 10–60 seconds. The API must never block an HTTP request waiting for Mastra to finish. Consumers poll the status endpoint or use webhooks (out of scope for V1).
- **Manual triggers only in V1.** Scheduled/cron-based triggers are deferred. The API endpoints are called explicitly by a human consumer.
- **Workflow B requires completed tasks.** If no completed tasks exist for the client since the last cycle, the API must reject the trigger with a warning — not invoke Mastra with empty input.
- **Mastra is a worker, not an orchestrator.** The API layer owns the lifecycle. Mastra processes and calls back. It does not make orchestration decisions.
- **Client isolation.** A workflow run is always scoped to a single client. Cross-client workflows do not exist.
- **Authorization required.** Only users with `account_manager` or `admin` role can trigger workflows for their assigned clients.

---

## 6. Dependencies

### Blocked By (must be complete before this feature)
| Feature | Dependency Reason |
|---|---|
| 07 (API Scaffolding) | Fastify app, middleware chain, auth validation, route registration |
| 04 (Product Database Schema) | Workflow run records table |
| 10 (Transcript Endpoints) | Workflow A requires a valid `transcript_id` to pass to Mastra |
| 11 (Task Endpoints) | Mastra calls back to `POST /clients/{id}/tasks` during Workflow A |
| 14 (Agenda Endpoints) | Mastra calls back to `POST /clients/{id}/agendas` during Workflow B |

### Blocks (cannot start until this feature is complete)
| Feature | Why |
|---|---|
| 19 (Workflow A Intake Agent) | Mastra agent expects to receive invocation requests from this feature |
| 20 (Workflow B Agenda Agent) | Mastra agent expects to receive invocation requests from this feature |
| 30 (UI Workflow Trigger) | UI trigger buttons call these endpoints |

---

## 7. Integration with Larger Product Roadmap

Feature 17 sits on the critical path of the entire system:

```
00 → 01 → 04 → 07 → 11 → 12 → 13 → 14 → 17 → 19/20 → 21 → 33
```

It is the bridge between the API data layer (Features 10, 11, 14) and the Mastra intelligence layer (Features 18, 19, 20). No end-to-end automation is possible without it.

---

## 8. Out of Scope

- The LLM agent logic within Mastra (Features 19 and 20).
- The Mastra runtime setup and infrastructure (Feature 18).
- Status reconciliation logic — Feature 13 provides this; Workflow B invokes it but does not implement it.
- WebSocket / real-time push notifications for workflow completion. V1 is polling-only.
- Scheduled or cron-based workflow triggers.
- Retrying failed workflows automatically (V1: manual re-trigger by user).
