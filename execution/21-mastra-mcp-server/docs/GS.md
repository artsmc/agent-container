# GS — Gherkin Specification
# Feature 21: Mastra MCP Server

**Feature Name:** mastra-mcp-server
**Date:** 2026-03-03

---

## Feature: MCP Server Configuration

```gherkin
Feature: MCP server is discoverable and reachable by terminal clients

  Background:
    Given the Mastra runtime is running on port 8081
    And the MCP server is enabled within the Mastra instance

  Scenario: MCP client lists available tools
    Given a terminal client connects to the Mastra MCP server
    When the client sends a tools/list request
    Then the response includes exactly 10 tools:
      | get_agenda         |
      | get_tasks          |
      | trigger_intake     |
      | trigger_agenda     |
      | get_client_status  |
      | list_clients       |
      | edit_task          |
      | reject_task        |
      | approve_tasks      |
      | get_transcript     |
    And each tool includes a description and an input schema

  Scenario: MCP server returns valid health response
    Given the Mastra HTTP server is running
    When a GET request is made to /health
    Then the response status is 200
    And the response body contains "status": "ok"
```

---

## Feature: User Token Passthrough

```gherkin
Feature: User token is forwarded to the API on every MCP tool call

  Background:
    Given the Mastra MCP server is running
    And the API layer is running

  Scenario: Tool call with valid user token forwards token to API
    Given a terminal client has a valid user access token for "alice@iexcel.com"
    When the client calls "get_tasks" with client="Total Life"
      And the MCP request includes "Authorization: Bearer <alice_token>"
    Then Mastra constructs a user-scoped API client with alice's token
    And the downstream GET /clients/{id}/tasks request includes "Authorization: Bearer <alice_token>"
    And the response contains only tasks for clients alice has access to

  Scenario: Tool call without Authorization header is rejected
    Given a terminal client has no access token
    When the client calls "get_tasks" with client="Total Life"
      And the MCP request does not include an Authorization header
    Then the tool returns an error message:
      "Authentication required. Connect to the iExcel Mastra MCP server with a valid access token."
    And no API call is made to the downstream API

  Scenario: Tool call with expired user token propagates API 401
    Given a terminal client has an expired user access token
    When the client calls "get_tasks" with client="Total Life"
      And the MCP request includes "Authorization: Bearer <expired_token>"
    Then the downstream API returns 401 Unauthorized
    And the tool returns: "Your session has expired. Re-authenticate and try again."
    And the Mastra service token is NOT substituted for the expired user token

  Scenario: Mastra service token is never used for MCP tool calls
    Given a terminal client has a valid user access token
    When the client calls any MCP tool
    Then the API receives the user's token in the Authorization header
    And the API does NOT receive the Mastra service client credentials token
```

---

## Feature: get_agenda

```gherkin
Feature: get_agenda retrieves the current Running Notes for a client

  Background:
    Given the user "alice" is authenticated and has access to "Total Life"
    And "Total Life" has a current draft agenda "AGD-0015"

  Scenario: Retrieve agenda for a known client
    When alice calls get_agenda with client="Total Life"
    Then the tool calls GET /clients/{totalLifeId}/agendas
    And returns the agenda content for AGD-0015
    And the response includes the agenda title, status, and section content

  Scenario: Retrieve agenda using client short ID
    When alice calls get_agenda with client="TL-001"
    Then the tool resolves the client ID via the API
    And returns the agenda for "Total Life"

  Scenario: Client not found
    When alice calls get_agenda with client="Unknown Corp"
    Then the tool returns: "No client named 'Unknown Corp' found. Use list_clients to see available clients."
    And no agenda lookup is attempted

  Scenario: No agenda exists for client
    Given "Total Life" has no agendas
    When alice calls get_agenda with client="Total Life"
    Then the tool returns: "No agenda found for Total Life. Run trigger_agenda to generate one."

  Scenario: User does not have access to the client
    Given "alice" does not have access to "Restricted Corp"
    When alice calls get_agenda with client="Restricted Corp"
    Then the API returns 403 Forbidden
    And the tool returns: "You don't have permission to access that client. Contact your administrator."
```

