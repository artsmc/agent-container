# GS — Gherkin Specification
## Feature 17: Workflow Orchestration

**Feature Name:** workflow-orchestration
**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

## Feature: Trigger Workflow A (Intake)

```gherkin
Background:
  Given the API is running
  And the database contains a client with id "client-abc"
  And the authenticated user has role "account_manager"
  And the user has access to client "client-abc"
  And the database contains a transcript with id "transcript-xyz" belonging to client "client-abc"
  And no active workflow run exists for client "client-abc" with type "intake"
```

---

### Scenario: Successfully trigger Workflow A

```gherkin
Given I am authenticated as an account manager with access to client "client-abc"
When I POST to /workflows/intake with body:
  """
  {
    "client_id": "client-abc",
    "transcript_id": "transcript-xyz"
  }
  """
Then the response status is 202
And the response body contains:
  | field           | value     |
  | workflow_type   | intake    |
  | status          | pending   |
And the response body contains a non-null "workflow_run_id"
And the response body contains a "poll_url" matching "/workflows/{workflow_run_id}/status"
And a workflow run record exists in the database with status "pending"
And an audit log entry exists with action "workflow.triggered" and workflow_type "intake"
And the Mastra Workflow A agent was invoked asynchronously with the workflow_run_id, client_id, and transcript_id
```

---

### Scenario: Trigger Workflow A without authentication

```gherkin
Given I am not authenticated
When I POST to /workflows/intake with a valid body
Then the response status is 401
And the response error code is "UNAUTHORIZED"
And no workflow run record is created
```

---

### Scenario: Trigger Workflow A with insufficient role (team_member)

```gherkin
Given I am authenticated as a user with role "team_member"
When I POST to /workflows/intake with a valid body
Then the response status is 403
And the response error code is "FORBIDDEN"
And no workflow run record is created
```

---

### Scenario: Admin role can trigger Workflow A

```gherkin
Given I am authenticated as a user with role "admin"
When I POST to /workflows/intake with a valid body
Then the response status is 202
And a workflow run record is created
```

---

### Scenario: Trigger Workflow A for a client the user cannot access

```gherkin
Given I am authenticated as an account manager
And I do not have access to client "client-other"
When I POST to /workflows/intake with body:
  """
  {
    "client_id": "client-other",
    "transcript_id": "transcript-xyz"
  }
  """
Then the response status is 403
And the response error code is "FORBIDDEN"
```

---

### Scenario: Trigger Workflow A with a non-existent transcript_id

```gherkin
Given I am authenticated as an account manager with access to client "client-abc"
When I POST to /workflows/intake with body:
  """
  {
    "client_id": "client-abc",
    "transcript_id": "non-existent-uuid"
  }
  """
Then the response status is 422
And the response error code is "TRANSCRIPT_NOT_FOUND"
And no workflow run record is created
```

---

### Scenario: Trigger Workflow A when an active run already exists

```gherkin
Given an active workflow run exists for client "client-abc" with workflow_type "intake" and status "running"
When I POST to /workflows/intake with body:
  """
  {
    "client_id": "client-abc",
    "transcript_id": "transcript-xyz"
  }
  """
Then the response status is 409
And the response error code is "WORKFLOW_ALREADY_RUNNING"
And no new workflow run record is created
```

---

### Scenario: Trigger Workflow A when a pending run exists

```gherkin
Given an active workflow run exists for client "client-abc" with workflow_type "intake" and status "pending"
When I POST to /workflows/intake with a valid body for client "client-abc"
Then the response status is 409
And the response error code is "WORKFLOW_ALREADY_RUNNING"
```

---

### Scenario: Trigger Workflow A when a completed run exists (allowed)

```gherkin
Given a completed workflow run exists for client "client-abc" with workflow_type "intake" and status "completed"
When I POST to /workflows/intake with a valid body for client "client-abc"
Then the response status is 202
And a new workflow run record is created with status "pending"
```

---

### Scenario: Trigger Workflow A with missing required fields

