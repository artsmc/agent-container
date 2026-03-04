# Gherkin Specification
# Feature 13: Status Reconciliation

**Phase:** Phase 3 — External Integrations & Workflows
**Date:** 2026-03-03

---

```gherkin
Feature: Status Reconciliation
  As the API layer orchestrating agenda generation
  I need to reconcile pushed task status with live Asana data
  So that the agenda agent receives accurate completion information for each task

  Background:
    Given the API has a database connection to Postgres
    And the API has a configured Asana workspace with a valid access token
    And Asana API responses are mocked at the HTTP layer

  # ---------------------------------------------------------------------------
  # Happy Path Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Successful reconciliation with all tasks matched
    Given client "Total Life" has 3 pushed tasks
    And all 3 tasks belong to Asana project "project-gid-1"
    And the Asana project "project-gid-1" contains those 3 tasks with statuses:
      | asana_task_id | completed |
      | task-gid-a    | true      |
      | task-gid-b    | false     |
      | task-gid-c    | true      |
    When reconcileTasksForClient is called with clientId for "Total Life"
    Then the returned array contains 3 ReconciledTask objects
    And the task with asanaTaskId "task-gid-a" has asanaStatus "completed" and asanaCompleted true
    And the task with asanaTaskId "task-gid-b" has asanaStatus "incomplete" and asanaCompleted false
    And the task with asanaTaskId "task-gid-c" has asanaStatus "completed" and asanaCompleted true
    And the Postgres tasks table is not modified

  Scenario: Tasks span multiple Asana projects
    Given client "Total Life" has 4 pushed tasks
    And 2 tasks belong to Asana project "project-gid-1"
    And 2 tasks belong to Asana project "project-gid-2"
    When reconcileTasksForClient is called with clientId for "Total Life"
    Then exactly 2 Asana API calls are made (one per unique project)
    And the returned array contains 4 ReconciledTask objects
    And each task has its Asana status populated from the correct project response

  Scenario: Asana project response requires pagination
    Given client "Total Life" has 1 pushed task in Asana project "project-gid-1"
    And the project contains 150 tasks total in Asana
    And the first API page returns 100 tasks and a next_page offset
    And the second API page returns the remaining 50 tasks including the pushed task
    When reconcileTasksForClient is called with clientId for "Total Life"
    Then 2 Asana API calls are made for project "project-gid-1" (page 1 and page 2)
    And the pushed task is matched from the second page
    And the returned ReconciledTask has correct asanaStatus

  Scenario: No pushed tasks exist for client
    Given client "Total Life" has 0 pushed tasks
    When reconcileTasksForClient is called with clientId for "Total Life"
    Then the returned array is empty
    And no Asana API calls are made

  Scenario: Completed task includes completed_at timestamp
    Given client "Total Life" has 1 pushed task with asanaTaskId "task-gid-a"
    And Asana reports task "task-gid-a" as completed with completed_at "2026-02-28T14:30:00.000Z"
    When reconcileTasksForClient is called
    Then the returned ReconciledTask has asanaCompletedAt "2026-02-28T14:30:00.000Z"

  Scenario: Internal metadata is preserved in reconciled output
    Given client "Total Life" has a pushed task with:
      | field          | value              |
      | shortId        | TSK-0042           |
      | title          | Setup CI pipeline  |
      | estimatedTime  | 02:30              |
      | scrumStage     | In Progress        |
      | transcriptId   | <some-uuid>        |
    And Asana returns this task as completed
    When reconcileTasksForClient is called
    Then the returned ReconciledTask contains all original Postgres fields unchanged
    And asanaStatus is "completed"

  # ---------------------------------------------------------------------------
  # Unmatched Task Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Task's Asana task ID not found in project fetch results
    Given client "Total Life" has 1 pushed task with asanaTaskId "task-gid-deleted"
    And Asana project "project-gid-1" does not contain "task-gid-deleted" in its task list
    When reconcileTasksForClient is called
    Then the returned ReconciledTask has asanaStatus "not_found"
    And asanaCompleted is null
    And asanaCompletedAt is null
    And a warning log is emitted with reason "task_not_in_project"

  Scenario: Task has null asana_task_id
    Given client "Total Life" has 1 pushed task with asanaTaskId null
    When reconcileTasksForClient is called
    Then the returned ReconciledTask has asanaStatus "not_found"
    And no Asana API call is made for this task
    And a warning log is emitted with reason "missing_asana_task_id"

  Scenario: Task has null asana_project_id
    Given client "Total Life" has 1 pushed task with asanaProjectId null
    When reconcileTasksForClient is called
    Then the returned ReconciledTask has asanaStatus "not_found"
    And no Asana API call is made for this task
    And a warning log is emitted with reason "missing_asana_project_id"

  Scenario: Mix of matched and unmatched tasks
    Given client "Total Life" has 3 pushed tasks:
      | shortId  | asanaTaskId   | asanaProjectId  |
      | TSK-0001 | task-gid-a    | project-gid-1   |
      | TSK-0002 | task-gid-b    | project-gid-1   |
      | TSK-0003 | null          | project-gid-1   |
    And Asana project "project-gid-1" contains task-gid-a (completed) and task-gid-b (incomplete)
    When reconcileTasksForClient is called
    Then the returned array contains 3 ReconciledTask objects
    And TSK-0001 has asanaStatus "completed"
    And TSK-0002 has asanaStatus "incomplete"
    And TSK-0003 has asanaStatus "not_found"

  # ---------------------------------------------------------------------------
  # Error Handling Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Asana returns 401 Unauthorized
    Given client "Total Life" has 1 pushed task in Asana project "project-gid-1"
    And the Asana API returns 401 for all requests
    When reconcileTasksForClient is called
    Then a ReconciliationError is thrown with code "ASANA_AUTH_FAILED"
    And the error propagates to the caller

  Scenario: Asana returns 403 Forbidden
    Given client "Total Life" has 1 pushed task in Asana project "project-gid-1"
    And the Asana API returns 403 for all requests
    When reconcileTasksForClient is called
    Then a ReconciliationError is thrown with code "ASANA_AUTH_FAILED"

  Scenario: Asana returns 404 for one project but not another
    Given client "Total Life" has tasks in 2 projects:
      | projectGid     | taskCount |
      | project-gid-1  | 2         |
      | project-gid-2  | 1         |
    And Asana returns 404 for project "project-gid-1"
    And Asana returns 200 with tasks for project "project-gid-2"
    When reconcileTasksForClient is called
    Then tasks in project "project-gid-1" have asanaStatus "not_found"
    And tasks in project "project-gid-2" are matched correctly
    And no exception is thrown

  Scenario: Asana returns 429 then succeeds on retry
    Given client "Total Life" has 1 pushed task in project "project-gid-1"
    And the Asana API returns 429 with Retry-After: 1 on the first call
    And the Asana API returns 200 on the second call
    When reconcileTasksForClient is called
    Then the reconciliation succeeds after 1 retry
    And the returned task has a valid asanaStatus

  Scenario: Asana returns 429 and all retries are exhausted
    Given client "Total Life" has 1 pushed task in project "project-gid-1"
    And the Asana API returns 429 on all 3 attempts
    When reconcileTasksForClient is called
    Then a ReconciliationError is thrown with code "ASANA_UNAVAILABLE"

  Scenario: Asana request times out
    Given client "Total Life" has 1 pushed task in project "project-gid-1"
    And the Asana API takes longer than 15 seconds to respond
    When reconcileTasksForClient is called
    Then the request is aborted after 15 seconds
    And the timeout is treated as a retryable error
    And after 3 total attempts, a ReconciliationError is thrown with code "ASANA_TIMEOUT"

  Scenario: Asana returns 5xx on first attempt then 200
    Given client "Total Life" has 1 pushed task in project "project-gid-1"
    And Asana returns 503 on the first attempt
    And Asana returns 200 on the second attempt
    When reconcileTasksForClient is called
    Then the reconciliation succeeds
    And a warning is logged for the failed attempt

  # ---------------------------------------------------------------------------
  # Data Integrity Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Postgres tasks table is not modified
    Given client "Total Life" has 2 pushed tasks
    And Asana returns both as completed
    When reconcileTasksForClient is called
    Then no UPDATE statements are executed against the tasks table
    And both tasks still have status "pushed" in Postgres

  Scenario: Multiple concurrent reconciliations for different clients do not interfere
    Given client "Total Life" has 2 pushed tasks
    And client "Acme Corp" has 3 pushed tasks
    When reconcileTasksForClient is called concurrently for both clients
    Then each call returns only tasks for its respective client
    And neither call affects the other's results

  Scenario: Reconciliation returns all internal metadata fields
    Given client "Total Life" has 1 pushed task
    When reconcileTasksForClient is called
    Then the returned ReconciledTask includes:
      | field          |
      | id             |
      | shortId        |
      | title          |
      | description    |
      | assignee       |
      | estimatedTime  |
      | scrumStage     |
      | transcriptId   |
      | asanaProjectId |
      | asanaTaskId    |
      | pushedAt       |

  # ---------------------------------------------------------------------------
  # Logging Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Structured logs are emitted for a successful reconciliation
    Given client "Total Life" has 2 pushed tasks in 1 project
    When reconcileTasksForClient is called successfully
    Then an info log "Reconciliation started" is emitted with clientId and pushedTaskCount
    And a debug log is emitted for the per-project fetch start
    And a debug log is emitted for the per-project fetch complete
    And an info log "Reconciliation completed" is emitted with reconciledCount and durationMs

  Scenario: Access tokens are not included in log output
    Given client "Total Life" has 1 pushed task
    When reconcileTasksForClient is called
    Then no log event at any level contains the Asana access token value
```