---

## Feature: get_tasks

```gherkin
Feature: get_tasks lists tasks for a client with optional status filter

  Background:
    Given "alice" is authenticated with access to "Total Life"
    And "Total Life" has tasks: TSK-0042 (draft), TSK-0043 (draft), TSK-0044 (approved)

  Scenario: List all tasks without filter
    When alice calls get_tasks with client="Total Life"
    Then the tool calls GET /clients/{id}/tasks with no status parameter
    And returns a Markdown table showing TSK-0042, TSK-0043, and TSK-0044

  Scenario: List tasks filtered by status
    When alice calls get_tasks with client="Total Life" and status="draft"
    Then the tool calls GET /clients/{id}/tasks?status=draft
    And returns a Markdown table showing TSK-0042 and TSK-0043
    And TSK-0044 is NOT included in the result

  Scenario: No tasks for client
    Given "Total Life" has no tasks
    When alice calls get_tasks with client="Total Life"
    Then the tool returns: "No tasks found for Total Life."

  Scenario: No tasks matching status filter
    When alice calls get_tasks with client="Total Life" and status="completed"
    Then the tool returns: "No completed tasks found for Total Life."

  Scenario: Task table includes short IDs
    When alice calls get_tasks with client="Total Life"
    Then the response contains TSK-0042 in the ID column
    And no UUIDs are displayed to the user
```

---

## Feature: trigger_intake

```gherkin
Feature: trigger_intake kicks off Workflow A and returns a workflow run ID

  Background:
    Given "alice" is authenticated with access to "Total Life"
    And a transcript exists for "Total Life" on 2026-02-28

  Scenario: Trigger intake workflow for today's transcript
    When alice calls trigger_intake with client="Total Life" and date="2026-02-28"
    Then the tool calls POST /workflows/intake with clientId and date
    And the API returns a workflow run ID "wf-run-abc123"
    And the tool returns:
      """
      Intake workflow started for Total Life.
      Workflow Run ID: wf-run-abc123
      Use get_tasks(client="Total Life", status="draft") to check for generated tasks once complete.
      """

  Scenario: Trigger intake without specifying a date
    When alice calls trigger_intake with client="Total Life" (no date)
    Then the tool calls POST /workflows/intake with clientId and no date parameter
    And the API uses the most recent transcript

  Scenario: No transcript found for the specified date
    When alice calls trigger_intake with client="Total Life" and date="2020-01-01"
    Then the API returns an error indicating no transcript found
    And the tool returns: "No transcript found for Total Life on 2020-01-01. Verify the date or provide a transcript source."

  Scenario: Workflow already running for client
    Given a workflow is already running for "Total Life"
    When alice calls trigger_intake with client="Total Life"
    Then the API returns a conflict error
    And the tool returns: "A workflow is already running for Total Life. Check status with get_client_status."
```

---

## Feature: trigger_agenda

```gherkin
Feature: trigger_agenda kicks off Workflow B and returns a workflow run ID

  Background:
    Given "alice" is authenticated with access to "Total Life"
    And "Total Life" has completed tasks in the cycle 2026-02-01 to 2026-02-28

  Scenario: Trigger agenda workflow with cycle dates
    When alice calls trigger_agenda with client="Total Life", cycle_start="2026-02-01", cycle_end="2026-02-28"
    Then the tool calls POST /workflows/agenda with clientId, cycleStart, cycleEnd
    And returns a workflow run ID
    And instructs alice to use get_agenda once complete

  Scenario: Trigger agenda without cycle dates
    When alice calls trigger_agenda with client="Total Life" (no dates)
    Then the tool calls POST /workflows/agenda with only the clientId
    And the API defaults to the last cycle window

  Scenario: No completed tasks in cycle
    Given "Total Life" has no completed tasks in the requested cycle
    When alice calls trigger_agenda with client="Total Life"
    Then the API returns an error indicating no completed tasks
    And the tool returns: "No completed tasks found for Total Life in the specified cycle. Ensure tasks are marked completed before generating an agenda."
```

---

## Feature: get_client_status

