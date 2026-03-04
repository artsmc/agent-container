# GS — Gherkin Specification
## Feature 11: Task Endpoints

**Feature Name:** task-endpoints
**Date:** 2026-03-03

---

## Feature: Short ID Generation

  As the system
  I need to auto-assign globally unique short IDs to tasks
  So that humans can reference tasks by a memorable identifier across any interface

  Background:
    Given the system has a global task sequence starting at 1
    And no short ID is ever reused

  Scenario: First task in the system receives TSK-0001
    Given no tasks exist in the system
    When a new task is created
    Then the task is assigned short_id "TSK-0001"

  Scenario: Short IDs are globally sequential across all clients
    Given client "Alpha Corp" has tasks TSK-0001 through TSK-0005
    And client "Beta LLC" has no tasks
    When a task is created for client "Beta LLC"
    Then the new task is assigned short_id "TSK-0006"

  Scenario: Short IDs grow beyond 4 digits naturally
    Given the system has 9999 tasks
    When a new task is created
    Then the task is assigned short_id "TSK-10000"

  Scenario: Rejected tasks do not free up their short ID
    Given task "TSK-0042" exists with status "rejected"
    When a new task is created
    Then the new task receives a short_id greater than "TSK-0042"
    And "TSK-0042" is never reassigned

---

## Feature: Create Draft Tasks

  As a Mastra agent or authenticated user
  I need to POST an array of draft tasks to a client
  So that intake call output is captured and queued for human review

  Background:
    Given I am authenticated as the Mastra service account
    And client "Total Life" exists with id "client-uuid-abc"
    And transcript "transcript-uuid-xyz" belongs to client "Total Life"

  Scenario: Successfully create a batch of draft tasks
    Given I send a POST to "/clients/client-uuid-abc/tasks" with:
      """
      {
        "transcript_id": "transcript-uuid-xyz",
        "source": "agent",
        "tasks": [
          {
            "title": "Update website copy",
            "description": "**TASK CONTEXT**\n...\n**ADDITIONAL CONTEXT**\n...\n**REQUIREMENTS**\n...",
            "assignee": "Mark",
            "estimated_time": "01:30",
            "scrum_stage": "Backlog"
          },
          {
            "title": "Configure email automation",
            "description": "**TASK CONTEXT**\n...",
            "estimated_time": "02:00"
          }
        ]
      }
      """
    When the request is processed
    Then the response status is 201
    And the response contains 2 task objects
    And task 1 has short_id matching "TSK-\d+"
    And task 2 has a different short_id matching "TSK-\d+"
    And both tasks have status "draft"
    And both tasks have scrum_stage "Backlog"
    And a Task Version record with version 1 and source "agent" exists for each task
    And 2 "task.created" audit entries are written

  Scenario: Task creation with missing required field
    Given I send a POST to "/clients/client-uuid-abc/tasks" with:
      """
      {
        "transcript_id": "transcript-uuid-xyz",
        "tasks": [
          { "description": "Some description" }
        ]
      }
      """
    When the request is processed
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"
    And the validation_errors contain an error for field "tasks[0].title"

  Scenario: Task creation for inaccessible client
    Given I am authenticated as user "jane" who does not have access to client "Total Life"
    When I send a POST to "/clients/client-uuid-abc/tasks"
    Then the response status is 404
    And the error code is "CLIENT_NOT_FOUND"

  Scenario: Transcript ID does not belong to the client
    Given transcript "other-transcript-uuid" belongs to client "Alpha Corp"
    When I POST tasks to client "Total Life" with transcript_id "other-transcript-uuid"
    Then the response status is 422
    And the error code is "TRANSCRIPT_NOT_FOUND"

  Scenario: Caller cannot supply a custom short_id
    Given the request body includes "short_id": "TSK-9999" for a task
    When the request is processed
    Then the created task has a system-assigned short_id, not "TSK-9999"
    And no error is returned

---

