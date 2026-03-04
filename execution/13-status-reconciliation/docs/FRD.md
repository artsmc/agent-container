# Feature Requirement Document
# Feature 13: Status Reconciliation

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Pending Implementation

---

## 1. Business Objective

The iExcel automation system pushes tasks to Asana when they are approved. After push, iExcel team members execute those tasks in Asana throughout the work cycle. At the end of each cycle, an agenda (Running Notes document) must be generated summarizing what was completed and what remains outstanding.

The system has no reliable way to know which Asana tasks have been marked complete unless it queries Asana at the moment the agenda is being built. This feature provides that capability: a function that fetches the live completion status of pushed tasks from Asana and merges it with the internal metadata stored in Postgres, producing a unified dataset ready for agenda generation.

Without this feature, Workflow B (agenda generation) cannot accurately classify tasks as completed versus incomplete, which is the entire premise of the Running Notes document.

---

## 2. Target Users

This feature has no direct end-user interaction. It is an internal service function consumed exclusively by:

- **Workflow B (Feature 20):** The agenda-building Mastra agent that needs a reconciled task list to summarize for the client.
- **The API layer (Feature 14):** The agenda generation endpoint that orchestrates the reconciliation before passing data to the Mastra agent.

Indirect beneficiaries:
- **Account Managers:** Receive accurate agenda documents reflecting the true completion state of tasks.
- **Clients:** Receive Running Notes that correctly categorize their work cycle.

---

## 3. Problem Solved

### 3.1 The State Divergence Problem

Once a task is pushed to Asana (status = `pushed`), Postgres no longer receives status updates from Asana. The iExcel team marks tasks complete, in-progress, or otherwise inside Asana's interface. Postgres remains frozen at `pushed`. By the time agenda generation is triggered, the Postgres status for these tasks is stale by days or weeks.

### 3.2 Why Not Continuous Sync?

A polling or webhook-based continuous sync would require:
- A background service running 24/7
- Handling Asana webhooks (additional infrastructure, reliability concerns)
- Storing and managing sync state
- Rate limit budget consumed continuously, even when no agenda is being generated

The on-demand pattern solves the same problem with far less complexity: fetch live status only when it is actually needed (agenda generation), and discard it after use. Postgres status is not updated — the reconciled data is ephemeral and used only for the duration of agenda generation.

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Reconciliation accuracy | 100% of Postgres pushed tasks for the client have a corresponding Asana status match or an explicit unmatched flag |
| Latency under normal load | Reconciliation completes in under 5 seconds for clients with up to 200 pushed tasks across up to 5 Asana projects |
| Error recovery | Asana API transient failures (429, 503) are retried and do not fail the reconciliation unless all retries are exhausted |
| No data mutation | Zero writes to the Postgres `tasks` table during reconciliation |

---

## 5. Business Constraints

- **Read-only against Postgres.** This function must never modify the `tasks` table. Status is not written back. The `pushed` status in Postgres is a historical record, not a live status field.
- **Always scoped to a single client.** Cross-client reconciliation is never performed in a single call.
- **On-demand only.** Reconciliation is not scheduled or cached between calls. Each agenda generation triggers a fresh fetch from Asana.
- **Part of the API layer.** This is a function inside `apps/api/src/adapters/asana/`, not a standalone service. It has no external HTTP endpoint of its own.

---

## 6. Integration with Product Roadmap

This feature sits on the critical path:

```
12 (output-normalizer-asana) → 13 (status-reconciliation) → 14 (agenda-endpoints) → 20 (workflow-b-agenda-agent)
```

Feature 12 established the `asana_task_id` (or `external_ref.taskId`) on pushed tasks. Feature 13 uses that reference to match against live Asana data. Feature 14 calls Feature 13 when an agenda generation is triggered. Feature 20 (Workflow B) consumes the reconciled dataset to produce the Running Notes summary.

This feature is also the point at which the system's two authoritative sources of truth are bridged: Postgres (internal metadata, task identity) and Asana (live execution status).

---

## 7. Out of Scope

- Periodic or scheduled sync between Postgres and Asana.
- Writing Asana status back to the Postgres `tasks` table.
- Updating Asana tasks from Postgres data.
- Cross-client reconciliation in a single invocation.
- Handling tasks that were deleted from Asana after being pushed (these are treated as unmatched).
- Creating or modifying any Asana tasks.
- Triggering agenda generation itself — that belongs to Feature 14.
