# FRD — Feature Requirement Document
## Feature 30: UI Workflow Trigger

**Version:** 1.0
**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)
**Route:** `/workflows/new`

---

## 1. Business Objectives

### 1.1 Primary Objective

Provide account managers with a self-service screen to manually trigger iExcel's two core Mastra workflows — the Post-Intake workflow (transcript to Asana draft tasks) and the Pre-Call workflow (completed tasks to agenda Running Notes) — without needing terminal access, developer involvement, or direct Mastra interaction.

### 1.2 Business Value

| Value Driver | Description |
|---|---|
| Workflow accessibility | Account managers trigger complex AI workflows through a point-and-click form instead of a terminal command |
| Reduced error surface | Structured form with validation ensures required inputs (client, transcript, dates) are always provided before triggering |
| Real-time feedback | Progress indicator during Mastra processing keeps the account manager informed rather than leaving them with a blank screen |
| Seamless handoff | Automatic navigation to the results screen (task review or agenda editor) immediately after completion removes manual navigation steps |
| Audit trail | Every workflow trigger creates a workflow run record — the form ensures that record has complete, valid data |

### 1.3 Strategic Context

The Workflow Trigger screen is the entry point to the iExcel automation pipeline for account managers. All value produced by Mastra agents (Features 19 and 20) can only be accessed through this screen or the terminal interface (Feature 33). The UI path is the primary workflow for non-technical account managers.

This screen sits immediately downstream of account manager intake calls and upstream of the task review (Feature 27) and agenda editor (Feature 28) screens. Its reliability and usability directly affect whether the automation is adopted in daily practice.

---

## 2. Target Users

### 2.1 Primary User: Account Manager

| Attribute | Detail |
|---|---|
| Who | iExcel internal account managers who conduct client intake calls |
| Technical level | Non-technical — comfortable with web forms, not terminal commands |
| Access level | Full access to trigger both workflow types for any assigned client |
| Primary trigger (Workflow A) | Immediately after an intake call — pastes or uploads the Grain transcript |
| Primary trigger (Workflow B) | Before a follow-up call — selects cycle date range to build agenda |
| Device | Desktop browser |

### 2.2 Secondary User: Admin

Admins have the same capabilities as account managers for workflow triggering, plus they can trigger workflows for any client (not just assigned ones). Admin access follows the same screen and interaction pattern.

---

## 3. Use Cases

### UC-01: Trigger Post-Intake Workflow via Transcript Paste

**Actor:** Account Manager
**Trigger:** Account manager has just completed a client intake call and has the Grain transcript available
**Outcome:** Transcript is submitted, Workflow A is triggered, task review screen loads with generated draft tasks

### UC-02: Trigger Post-Intake Workflow via File Upload

**Actor:** Account Manager
**Trigger:** Account manager has a transcript saved as a `.txt` file
**Outcome:** File is uploaded as transcript content, Workflow A is triggered, task review screen loads

### UC-03: Trigger Pre-Call Agenda Workflow

**Actor:** Account Manager
**Trigger:** Upcoming client follow-up call, account manager needs to build an agenda
**Outcome:** Workflow B is triggered with specified cycle date range, agenda editor loads with generated Running Notes

### UC-04: Observe Workflow Progress

**Actor:** Account Manager
**Trigger:** After form submission, workflow is processing
**Outcome:** Account manager sees real-time status updates (pending, processing, complete) while Mastra processes

### UC-05: Handle Workflow Failure

**Actor:** Account Manager
**Trigger:** Mastra agent encounters an error during processing
**Outcome:** Account manager sees a clear error message with context, can retry or return to the dashboard

### UC-06: Handle No Completed Tasks (Agenda Workflow)

**Actor:** Account Manager
**Trigger:** Account manager triggers Workflow B but no completed tasks exist for the client in the cycle period
**Outcome:** Warning is displayed explaining that no completed tasks were found for the selected period; user can adjust the date range or cancel

---

## 4. Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Form submission success rate | > 95% of valid submissions reach the processing state | Workflow run records in the database |
| Progress indicator accuracy | Status updates reflect actual Mastra processing state within 5 seconds | Poll latency monitoring |
| Error recovery rate | Account managers can retry or navigate away from error states without page refresh | Error state UX review |
| Time to task review | < 30 seconds from form submission to task review screen load (Mastra processing time dependent) | End-to-end workflow timing |
| Validation catch rate | 100% of invalid form submissions caught before API call | Form validation unit tests |

---

## 5. Business Constraints

### 5.1 Permission Restriction

Only **Account Managers** and **Admins** may trigger workflows. Team Members must not see or access this route. Auth middleware must enforce role-based access control on `/workflows/new`.

### 5.2 Two-Step API Process (Intake Workflow)

The intake workflow requires two sequential API calls:
1. `POST /clients/{id}/transcripts` — submit the transcript
2. `POST /workflows/intake` — trigger the workflow with `client_id` and `transcript_id`

The UI must handle both calls, propagate the `transcript_id` from step 1 into step 2, and handle failures at either step.

### 5.3 Grain Integration Not Available in V1

The Grain transcript selector option must be visually indicated as unavailable in V1 (disabled or hidden). Grain API integration is deferred to Feature 37. The UI may show the option as a placeholder but must not allow interaction with it.

### 5.4 Polling Architecture

Progress updates are retrieved via polling `GET /workflows/{id}/status`, not WebSockets. The polling interval must be configurable (default: 3 seconds) and must stop when a terminal state is reached (`complete` or `failed`).

### 5.5 Dependencies

- Feature 23 (ui-scaffolding): `DashboardLayout.tsx` and `ui-tokens` package must exist
- Feature 24 (ui-auth-flow): Auth session and role must be available to enforce permission check
- Feature 22 (api-client-package): All API calls go through the typed `api-client`
- Feature 17 (workflow-orchestration): The workflow API endpoints must be deployed

---

## 6. Integration with Product Roadmap

This is a **Wave 6** feature (per Spec Generation Waves in `index.md`). It depends on Features 25 (ui-dashboard) and 22 (api-client-package).

It is a leaf node — nothing depends on it — but it is the direct entry point to the two primary automation workflows. Without it, account managers must use the terminal interface (Feature 33) to trigger workflows. The Workflow Trigger screen is the primary UI path for account managers without terminal access.

---

## 7. Out of Scope (V1)

- Grain API transcript selection (Feature 37 — V2)
- Scheduled or automatic workflow triggering
- Workflow history or run log page
- WebSocket-based real-time updates (polling only)
- Batch workflow triggering (multiple clients at once)
- Transcript editing or preview before submission
- Workflow cancellation after triggering