## Feature: List Tasks

  As an authenticated user
  I need to list tasks for a client with optional filters
  So that I can review pending work and locate specific tasks

  Background:
    Given I am authenticated as account manager "mark"
    And client "Total Life" has 5 draft tasks, 3 approved tasks, and 2 pushed tasks

  Scenario: List all tasks for a client (no filter)
    When I GET "/clients/client-uuid-abc/tasks"
    Then the response status is 200
    And the response contains 10 tasks
    And results are ordered by created_at descending

  Scenario: List tasks filtered by status
    When I GET "/clients/client-uuid-abc/tasks?status=draft"
    Then the response status is 200
    And all returned tasks have status "draft"
    And the response contains 5 tasks

  Scenario: List tasks filtered by transcript
    Given 3 tasks are linked to transcript "transcript-uuid-xyz"
    When I GET "/clients/client-uuid-abc/tasks?transcript_id=transcript-uuid-xyz"
    Then the response status is 200
    And the response contains 3 tasks

  Scenario: Pagination returns correct page
    Given 25 draft tasks exist for the client
    When I GET "/clients/client-uuid-abc/tasks?status=draft&page=2&per_page=10"
    Then the response status is 200
    And the response contains 10 tasks
    And the pagination object shows total 25 and total_pages 3

  Scenario: per_page exceeding maximum is capped
    When I GET "/clients/client-uuid-abc/tasks?per_page=500"
    Then the response status is 200
    And the response contains at most 100 tasks

---

## Feature: Get Task Detail

  As an authenticated user
  I need to retrieve a specific task by UUID or short ID
  So that I can see full details and edit history

  Background:
    Given task "TSK-0042" exists with 3 version records
    And it belongs to client "Total Life" which I can access

  Scenario: Retrieve task by short ID
    When I GET "/tasks/TSK-0042"
    Then the response status is 200
    And the response contains the task with short_id "TSK-0042"
    And the versions array contains 3 entries ordered by version ascending

  Scenario: Retrieve task by UUID
    Given the UUID of "TSK-0042" is "3f2a1b4c-0000-0000-0000-000000000042"
    When I GET "/tasks/3f2a1b4c-0000-0000-0000-000000000042"
    Then the response status is 200
    And the response contains the task with short_id "TSK-0042"

  Scenario: Retrieve task that does not exist
    When I GET "/tasks/TSK-9999"
    Then the response status is 404
    And the error code is "TASK_NOT_FOUND"

  Scenario: Retrieve task belonging to inaccessible client
    Given task "TSK-0099" belongs to client "Alpha Corp" which I cannot access
    When I GET "/tasks/TSK-0099"
    Then the response status is 403
    And the error code is "FORBIDDEN"

---

## Feature: Edit Draft Task

  As an authenticated user
  I need to edit a draft or rejected task
  So that I can refine agent-generated content before approval

  Background:
    Given task "TSK-0042" exists with status "draft" and 1 version record
    And I am authenticated as account manager "mark"

  Scenario: Successfully edit a draft task
    When I PATCH "/tasks/TSK-0042" with:
      """
      {
        "title": "Updated task title",
        "estimated_time": "02:00"
      }
      """
    Then the response status is 200
    And the returned task has title "Updated task title"
    And the returned task has estimated_time "02:00"
    And the versions array now contains 2 entries
    And version 2 has source matching the caller's client type
    And version 2 has edited_by set to my user id
    And a "task.edited" audit entry is written

  Scenario: Edit a rejected task
    Given task "TSK-0055" has status "rejected"
    When I PATCH "/tasks/TSK-0055" with updated description
    Then the response status is 200
    And a new version record is created

  Scenario: Cannot edit an approved task
    Given task "TSK-0044" has status "approved"
    When I PATCH "/tasks/TSK-0044" with any field
    Then the response status is 422
    And the error code is "TASK_NOT_EDITABLE"

  Scenario: Cannot edit a pushed task
    Given task "TSK-0070" has status "pushed"
    When I PATCH "/tasks/TSK-0070" with any field
    Then the response status is 422
    And the error code is "TASK_NOT_EDITABLE"

  Scenario: Non-editable fields are ignored
    When I PATCH "/tasks/TSK-0042" with:
      """
      { "status": "approved", "short_id": "TSK-0001" }
      """
    Then the response status is 200
    And the task status remains "draft"
    And the task short_id remains "TSK-0042"

  Scenario: Invalid estimated_time format
    When I PATCH "/tasks/TSK-0042" with estimated_time "3 hours"
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"
    And the validation error references the field "estimated_time"

---

