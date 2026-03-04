# Gherkin Specification
# Feature 12: output-normalizer-asana

---

## Feature: Workspace Routing

  The Asana output normalizer resolves the target workspace and project before
  creating any Asana task, using a defined cascade of task-level override
  then client default then rejection.

  **Background:**
    Given the Asana output normalizer module is initialized
    And the shared types package is available at "@iexcel/shared-types"
    And a configured Asana workspace exists with GID "workspace-gid-001"
    And the workspace has a configured project with GID "project-gid-001"
    And the workspace has a valid access token on record

---

  **Scenario: Task-level workspace override is used when present**

    Given a NormalizedTask with:
      | field               | value               |
      | id                  | task-uuid-001       |
      | asanaWorkspaceId    | workspace-gid-001   |
      | asanaProjectId      | project-gid-001     |
      | clientId            | client-uuid-001     |
    And the client "client-uuid-001" has a different default workspace "workspace-gid-999"
    When the adapter pushes the task
    Then the Asana API is called with workspace "workspace-gid-001"
    And the Asana API is called with project "project-gid-001"
    And the client default workspace "workspace-gid-999" is not used

  **Scenario: Client default workspace is used when task has no override**

    Given a NormalizedTask with:
      | field               | value           |
      | id                  | task-uuid-002   |
      | asanaWorkspaceId    | null            |
      | asanaProjectId      | null            |
      | clientId            | client-uuid-001 |
    And the client "client-uuid-001" has default workspace "workspace-gid-001"
    And the client "client-uuid-001" has default project "project-gid-001"
    When the adapter pushes the task
    Then the Asana API is called with workspace "workspace-gid-001"
    And the Asana API is called with project "project-gid-001"

  **Scenario: WORKSPACE_NOT_CONFIGURED error is returned when no workspace is set**

    Given a NormalizedTask with:
      | field               | value           |
      | id                  | task-uuid-003   |
      | asanaWorkspaceId    | null            |
      | clientId            | client-uuid-002 |
    And the client "client-uuid-002" has no default Asana workspace configured
    When the adapter pushes the task
    Then a WORKSPACE_NOT_CONFIGURED error is thrown with HTTP status 422
    And the error details contain taskId "task-uuid-003"
    And the error details contain clientId "client-uuid-002"
    And the Asana API is never called

---

## Feature: Field Mapping — Core Fields

  **Scenario: Task title maps to Asana name field**

    Given a NormalizedTask with title "Update onboarding checklist for Total Life"
    When the adapter pushes the task
    Then the Asana API POST body contains name "Update onboarding checklist for Total Life"

  **Scenario: Task description is formatted as the 3-section template**

    Given a NormalizedTask with description containing sections:
      """
      **TASK CONTEXT**
      - The client requested an update to their onboarding checklist during the Feb 15 intake call.

      **ADDITIONAL CONTEXT**
      - The current checklist was last updated in November 2025.

      **REQUIREMENTS**
      - Review the existing checklist in Notion and update items 3, 5, and 7.
      """
    When the adapter pushes the task
    Then the Asana API POST body contains notes with plain text:
      """
      TASK CONTEXT
      - The client requested an update to their onboarding checklist during the Feb 15 intake call.

      ADDITIONAL CONTEXT
      - The current checklist was last updated in November 2025.

      REQUIREMENTS
      - Review the existing checklist in Notion and update items 3, 5, and 7.
      """
    And the notes field does not contain "**" bold markers

  **Scenario: Description without 3-section markers is sent as-is**

    Given a NormalizedTask with description "Follow up on the contract renewal discussion."
    When the adapter pushes the task
    Then the Asana API POST body contains that exact text in the notes field
    And no error is thrown

  **Scenario: Empty title is rejected before Asana API is called**

    Given a NormalizedTask with title ""
    When the adapter pushes the task
    Then a VALIDATION_ERROR is thrown
    And the Asana API is never called

---

## Feature: Field Mapping — Assignee Resolution

  **Scenario: Assignee name is resolved to Asana user GID**

    Given the workspace members cache contains:
      | name         | gid             |
      | Mark Johnson | user-gid-mark   |
      | Sarah Doe    | user-gid-sarah  |
    And a NormalizedTask with assignee "Mark Johnson"
    When the adapter pushes the task
    Then the Asana API POST body contains assignee GID "user-gid-mark"

  **Scenario: Case-insensitive assignee name match succeeds**

    Given the workspace members cache contains a member with name "Mark Johnson" and GID "user-gid-mark"
    And a NormalizedTask with assignee "mark johnson"
    When the adapter pushes the task
    Then the Asana API POST body contains assignee GID "user-gid-mark"

  **Scenario: Assignee email match succeeds when name does not match**

    Given the workspace members cache contains:
      | name         | email                | gid            |
      | Mark J.      | mark@iexcel.com      | user-gid-mark  |
    And a NormalizedTask with assignee "mark@iexcel.com"
    When the adapter pushes the task
    Then the Asana API POST body contains assignee GID "user-gid-mark"

  **Scenario: Unknown assignee triggers a warning and task is still created**

    Given the workspace members cache does not contain "Unknown Person"
    And a NormalizedTask with assignee "Unknown Person"
    When the adapter pushes the task
    Then a warning is logged with assigneeName "Unknown Person"
    And the Asana API POST body does not contain an assignee field
    And the task is created successfully in Asana
    And no error is thrown

  **Scenario: Null assignee creates task with no assignee**

    Given a NormalizedTask with assignee null
    When the adapter pushes the task
    Then the Asana API POST body does not contain an assignee field
    And the task is created successfully in Asana