```gherkin
When I POST to /workflows/intake with body:
  """
  {
    "client_id": "client-abc"
  }
  """
Then the response status is 422
And the response error code is "VALIDATION_ERROR"
And the details contain a field error for "transcript_id"
```

---

## Feature: Trigger Workflow B (Agenda)

```gherkin
Background:
  Given the API is running
  And the database contains a client with id "client-abc"
  And the authenticated user has role "account_manager"
  And the user has access to client "client-abc"
  And no active workflow run exists for client "client-abc" with type "agenda"
```

---

### Scenario: Successfully trigger Workflow B when completed tasks exist

```gherkin
Given status reconciliation for client "client-abc" returns at least one completed task
When I POST to /workflows/agenda with body:
  """
  {
    "client_id": "client-abc"
  }
  """
Then the response status is 202
And the response body contains:
  | field         | value   |
  | workflow_type | agenda  |
  | status        | pending |
And the response body contains a non-null "workflow_run_id"
And a workflow run record is created with workflow_type "agenda" and status "pending"
And an audit log entry exists with action "workflow.triggered" and workflow_type "agenda"
And the Mastra Workflow B agent was invoked asynchronously
```

---

### Scenario: Trigger Workflow B with no completed tasks (warning returned)

```gherkin
Given status reconciliation for client "client-abc" returns zero completed tasks
When I POST to /workflows/agenda with body:
  """
  {
    "client_id": "client-abc"
  }
  """
Then the response status is 422
And the response error code is "NO_COMPLETED_TASKS"
And the response message contains a human-readable warning
And no workflow run record is created
And the Mastra agent is NOT invoked
```

---

### Scenario: Trigger Workflow B with explicit cycle range

```gherkin
Given at least one task was completed for client "client-abc" between "2026-02-01" and "2026-02-28"
When I POST to /workflows/agenda with body:
  """
  {
    "client_id": "client-abc",
    "cycle_start": "2026-02-01",
    "cycle_end": "2026-02-28"
  }
  """
Then the response status is 202
And the workflow run record contains input_refs with cycle_start "2026-02-01" and cycle_end "2026-02-28"
```

---

### Scenario: Trigger Workflow B with cycle range that has no completed tasks

```gherkin
Given no tasks were completed for client "client-abc" between "2025-01-01" and "2025-01-02"
When I POST to /workflows/agenda with body:
  """
  {
    "client_id": "client-abc",
    "cycle_start": "2025-01-01",
    "cycle_end": "2025-01-02"
  }
  """
Then the response status is 422
And the response error code is "NO_COMPLETED_TASKS"
```

---

### Scenario: Trigger Workflow B without authentication

```gherkin
Given I am not authenticated
When I POST to /workflows/agenda with a valid body
Then the response status is 401
And the response error code is "UNAUTHORIZED"
```

---

### Scenario: Trigger Workflow B with insufficient role

```gherkin
Given I am authenticated as a user with role "team_member"
When I POST to /workflows/agenda with a valid body
Then the response status is 403
And the response error code is "FORBIDDEN"
```

---

## Feature: Poll Workflow Status

```gherkin
Background:
  Given the API is running
  And a workflow run with id "run-001" exists for client "client-abc"
  And the authenticated user has access to client "client-abc"
```

---

### Scenario: Check status of a pending workflow run

```gherkin
Given the workflow run "run-001" has status "pending"
When I GET /workflows/run-001/status
Then the response status is 200
And the response body contains status "pending"
And the result field is null
And the error field is null
```

---

### Scenario: Check status of a running workflow

```gherkin
Given the workflow run "run-001" has status "running"
When I GET /workflows/run-001/status
Then the response status is 200
And the response body contains status "running"
And the result field is null
```

---

### Scenario: Check status of a completed Workflow A run

```gherkin
Given the workflow run "run-001" is of type "intake" and has status "completed"
And the result contains task short IDs ["TSK-0010", "TSK-0011"]
When I GET /workflows/run-001/status
Then the response status is 200
And the response body contains status "completed"
And the result.task_short_ids contains ["TSK-0010", "TSK-0011"]
And the error field is null
And completed_at is not null
```