```gherkin
Feature: get_client_status returns an overview of a client's current cycle

  Background:
    Given "alice" is authenticated with access to "Total Life"

  Scenario: Retrieve status for active client
    When alice calls get_client_status with client="Total Life"
    Then the tool calls GET /clients/{id}/status
    And returns formatted status output:
      """
      Client: Total Life
      Cycle Status: Active
      Draft Tasks: 3 pending approval (TSK-0042, TSK-0043, TSK-0044)
      Agenda: Not yet generated
      Last Intake: 2026-02-28
      Next Call: 2026-03-07
      """

  Scenario: Client has no draft tasks
    Given "Total Life" has 0 draft tasks
    When alice calls get_client_status with client="Total Life"
    Then the response shows "Draft Tasks: 0 pending approval"
```

---

## Feature: list_clients

```gherkin
Feature: list_clients returns all clients the authenticated user has access to

  Background:
    Given "alice" is authenticated and has access to "Total Life" and "Acme Corp"
    And "bob" is authenticated and has access to "Acme Corp" only

  Scenario: Alice lists her clients
    When alice calls list_clients
    Then the tool calls GET /clients with alice's token
    And returns a Markdown table with "Total Life" and "Acme Corp"

  Scenario: Bob lists his clients
    When bob calls list_clients
    Then the tool calls GET /clients with bob's token
    And returns a Markdown table with "Acme Corp" only
    And "Total Life" is NOT in the result

  Scenario: User has no accessible clients
    Given "charlie" is authenticated but has no clients assigned
    When charlie calls list_clients
    Then the tool returns: "No clients found for your account. Contact your administrator."
```

---

## Feature: edit_task

```gherkin
Feature: edit_task updates a task by short ID

  Background:
    Given "alice" is authenticated and TSK-0043 exists in draft status

  Scenario: Edit estimated time of a task
    When alice calls edit_task with id="TSK-0043" and estimated_time="1h 00m"
    Then the tool calls PATCH /tasks/TSK-0043 with { estimated_time: "1h 00m" }
    And returns: "Task TSK-0043 updated. Estimated time: 1h 00m"

  Scenario: Edit multiple fields at once
    When alice calls edit_task with id="TSK-0043", estimated_time="1h 00m", and assignee="Mike"
    Then the tool calls PATCH /tasks/TSK-0043 with both fields
    And returns the updated field summary

  Scenario: Attempt to edit without providing any fields
    When alice calls edit_task with id="TSK-0043" and no other parameters
    Then no API call is made
    And the tool returns: "Please specify at least one field to update (description, assignee, estimated_time, workspace)."

  Scenario: Task is not in draft status
    Given TSK-0043 has been approved
    When alice calls edit_task with id="TSK-0043" and assignee="Mike"
    Then the API returns 409 with TASK_NOT_EDITABLE
    And the tool returns: "TSK-0043 cannot be edited — it is in 'approved' status. Only draft tasks can be edited."

  Scenario: Invalid short ID format
    When alice calls edit_task with id="TASK-43"
    Then the Zod schema validation rejects the input
    And the tool returns: "'TASK-43' is not a valid task ID. Use the format TSK-0042."

  Scenario: Invalid estimated time format
    When alice calls edit_task with id="TSK-0043" and estimated_time="90 minutes"
    Then the tool returns: "Invalid time format. Use format '1h 30m' or '0h 45m'."
    And no API call is made
```

---

## Feature: reject_task

```gherkin
Feature: reject_task rejects a draft task by short ID

  Background:
    Given "alice" is authenticated and TSK-0044 exists in draft status

  Scenario: Reject a draft task
    When alice calls reject_task with id="TSK-0044"
    Then the tool calls POST /tasks/TSK-0044/reject
    And returns: "Task TSK-0044 rejected."

  Scenario: Reject a task with a reason
    When alice calls reject_task with id="TSK-0044" and reason="Not in scope"
    Then the tool calls POST /tasks/TSK-0044/reject with the reason payload
    And returns: "Task TSK-0044 rejected."

  Scenario: Task not found
    When alice calls reject_task with id="TSK-9999"
    Then the API returns 404
    And the tool returns: "No task found with ID TSK-9999."

  Scenario: Task not in rejectable state
    Given TSK-0044 has already been approved
    When alice calls reject_task with id="TSK-0044"
    Then the API returns 409
    And the tool returns: "TSK-0044 cannot be rejected — it is in 'approved' status."
```

