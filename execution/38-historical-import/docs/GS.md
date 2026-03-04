# Gherkin Specification
# Feature 38: Historical Import

---

## Feature: Trigger Historical Import

### Background
```gherkin
Given the iExcel API is running
And the account manager has a valid Bearer token with role "account_manager"
And client "Total Life" exists with UUID "client-uuid-001"
And the account manager is assigned to "Total Life"
And the Grain API key is configured
And the Asana adapter is configured with valid credentials
```

---

### Scenario: Successfully trigger a historical import with both Grain and Asana sources

```gherkin
When the account manager sends POST to "/clients/client-uuid-001/import"
  With body:
    """
    {
      "grain_playlist_id": "grain-playlist-abc",
      "asana_project_id": "asana-proj-123",
      "asana_workspace_id": "asana-ws-456",
      "reprocess_transcripts": false
    }
    """
Then the API creates an import job with status "pending"
And the API returns 202 Accepted with:
  | job_id    | <new UUID>         |
  | client_id | client-uuid-001    |
  | status    | pending            |
And an audit log entry "import.started" is written for client-uuid-001
```

---

### Scenario: Trigger import with only a Grain playlist source

```gherkin
When the account manager sends POST to "/clients/client-uuid-001/import"
  With body:
    """
    { "grain_playlist_id": "grain-playlist-abc" }
    """
Then the API creates an import job for transcript-only import
And the job has asana_project_id = null
And the API returns 202 Accepted
```

---

### Scenario: Trigger import with only an Asana project source

```gherkin
When the account manager sends POST to "/clients/client-uuid-001/import"
  With body:
    """
    {
      "asana_project_id": "asana-proj-123",
      "asana_workspace_id": "asana-ws-456"
    }
    """
Then the API creates an import job for task-only import
And the job has grain_playlist_id = null
And the API returns 202 Accepted
```

---

### Scenario: Trigger fails if neither source is provided

```gherkin
When the account manager sends POST to "/clients/client-uuid-001/import"
  With body:
    """
    { "reprocess_transcripts": false }
    """
Then the API returns 400 with error code "INVALID_BODY"
And the error message indicates at least one source must be provided
```

---

### Scenario: Trigger fails if asana_project_id provided but no workspace resolvable

```gherkin
Given client "Total Life" has no "default_asana_workspace_id" configured
When the account manager sends POST with asana_project_id "proj-123" but no asana_workspace_id
Then the API returns 422 with error code "WORKSPACE_NOT_CONFIGURED"
And no import job is created
```

---

### Scenario: Trigger fails if another import is already in progress

```gherkin
Given an import job for "Total Life" is currently in status "in_progress"
When the account manager triggers another import for "Total Life"
Then the API returns 409 with error code "IMPORT_IN_PROGRESS"
And the response includes the existing job_id
And no new import job is created
```

---

### Scenario: Team Member cannot trigger an import

```gherkin
Given the authenticated user has role "team_member"
When the user sends POST to "/clients/client-uuid-001/import"
Then the API returns 403 with error code "FORBIDDEN"
And no import job is created
```

---

### Scenario: Account Manager cannot trigger import for unassigned client

```gherkin
Given the account manager is NOT assigned to client "Other Corp"
When the account manager sends POST to "/clients/other-corp-uuid/import"
Then the API returns 404 with error code "CLIENT_NOT_FOUND"
And no import job is created
```

---

## Feature: Poll Import Status

### Scenario: Poll status while import is in progress

```gherkin
Given an import job "job-uuid-001" exists for "Total Life" with status "in_progress"
And 12 of 30 transcripts have been imported so far
When the account manager sends GET to "/clients/client-uuid-001/import/status"
Then the API returns 200 OK with:
  | status                          | in_progress |
  | progress.transcripts_imported   | 12          |
  | progress.transcripts_total      | 30          |
```

---

### Scenario: Poll status returns most recent job when no job_id specified

```gherkin
Given client "Total Life" has two import jobs, the most recent created at "2026-02-20T10:00:00Z"
When the account manager sends GET to "/clients/client-uuid-001/import/status"
Then the response returns the job created at "2026-02-20T10:00:00Z"
```

---

### Scenario: Poll status for a specific job by job_id

```gherkin
Given import jobs "job-uuid-001" and "job-uuid-002" exist for "Total Life"
When the account manager sends GET to "/clients/client-uuid-001/import/status?job_id=job-uuid-001"
Then the response returns the status for "job-uuid-001"
```

---

### Scenario: Poll status returns completed when import finishes

```gherkin
Given the import job completed successfully
Then the GET import/status response includes:
  | status       | completed   |
  | completed_at | <timestamp> |
And progress counts match the total records imported
```

---

### Scenario: Poll status for client with no import jobs returns 404

```gherkin
Given client "Total Life" has never had an import triggered
When the account manager sends GET to "/clients/client-uuid-001/import/status"
Then the API returns 404 with error code "IMPORT_JOB_NOT_FOUND"
```

---

## Feature: Transcript Import from Grain

### Scenario: Historical transcript is imported and flagged as imported

```gherkin
Given the import job fetches Grain recording "rec-hist-001" from playlist "grain-playlist-abc"
And the Grain API returns a valid transcript for "rec-hist-001"
When the transcript import phase runs
Then a new row is created in the "transcripts" table with:
  | grain_call_id   | rec-hist-001          |
  | client_id       | client-uuid-001       |
  | is_imported     | true                  |
  | import_source   | grain-playlist-abc    |
  | imported_at     | <current timestamp>   |
  | call_type       | client_call           |
And the transcript's call_date matches the Grain recording's started_at
```

---

### Scenario: Duplicate transcript is skipped on resume