## Feature: Approve Task

  As an account manager or admin
  I need to approve individual tasks
  So that they can proceed to be pushed to Asana

  Background:
    Given task "TSK-0042" exists with status "draft"

  Scenario: Account manager successfully approves a draft task
    Given I am authenticated with role "account_manager"
    When I POST "/tasks/TSK-0042/approve"
    Then the response status is 200
    And the returned task has status "approved"
    And approved_by is set to my user id
    And approved_at is a recent UTC timestamp
    And a "task.approved" audit entry is written

  Scenario: Admin successfully approves a task
    Given I am authenticated with role "admin"
    When I POST "/tasks/TSK-0042/approve"
    Then the response status is 200
    And the returned task has status "approved"

  Scenario: Team member cannot approve
    Given I am authenticated with role "team_member"
    When I POST "/tasks/TSK-0042/approve"
    Then the response status is 403
    And the error code is "FORBIDDEN"

  Scenario: Cannot approve an already-approved task
    Given task "TSK-0050" has status "approved"
    When I POST "/tasks/TSK-0050/approve"
    Then the response status is 422
    And the error code is "TASK_NOT_APPROVABLE"
    And the error details include current_status "approved"

  Scenario: Cannot approve a pushed task
    Given task "TSK-0060" has status "pushed"
    When I POST "/tasks/TSK-0060/approve"
    Then the response status is 422
    And the error code is "TASK_NOT_APPROVABLE"

  Scenario: Cannot approve a rejected task directly
    Given task "TSK-0030" has status "rejected"
    When I POST "/tasks/TSK-0030/approve"
    Then the response status is 422
    And the error code is "TASK_NOT_APPROVABLE"

---

## Feature: Reject Task

  As an authenticated user with client access
  I need to reject tasks that require rework
  So that they are flagged for revision before being pushed

  Background:
    Given task "TSK-0042" exists with status "draft"

  Scenario: Successfully reject a draft task with a reason
    Given I am authenticated as account manager "mark"
    When I POST "/tasks/TSK-0042/reject" with:
      """
      { "reason": "Description lacks specific requirements" }
      """
    Then the response status is 200
    And the returned task has status "rejected"
    And approved_by is cleared to null
    And approved_at is cleared to null
    And a "task.rejected" audit entry is written with the reason in metadata

  Scenario: Reject without providing a reason
    When I POST "/tasks/TSK-0042/reject" with an empty body
    Then the response status is 200
    And the returned task has status "rejected"

  Scenario: Reject an approved task
    Given task "TSK-0050" has status "approved"
    When I POST "/tasks/TSK-0050/reject"
    Then the response status is 200
    And the returned task has status "rejected"
    And approved_by is null
    And approved_at is null

  Scenario: Cannot reject a pushed task
    Given task "TSK-0070" has status "pushed"
    When I POST "/tasks/TSK-0070/reject"
    Then the response status is 422
    And the error code is "TASK_NOT_REJECTABLE"

  Scenario: Rejected task can be edited and re-approved
    Given task "TSK-0042" has status "rejected"
    When I PATCH "/tasks/TSK-0042" with updated title
    Then the response is 200
    When I POST "/tasks/TSK-0042/approve"
    Then the response status is 200
    And the task status is "approved"

---

## Feature: Push Task to External System

  As an authenticated user
  I need to push an approved task to Asana
  So that the iExcel team receives their work assignments

  Background:
    Given I am authenticated as account manager "mark"
    And the output normalizer (Feature 12) is available

  Scenario: Successfully push an approved task with task-level workspace
    Given task "TSK-0042" has status "approved"
    And task "TSK-0042" has asana_workspace_id "ws-111" and asana_project_id "proj-222"
    When I POST "/tasks/TSK-0042/push"
    Then the API calls the output normalizer with workspace "ws-111" and project "proj-222"
    And the output normalizer returns external_ref:
      """
      { "provider": "asana", "taskId": "asana-999", "workspaceId": "ws-111", "projectId": "proj-222" }
      """
    And the response status is 200
    And the returned task has status "pushed"
    And external_ref is populated with the Asana reference
    And pushed_at is a recent UTC timestamp
    And a "task.pushed" audit entry is written

  Scenario: Push falls back to client workspace when task has no override
    Given task "TSK-0043" has status "approved" and no asana_workspace_id
    And client "Total Life" has default_asana_workspace_id "ws-client-default"
    When I POST "/tasks/TSK-0043/push"
    Then the API calls the output normalizer with workspace "ws-client-default"
    And the response status is 200

  Scenario: Push fails when no workspace is configured
    Given task "TSK-0044" has status "approved" and no asana_workspace_id
    And client "Total Life" has no default_asana_workspace_id
    When I POST "/tasks/TSK-0044/push"
    Then the response status is 422
    And the error code is "WORKSPACE_NOT_CONFIGURED"
    And the task status remains "approved"

  Scenario: Cannot push a draft task
    Given task "TSK-0045" has status "draft"
    When I POST "/tasks/TSK-0045/push"
    Then the response status is 422
    And the error code is "TASK_NOT_PUSHABLE"

  Scenario: Cannot push an already-pushed task
    Given task "TSK-0046" has status "pushed"
    When I POST "/tasks/TSK-0046/push"
    Then the response status is 422
    And the error code is "TASK_NOT_PUSHABLE"

  Scenario: Output normalizer returns an error
    Given task "TSK-0047" has status "approved" with valid workspace routing
    And the output normalizer returns an error "Asana API rate limit exceeded"
    When I POST "/tasks/TSK-0047/push"
    Then the response status is 502
    And the error code is "PUSH_FAILED"
    And the task status remains "approved" (not changed)
    And no audit entry for "task.pushed" is written

