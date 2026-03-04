# Feature Requirements Document
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03
**Status:** Specification

---

## 1. Business Objective

iExcel account managers currently build Asana tasks manually after each internal "intake" call. This process requires the account manager to interpret call content, structure task descriptions, assign team members, estimate effort, and create each ticket by hand in Asana. This manual effort is time-consuming, introduces inconsistency between account managers, and represents a single point of failure if the responsible person is unavailable.

Feature 19 automates this task creation step by implementing the Mastra agent responsible for Workflow A (Post-Intake to Build Tickets). The agent receives a normalized intake call transcript, extracts all action items assigned to iExcel team members, and produces structured draft tasks that are saved to the database via the API layer. Human review and approval remain required before tasks are pushed to Asana.

---

## 2. Problem Being Solved

The manual task-building process has three core failure modes:

1. **Inconsistency.** Different account managers write task descriptions with varying levels of detail, missing context, or non-standard formatting. Executing team members receive uneven quality of information.
2. **Time cost.** After each intake call, the account manager spends significant time reviewing the transcript, extracting action items, and formatting tickets — work that follows a repeatable pattern and is suitable for automation.
3. **Coverage risk.** Action items can be missed when manually reviewing a transcript. An automated extraction step reduces the likelihood of tasks being overlooked.

---

## 3. Feature Description

The intake agent is a Mastra agent that implements one focused capability: given a `NormalizedTranscript` from an intake call, produce a set of `NormalizedTask` objects and persist them as drafts via the API.

The agent operates within these boundaries:
- It receives a `NormalizedTranscript` (already normalized by Feature 08 — Input Normalizer Text), not raw Grain data.
- It calls `POST /clients/{id}/tasks` through the `api-client` package to save each draft task.
- It returns the list of created task short IDs to the workflow orchestration layer (Feature 17).
- It does not push tasks to Asana, approve tasks, or interact with Asana directly.

---

## 4. User Stories

### US-01: Account Manager Initiates Intake Workflow
As an account manager, after completing an intake call, I want to trigger the intake workflow from the UI or terminal so that draft tasks are automatically generated from the call transcript without manual extraction.

**Acceptance Criteria:**
- The account manager provides a `client_id` and `transcript_id` to the workflow trigger endpoint.
- Within the workflow execution, the agent generates one or more draft tasks corresponding to action items discussed in the transcript.
- Each generated task appears in the task review queue with `status = draft`.

### US-02: Consistent Task Description Format
As an executing team member, I want every agent-generated task to have a description in the standard three-section format (Task Context, Additional Context, Requirements) so that I always know where to look for background, context, and execution steps.

**Acceptance Criteria:**
- Every task description produced by the agent contains all three sections: Task Context, Additional Context, and Requirements.
- The Task Context section includes conversational text referencing the transcript, including direct quotes with call dates where applicable.
- No section is left empty — the agent must produce substantive content for all three.

### US-03: Accurate Assignee Extraction
As an account manager, I want the agent to correctly identify which iExcel team member is responsible for each task based on the transcript so that tasks arrive pre-assigned and I only need to correct errors rather than assign from scratch.

**Acceptance Criteria:**
- The agent extracts assignee from the transcript where it is explicitly mentioned.
- For ambiguous or unmentioned assignees, the agent leaves the field as null rather than guessing.
- The account manager can correct the assignee during the human review step.

### US-04: Effort Estimates on Every Task
As an account manager reviewing draft tasks, I want each task to include an estimated time in `hh:mm` format so that I can assess workload during the review step without having to manually estimate each item.

**Acceptance Criteria:**
- Every agent-generated task includes an `estimatedTime` value.
- If the transcript specifies a time estimate, that estimate is used.
- If no estimate is mentioned, the agent applies industry best-practice norms based on the nature of the task.
- Estimates are expressed as ISO 8601 duration strings (e.g., `PT2H30M`).

### US-05: Graceful Handling of Empty Transcripts
As a system operator, I want the agent to handle intake calls with no extractable action items gracefully so that the workflow completes without errors even when a transcript yields no tasks.

**Acceptance Criteria:**
- If no action items are found, the agent returns a completed status with an empty task list and a human-readable explanation (e.g., "No action items assigned to iExcel team members were identified in this transcript.").
- The workflow run is marked `completed` with zero tasks created.
- No error is thrown. The account manager is informed via the workflow status response.

### US-06: Client Scoping
As a system, all tasks generated by the agent must be scoped to the triggering client so that cross-client data leakage is impossible.

**Acceptance Criteria:**
- Every task created by the agent carries the `client_id` from the workflow invocation context.
- The agent does not combine data from multiple clients in a single run.
- The `transcript_id` used is validated to belong to the specified `client_id` by the API layer before the agent is invoked (Feature 17 precondition check).

---

## 5. Success Metrics

| Metric | Target |
|---|---|
| Task extraction coverage | Agent extracts 90%+ of identifiable action items from test transcripts |
| Description completeness | 100% of generated tasks have all three description sections populated |
| Assignee detection rate | Correctly identifies assignee in 80%+ of cases where transcript explicitly mentions one |
| Workflow completion rate | Less than 2% of intake workflow runs fail due to agent error |
| Human edit rate | Average less than 2 edits per task before approval (baseline — measured post-launch) |

---

## 6. Business Constraints

- The agent must use the `api-client` package for all API calls — no direct database or Asana access.
- All tasks are created as `status = draft`. The push-to-Asana step requires explicit human approval.
- The agent runs on the Mastra runtime established in Feature 18. It cannot depend on infrastructure outside that runtime.
- Workflow A is always manually triggered. There is no automated Grain polling in V1.
- The agent is transcript-source-agnostic: it consumes `NormalizedTranscript` format regardless of whether the original source was Grain, manual paste, or any future source.

---

## 7. Out of Scope

- Grain API integration or raw transcript fetching (Feature 08 handles normalization)
- Asana task push (approval-gated, handled by API adapter)
- Task approval or editing UI (Feature 30)
- Workflow triggering and orchestration (Feature 17)
- Mastra runtime setup (Feature 18)
- Input normalization (Feature 08)
- Historical transcript reprocessing (uses the same agent logic, invoked differently — see api-prd.md)

---

## 8. Dependencies

| Feature | Role |
|---|---|
| 01 — shared-types-package | `NormalizedTranscript`, `NormalizedTask`, `TaskDescription`, `CreateTaskRequest` interfaces |
| 08 — input-normalizer-text | Produces the `NormalizedTranscript` consumed by this agent |
| 11 — task-endpoints | API endpoints the agent calls to save draft tasks |
| 17 — workflow-orchestration | Invokes this agent and handles workflow run lifecycle |
| 18 — mastra-runtime-setup | Mastra runtime, service token manager, api-client wiring |
| 22 — api-client-package | Typed API client used to call `POST /clients/{id}/tasks` |