---

## Feature: Custom Field Mapping

  **Scenario: Client custom field is mapped by enum option GID**

    Given the workspace custom field config has client_field_gid "cf-gid-client"
    And the custom field "cf-gid-client" has enum options:
      | display_name  | gid               |
      | Total Life    | enum-gid-tl       |
      | Acme Corp     | enum-gid-acme     |
    And a NormalizedTask with clientName "Total Life"
    When the adapter pushes the task
    Then the Asana API POST body contains custom_fields with key "cf-gid-client" set to "enum-gid-tl"

  **Scenario: Scrum Stage defaults to Backlog when not set**

    Given the workspace custom field config has scrum_stage_field_gid "cf-gid-scrum"
    And the custom field "cf-gid-scrum" has enum option "Backlog" with GID "enum-gid-backlog"
    And a NormalizedTask with scrumStage null
    When the adapter pushes the task
    Then the Asana API POST body contains custom_fields with key "cf-gid-scrum" set to "enum-gid-backlog"

  **Scenario: Scrum Stage is mapped by provided value**

    Given the workspace custom field config has scrum_stage_field_gid "cf-gid-scrum"
    And the custom field "cf-gid-scrum" has enum options:
      | display_name  | gid                |
      | Backlog       | enum-gid-backlog   |
      | In Progress   | enum-gid-inprog    |
    And a NormalizedTask with scrumStage "Backlog"
    When the adapter pushes the task
    Then the Asana API POST body contains custom_fields with key "cf-gid-scrum" set to "enum-gid-backlog"

  **Scenario: Estimated Time is formatted as "Xh Ym" text value**

    Given the workspace custom field config has estimated_time_field_gid "cf-gid-esttime"
    And the workspace estimated_time_format is "h_m"
    And a NormalizedTask with estimatedTime "02:30"
    When the adapter pushes the task
    Then the Asana API POST body contains custom_fields with key "cf-gid-esttime" set to "2h 30m"

  **Scenario: Estimated Time with zero minutes formats correctly**

    Given the workspace estimated_time_format is "h_m"
    And a NormalizedTask with estimatedTime "03:00"
    When the adapter pushes the task
    Then the custom_fields estimated time value is "3h 0m"

  **Scenario: Unknown client name omits the client custom field and logs a warning**

    Given the custom field "cf-gid-client" does not have an enum option for "Unknown Client"
    And a NormalizedTask with clientName "Unknown Client"
    When the adapter pushes the task
    Then a warning is logged with fieldName "Client" and displayName "Unknown Client"
    And the Asana API POST body does not contain key "cf-gid-client" in custom_fields
    And the task is created successfully in Asana

  **Scenario: Missing custom field GID config throws WORKSPACE_NOT_CONFIGURED**

    Given the workspace custom field config is missing the "client_field_gid" key
    And a NormalizedTask is ready to push
    When the adapter attempts to push the task
    Then a WORKSPACE_NOT_CONFIGURED error is thrown with HTTP status 422
    And the Asana API is never called

---

## Feature: Successful Task Creation and ExternalRef Write-Back

  **Scenario: Successful push returns a complete AsanaExternalRef**

    Given a fully configured NormalizedTask with all fields populated
    And the Asana API returns HTTP 201 with:
      | field         | value                                              |
      | data.gid      | asana-task-gid-001                                 |
      | data.permalink_url | https://app.asana.com/0/proj/asana-task-gid-001 |
    When the adapter pushes the task
    Then the adapter returns an ExternalRef with:
      | field         | value                                              |
      | provider      | asana                                              |
      | taskId        | asana-task-gid-001                                 |
      | workspaceId   | workspace-gid-001                                  |
      | projectId     | project-gid-001                                    |
      | permalinkUrl  | https://app.asana.com/0/proj/asana-task-gid-001   |
    And the adapter does not write to the database directly

  **Scenario: Task is created with correct project membership**

    Given a NormalizedTask resolved to project "project-gid-001"
    When the adapter pushes the task
    Then the Asana API POST body contains projects array with "project-gid-001"

---