```gherkin
Given a transcript with grain_call_id "rec-hist-001" and is_imported = true already exists for "Total Life"
When the import job attempts to import "rec-hist-001" again
Then the record is skipped (not re-imported, not overwritten)
And no error is logged for this record
And the import continues to the next recording
```

---

### Scenario: Grain API error on one recording does not abort the full import

```gherkin
Given the Grain playlist contains recordings "rec-001", "rec-002", "rec-003"
And the Grain API returns 404 for "rec-002"
When the transcript import phase runs
Then "rec-001" and "rec-003" are imported successfully
And an error is logged in import_job_errors for "rec-002" with code "GRAIN_RECORDING_NOT_FOUND"
And the import job status is "completed" (not "failed") at the end
And progress shows transcripts_imported = 2
```

---

### Scenario: call_type_override sets call type for all imported transcripts

```gherkin
Given the import job was created with call_type_override "intake"
When transcripts are imported from the Grain playlist
Then all imported transcripts have call_type = "intake"
```

---

## Feature: Task Import from Asana

### Scenario: Historical Asana task is imported and flagged

```gherkin
Given the Asana project "asana-proj-123" contains task with GID "asana-task-gid-001"
And the Asana task is completed
When the task import phase runs
Then a new row is created in the "tasks" table with:
  | asana_task_id   | asana-task-gid-001           |
  | client_id       | client-uuid-001              |
  | status          | completed                    |
  | is_imported     | true                         |
  | import_source   | asana-proj-123               |
  | imported_at     | <current timestamp>          |
And the task's short_id follows the "TSK-XXXX" format
And the task's external_ref JSONB includes provider "asana" and taskId "asana-task-gid-001"
```

---

### Scenario: Incomplete Asana task is imported with status "pushed"

```gherkin
Given the Asana task "asana-task-gid-002" is not completed
When the task import phase runs for this task
Then the imported task has status = "pushed"
And the imported task has is_imported = true
```

---

### Scenario: Duplicate Asana task is skipped on resume

```gherkin
Given a task with external_ref->>'taskId' = "asana-task-gid-001" and is_imported = true already exists
When the import job attempts to import "asana-task-gid-001" again
Then the record is skipped
And no error is logged
```

---

### Scenario: Asana API error on one task does not abort full import

```gherkin
Given the Asana project contains tasks "gid-001", "gid-002", "gid-003"
And the Asana API returns an error for "gid-002"
When the task import phase runs
Then "gid-001" and "gid-003" are imported successfully
And an error is logged in import_job_errors for "gid-002"
And the import continues and completes
```

---

## Feature: Read-Only Enforcement on Imported Records

### Scenario: Account Manager cannot edit an imported task

```gherkin
Given task "TSK-0001" has is_imported = true
When the account manager sends PATCH to "/tasks/TSK-0001"
  With body: { "title": "Updated title" }
Then the API returns 422 with error code "IMPORT_RECORD_READ_ONLY"
And the task record is not modified
```

---

### Scenario: Account Manager cannot approve an imported task

```gherkin
Given task "TSK-0002" has is_imported = true
When the account manager sends POST to "/tasks/TSK-0002/approve"
Then the API returns 422 with error code "IMPORT_RECORD_READ_ONLY"
And the task status does not change
```

---

### Scenario: Account Manager cannot push an imported task to Asana

```gherkin
Given task "TSK-0003" has is_imported = true and status = "completed"
When the account manager sends POST to "/tasks/TSK-0003/push"
Then the API returns 422 with error code "IMPORT_RECORD_READ_ONLY"
And no Asana API call is made
```

---

### Scenario: Imported task is readable through existing GET endpoints

```gherkin
Given task "TSK-0004" has is_imported = true
When the account manager sends GET to "/tasks/TSK-0004"
Then the API returns 200 OK with the task record
And the response includes "is_imported": true
```

---

### Scenario: Imported task appears in client task list

```gherkin
Given client "Total Life" has 5 regular tasks and 10 imported tasks
When the account manager sends GET to "/clients/client-uuid-001/tasks"
Then the response includes all 15 tasks
And each imported task has "is_imported": true in the response
```

---

## Feature: Optional Mastra Reprocessing

### Scenario: Reprocess transcripts generates historical task records

```gherkin
Given the import job was created with reprocess_transcripts = true
And the import job has imported transcript "transcript-uuid-001" from Grain
When the job runner invokes Workflow A on "transcript-uuid-001"
Then the Mastra agent generates draft tasks from the transcript
And those draft tasks are created in the "tasks" table with:
  | is_imported   | true                       |
  | imported_at   | <same as transcript>       |
  | import_source | <grain_playlist_id>        |
  | status        | draft                      |
And the tasks are NOT auto-approved
```

---

### Scenario: Reprocessing failure for one transcript does not abort the import

```gherkin
Given reprocess_transcripts = true and 3 transcripts are imported
And Workflow A fails for transcript "transcript-uuid-002"
When the job runner processes reprocessing
Then an error is logged for "transcript-uuid-002" in import_job_errors
And reprocessing continues for "transcript-uuid-001" and "transcript-uuid-003"
And the import job completes (not failed) at the end
```

---

### Scenario: Import with reprocess_transcripts = false skips Mastra invocation

```gherkin
Given the import job was created with reprocess_transcripts = false
And 5 transcripts are imported from Grain
Then Workflow A is never invoked during the import job
And no new task records are created during the import phase
```

---

## Feature: Import Partial Recovery

### Scenario: Restarting a failed import skips already-imported records

```gherkin
Given a previous import job imported transcripts for recordings "rec-001" and "rec-002"
And the job failed before importing "rec-003"
When the account manager triggers a new import for the same client
Then the new import job skips "rec-001" and "rec-002" (already imported)
And only "rec-003" is imported in the new job
```