---

### Scenario: Check status of a completed Workflow B run

```gherkin
Given the workflow run "run-001" is of type "agenda" and has status "completed"
And the result contains agenda short ID "AGD-0005"
When I GET /workflows/run-001/status
Then the response status is 200
And the response body contains status "completed"
And the result.agenda_short_id is "AGD-0005"
```

---

### Scenario: Check status of a failed workflow run

```gherkin
Given the workflow run "run-001" has status "failed"
And the error contains code "MASTRA_PROCESSING_ERROR" and a message
When I GET /workflows/run-001/status
Then the response status is 200
And the response body contains status "failed"
And the error field contains code "MASTRA_PROCESSING_ERROR"
And the result field is null
```

---

### Scenario: Poll status for a non-existent workflow run

```gherkin
When I GET /workflows/non-existent-uuid/status
Then the response status is 404
And the response error code is "WORKFLOW_RUN_NOT_FOUND"
```

---

### Scenario: Poll status for a workflow run belonging to a different client

```gherkin
Given workflow run "run-001" belongs to client "client-abc"
And I am authenticated as a user who only has access to client "client-other"
When I GET /workflows/run-001/status
Then the response status is 403
And the response error code is "FORBIDDEN"
```

---

### Scenario: Timed-out run is lazily marked as failed on poll

```gherkin
Given the workflow run "run-001" has status "running"
And the run was last updated more than 5 minutes ago
When I GET /workflows/run-001/status
Then the run status is updated to "failed" in the database
And the error code in the run record is "WORKFLOW_TIMEOUT"
And the response body contains status "failed"
And the error.code is "WORKFLOW_TIMEOUT"
And an audit log entry exists with action "workflow.timed_out"
```

---

## Feature: Mastra Status Callback

```gherkin
Background:
  Given the API is running
  And a workflow run with id "run-001" exists with status "pending"
  And I am authenticated as the Mastra service account (client credentials token)
```

---

### Scenario: Mastra transitions run to running

```gherkin
When I PATCH /workflows/run-001/status with body:
  """
  {
    "status": "running"
  }
  """
Then the response status is 200
And the workflow run "run-001" has status "running" in the database
And an audit log entry exists with action "workflow.started"
```

---

### Scenario: Mastra transitions run to completed with task results

```gherkin
Given the workflow run "run-001" has type "intake" and status "running"
When I PATCH /workflows/run-001/status with body:
  """
  {
    "status": "completed",
    "result": {
      "task_short_ids": ["TSK-0010", "TSK-0011"]
    }
  }
  """
Then the response status is 200
And the workflow run "run-001" has status "completed" in the database
And the result contains task_short_ids ["TSK-0010", "TSK-0011"]
And completed_at is set to the current time
And an audit log entry exists with action "workflow.completed"
```

---

### Scenario: Mastra transitions run to failed with error detail

```gherkin
Given the workflow run "run-001" has status "running"
When I PATCH /workflows/run-001/status with body:
  """
  {
    "status": "failed",
    "error": {
      "code": "TRANSCRIPT_PARSE_ERROR",
      "message": "Unable to extract action items from transcript."
    }
  }
  """
Then the response status is 200
And the workflow run "run-001" has status "failed" in the database
And the error field contains code "TRANSCRIPT_PARSE_ERROR"
And an audit log entry exists with action "workflow.failed"
```

---

### Scenario: Mastra status callback rejected for non-service-account token

```gherkin
Given I am authenticated as a regular user (not the Mastra service account)
When I PATCH /workflows/run-001/status with a valid body
Then the response status is 403
And the response error code is "FORBIDDEN"
And the workflow run status is not changed
```

---

### Scenario: Invalid status transition (pending to completed)

```gherkin
Given the workflow run "run-001" has status "pending"
When I PATCH /workflows/run-001/status with body:
  """
  { "status": "completed" }
  """
Then the response status is 422
And the response error code is "INVALID_STATUS_TRANSITION"
And the workflow run status remains "pending"
```