## Feature: Error Handling — Asana API Failures

  **Scenario: Asana returns 401 Unauthorized — PUSH_FAILED with descriptive message**

    Given the Asana access token is invalid
    And the Asana API returns HTTP 401
    When the adapter pushes the task
    Then a PUSH_FAILED error is thrown with HTTP status 502
    And the error message is "Asana access token is invalid or expired"

  **Scenario: Asana returns 403 Forbidden — PUSH_FAILED**

    Given the Asana API returns HTTP 403
    When the adapter pushes the task
    Then a PUSH_FAILED error is thrown with HTTP status 502
    And the error message is "Asana access denied to workspace or project"

  **Scenario: Asana returns 404 Not Found — PUSH_FAILED**

    Given the Asana API returns HTTP 404
    When the adapter pushes the task
    Then a PUSH_FAILED error is thrown with HTTP status 502
    And the error message is "Asana workspace or project GID not found"

  **Scenario: Asana returns 400 Bad Request — PUSH_FAILED with Asana error details**

    Given the Asana API returns HTTP 400 with body:
      """
      { "errors": [{ "message": "custom_field is not valid" }] }
      """
    When the adapter pushes the task
    Then a PUSH_FAILED error is thrown with HTTP status 502
    And the error details contain the Asana error body

---

## Feature: Retry Logic for Transient Failures

  **Scenario: 429 Too Many Requests triggers retry with back-off**

    Given the Asana API returns HTTP 429 on the first two attempts
    And the Asana API returns HTTP 201 on the third attempt
    When the adapter pushes the task
    Then the adapter retries twice with exponential back-off
    And the task is created successfully
    And a warning is logged for each retry with the attempt number

  **Scenario: 429 with Retry-After header uses header value as minimum wait**

    Given the Asana API returns HTTP 429 with header "Retry-After: 2"
    When the adapter handles the response
    Then the adapter waits at least 2000ms before retrying

  **Scenario: 503 Server Error triggers retry up to maximum attempts**

    Given the Asana API returns HTTP 503 on all attempts
    When the adapter pushes the task
    Then the adapter retries exactly 2 times (3 total attempts)
    Then a PUSH_FAILED error is thrown with message indicating retries were exhausted

  **Scenario: API call timeout throws PUSH_FAILED**

    Given the Asana API does not respond within 10 seconds
    When the adapter pushes the task
    Then a PUSH_FAILED error is thrown
    And the error message is "Asana API request timed out"

---

## Feature: Caching Behaviour

  **Scenario: Workspace members cache is populated on first push and reused**

    Given no workspace members cache exists for "workspace-gid-001"
    And the Asana API returns a members list for the workspace
    When the adapter pushes two tasks sequentially
    Then the Asana members API is called exactly once
    And the second task push uses the cached member list

  **Scenario: Workspace members cache expires after 15 minutes**

    Given the workspace members cache for "workspace-gid-001" was populated 16 minutes ago
    When the adapter pushes a task
    Then the Asana members API is called again to refresh the cache

  **Scenario: Custom field enum options cache is populated on first push and reused**

    Given no enum options cache exists for custom field "cf-gid-client"
    When the adapter pushes two tasks sequentially
    Then the Asana custom field API is called exactly once for "cf-gid-client"
    And the second push uses the cached enum options

  **Scenario: Custom field enum options cache expires after 5 minutes**

    Given the enum options cache for "cf-gid-client" was populated 6 minutes ago
    When the adapter pushes a task
    Then the Asana custom field API is called again to refresh the cache

---

## Feature: Batch Push Isolation

  **Scenario: Failure on one task in a batch does not abort remaining tasks**

    Given a batch push request for tasks ["TSK-0042", "TSK-0043", "TSK-0044"]
    And the Asana API fails with 403 Forbidden for "TSK-0043"
    And the Asana API succeeds for "TSK-0042" and "TSK-0044"
    When the batch push executes
    Then "TSK-0042" is marked as pushed with an external_ref
    Then "TSK-0043" is marked as failed with PUSH_FAILED
    Then "TSK-0044" is marked as pushed with an external_ref
    And the batch response contains per-task status for all three tasks

  **Scenario: Concurrent adapter invocations do not share mutable state**

    Given two task push requests are made simultaneously
    When both adapter invocations execute concurrently
    Then each invocation independently resolves its workspace context
    And neither invocation interferes with the other's result

---

## Feature: OutputAdapter Interface Compliance

  **Scenario: Adapter implements the OutputAdapter interface from shared-types**

    Given the AsanaOutputAdapter class
    When it is checked against the OutputAdapter interface
    Then it exports a push(task, context) method matching the interface signature
    And it returns a Promise<ExternalRef>
    And TypeScript type-checks pass with zero errors

  **Scenario: ExternalRef shape matches AsanaExternalRef from shared-types**

    Given a successful Asana push
    When the adapter returns the ExternalRef
    Then the returned object has field "provider" equal to "asana"
    And the returned object has field "taskId" as a non-empty string
    And the returned object has field "workspaceId" as a non-empty string
    And the returned object has field "projectId" as a non-empty string
    And the returned object has field "permalinkUrl" as a non-empty string starting with "https://"