---

## Feature: approve_tasks

```gherkin
Feature: approve_tasks approves draft tasks by short ID, individually or in batch

  Background:
    Given "alice" is authenticated
    And TSK-0042 and TSK-0043 are in draft status
    And TSK-0044 is in approved status

  Scenario: Approve a single task
    When alice calls approve_tasks with ids="TSK-0042"
    Then the tool calls POST /tasks/TSK-0042/approve
    And returns: "Task TSK-0042 approved."

  Scenario: Batch approve multiple tasks
    When alice calls approve_tasks with ids=["TSK-0042", "TSK-0043"]
    Then the tool calls POST /clients/{clientId}/tasks/approve with the IDs
    And returns: "2 tasks approved: TSK-0042, TSK-0043."

  Scenario: Batch approve with some non-approvable tasks
    When alice calls approve_tasks with ids=["TSK-0042", "TSK-0043", "TSK-0044"]
    Then the tool calls POST /clients/{clientId}/tasks/approve with all three IDs
    And the API reports TSK-0044 was already approved and skipped
    And the tool returns: "2 tasks approved: TSK-0042, TSK-0043. TSK-0044 was not in draft status and was skipped."

  Scenario: No valid task IDs provided
    When alice calls approve_tasks with ids=["TSK-9998", "TSK-9999"]
    Then the API returns errors for all IDs
    And the tool returns: "None of the provided task IDs could be found. Check IDs with get_tasks."
```

---

## Feature: get_transcript

```gherkin
Feature: get_transcript retrieves a Grain transcript for a client

  Background:
    Given "alice" is authenticated with access to "Total Life"
    And a transcript exists for "Total Life" on 2026-02-28

  Scenario: Retrieve transcript for a specific date
    When alice calls get_transcript with client="Total Life" and date="2026-02-28"
    Then the tool calls GET /clients/{id}/transcripts?date=2026-02-28
    And returns the transcript header and content

  Scenario: Retrieve most recent transcript without date
    When alice calls get_transcript with client="Total Life" (no date)
    Then the tool calls GET /clients/{id}/transcripts with no date filter
    And returns the most recent transcript

  Scenario: Transcript content is truncated if long
    Given the transcript for "Total Life" on 2026-02-28 is 5000 characters long
    When alice calls get_transcript with client="Total Life" and date="2026-02-28"
    Then the tool returns the first 2000 characters of the transcript
    And appends: "[Transcript truncated. View the full transcript at {UI_URL}/transcripts/{id}]"

  Scenario: No transcript found for specified date
    When alice calls get_transcript with client="Total Life" and date="2020-01-01"
    Then the API returns 404
    And the tool returns: "No transcript found for Total Life on 2020-01-01."

  Scenario: No date specified and no transcripts exist
    Given "Total Life" has no transcripts
    When alice calls get_transcript with client="Total Life"
    Then the tool returns: "No transcript found for Total Life."
```

---

## Feature: Error handling across all tools

```gherkin
Feature: All tools handle errors gracefully without exposing internal details

  Scenario: API is unreachable (network error)
    Given the API layer is not accessible
    When any MCP tool is called
    Then the tool returns: "Could not reach the iExcel API. Check your network connection and try again."
    And no stack trace or raw error is included in the response

  Scenario: API returns an unexpected 500 error
    Given the API layer returns a 500 Internal Server Error
    When any MCP tool is called
    Then the tool returns: "An unexpected server error occurred. Try again shortly."

  Scenario: Tool output never contains a UUID
    When any MCP tool returns a successful response
    Then the response contains short IDs (TSK-####, AGD-####) rather than UUIDs

  Scenario: Tool output never contains credentials
    When any MCP tool is called with a user access token
    Then the tool response does not include the token value
    And the log entries do not include the token value
```