---

## Feature: Batch Approve Tasks

  As an account manager
  I need to approve multiple tasks in a single API call
  So that I can efficiently process large batches from an intake call

  Background:
    Given I am authenticated with role "account_manager"
    And client "Total Life" has tasks:
      | short_id  | status   |
      | TSK-0001  | draft    |
      | TSK-0002  | draft    |
      | TSK-0003  | approved |
      | TSK-0004  | pushed   |

  Scenario: All tasks succeed
    When I POST "/clients/client-uuid-abc/tasks/approve" with:
      """
      { "task_ids": ["TSK-0001", "TSK-0002"] }
      """
    Then the response status is 200
    And results contains 2 entries
    And both have success: true
    And summary shows total 2, succeeded 2, failed 0
    And 2 "task.approved" audit entries are written

  Scenario: Partial success — some tasks not approvable
    When I POST "/clients/client-uuid-abc/tasks/approve" with:
      """
      { "task_ids": ["TSK-0001", "TSK-0003", "TSK-0004"] }
      """
    Then the response status is 200
    And results for "TSK-0001" has success: true
    And results for "TSK-0003" has success: false with code "TASK_NOT_APPROVABLE"
    And results for "TSK-0004" has success: false with code "TASK_NOT_APPROVABLE"
    And summary shows total 3, succeeded 1, failed 2

  Scenario: Unknown task ID in batch
    When I POST with task_ids including "TSK-9999" which does not exist
    Then the result for "TSK-9999" has success: false with code "TASK_NOT_FOUND"
    And other valid tasks in the batch are still processed

  Scenario: Batch exceeds maximum size
    When I POST with 51 task_ids
    Then the response status is 422
    And the error code is "VALIDATION_ERROR"

  Scenario: Team member cannot batch approve
    Given I am authenticated with role "team_member"
    When I POST "/clients/client-uuid-abc/tasks/approve" with any task_ids
    Then every result has success: false with code "FORBIDDEN"

---

## Feature: Batch Push Tasks

  As an account manager
  I need to push multiple approved tasks to Asana in a single call
  So that I can complete task delivery efficiently

  Background:
    Given I am authenticated with role "account_manager"
    And client "Total Life" has:
      | short_id  | status   | workspace configured |
      | TSK-0001  | approved | yes                  |
      | TSK-0002  | approved | yes                  |
      | TSK-0003  | draft    | yes                  |
      | TSK-0004  | approved | no                   |

  Scenario: All approved tasks with valid workspace succeed
    When I POST "/clients/client-uuid-abc/tasks/push" with:
      """
      { "task_ids": ["TSK-0001", "TSK-0002"] }
      """
    Then the response status is 200
    And both results have success: true
    And both tasks have status "pushed"
    And summary shows total 2, succeeded 2, failed 0

  Scenario: Partial failure — draft task and workspace not configured
    When I POST "/clients/client-uuid-abc/tasks/push" with:
      """
      { "task_ids": ["TSK-0001", "TSK-0003", "TSK-0004"] }
      """
    Then "TSK-0001" result has success: true
    And "TSK-0003" result has success: false with code "TASK_NOT_PUSHABLE"
    And "TSK-0004" result has success: false with code "WORKSPACE_NOT_CONFIGURED"
    And summary shows total 3, succeeded 1, failed 2

  Scenario: Output normalizer fails for one task in batch
    Given the output normalizer fails for "TSK-0002" only
    When I POST with task_ids ["TSK-0001", "TSK-0002"]
    Then "TSK-0001" result has success: true
    And "TSK-0002" result has success: false with code "PUSH_FAILED"
    And "TSK-0002" status remains "approved"
