# GS — Gherkin Specification
# Feature 33: Terminal MCP Tools

**Date:** 2026-03-03

---

## Feature: MCP Configuration and Authentication

```gherkin
Feature: Terminal MCP server connection and authentication

  Background:
    Given the Mastra MCP server is running at the configured URL
    And the user has authenticated via device flow (Feature 32)
    And the token file exists at ~/.iexcel/auth/tokens.json with a valid access token

  Scenario: Claude Code connects to the Mastra MCP server
    Given Claude Code has the .mcp.json configuration file in the project root
    When the user starts a Claude Code session
    Then Claude Code discovers the "iexcel-mastra" MCP server
    And the server's 10 tools are available in the Claude Code tool list

  Scenario: Claw connects to the Mastra MCP server
    Given Claw has the iExcel MCP server configured
    When the user starts a Claw session
    Then Claw discovers the Mastra MCP server
    And the server's 10 tools are available in the session

  Scenario: Access token is attached to every MCP tool call
    When any MCP tool is invoked from the terminal
    Then the HTTP request to the Mastra MCP server includes an "Authorization" header
    And the header value is "Bearer <valid_access_token>"

  Scenario: User is prompted to authenticate when no session exists
    Given no token file exists at ~/.iexcel/auth/tokens.json
    When an MCP tool is called for the first time
    Then the terminal displays "To authenticate, visit: https://auth.iexcel.com/device"
    And the terminal displays "Enter code: XXXX-XXXX"
    And the tool call waits until authentication completes
    And upon successful authentication the tool call proceeds

  Scenario: Token is transparently refreshed when expired
    Given the access token in ~/.iexcel/auth/tokens.json has expired
    And a valid refresh token exists
    When an MCP tool is called
    Then getValidAccessToken() silently obtains a new access token
    And the tool call proceeds with the new token
    And the user sees no interruption or error

  Scenario: User is prompted to re-authenticate when refresh token is expired
    Given the access token has expired
    And the refresh token has also expired
    When an MCP tool is called
    Then the terminal prompts the user to re-authenticate via device flow
    And the tool call proceeds after successful re-authentication
```

---

## Feature: get_agenda tool

```gherkin
Feature: Retrieve current agenda for a client

  Background:
    Given the user is authenticated
    And a client named "Total Life" exists and is accessible to the user
    And an agenda with ID "AGD-0015" exists for "Total Life" in "draft" status

  Scenario: Retrieve agenda by client name
    When the user asks "What's the agenda looking like for Total Life?"
    And Claude calls get_agenda(client="Total Life")
    Then the response includes the agenda content for "Total Life"
    And the response includes the short ID "AGD-0015"
    And the response is formatted as structured text with section headings

  Scenario: Retrieve agenda by client ID
    When Claude calls get_agenda(client="client-uuid-123")
    Then the response includes the agenda for the matching client
    And short IDs are used throughout the output

  Scenario: No agenda exists for the client
    Given no agenda exists for "Total Life"
    When Claude calls get_agenda(client="Total Life")
    Then the response is "No agenda found for Total Life. Run trigger_agenda to generate one."

  Scenario: Client name does not match any client
    When Claude calls get_agenda(client="Nonexistent Corp")
    Then the response is "No client named 'Nonexistent Corp' found. Use list_clients to see available clients."
```

---

## Feature: get_tasks tool

```gherkin
Feature: List tasks for a client

  Background:
    Given the user is authenticated
    And "Total Life" has 3 draft tasks: TSK-0042, TSK-0043, TSK-0044
    And "Total Life" has 1 approved task: TSK-0040

  Scenario: List all tasks for a client
    When Claude calls get_tasks(client="Total Life")
    Then the response is a table with 4 rows
    And each row includes: Short ID, Description, Estimated Time, Status

  Scenario: List draft tasks only
    When Claude calls get_tasks(client="Total Life", status="draft")
    Then the response is a table with 3 rows (TSK-0042, TSK-0043, TSK-0044)
    And all rows show Status = "draft"

  Scenario: List approved tasks only
    When Claude calls get_tasks(client="Total Life", status="approved")
    Then the response is a table with 1 row (TSK-0040)

  Scenario: No tasks match the filter
    When Claude calls get_tasks(client="Total Life", status="completed")
    Then the response is "No completed tasks found for Total Life."

  Scenario: Short IDs appear in the task table
    When Claude calls get_tasks(client="Total Life")
    Then the response contains task IDs in the format TSK-####
    And no UUIDs are visible in the output
```

---

## Feature: trigger_intake tool

```gherkin
Feature: Trigger Workflow A — intake transcript to draft tasks

  Background:
    Given the user is authenticated
    And "Total Life" has a Grain transcript from today

  Scenario: Trigger intake with default transcript
    When the user says "Process the intake call from today"
    And Claude calls trigger_intake(client="Total Life", date="today")
    Then a workflow is initiated
    And the terminal polls for workflow completion
    And upon completion the response includes a task table with draft tasks
    And the task table includes short IDs in TSK-#### format
    And the response ends with guidance: "Review the tasks above. Use edit_task, approve_tasks, or reject_task to manage them."

  Scenario: Trigger intake for a specific date
    When Claude calls trigger_intake(client="Total Life", date="2026-02-28")
    Then the workflow processes the transcript from 2026-02-28
    And draft tasks are returned

  Scenario: Workflow completes successfully
    When trigger_intake is called and the workflow finishes within 120 seconds
    Then the draft tasks are displayed in a formatted table

  Scenario: Workflow exceeds timeout
    When trigger_intake is called and the workflow does not complete within 120 seconds
    Then the response is "The intake workflow is taking longer than expected. Check status with get_tasks(client='Total Life', status='draft')."

  Scenario: No transcript found for the date
    Given no transcript exists for "Total Life" on the specified date
    When Claude calls trigger_intake(client="Total Life", date="2026-02-20")
    Then the response is "No transcript found for Total Life on 2026-02-20. Verify the date or provide a transcript source."
```

---

## Feature: trigger_agenda tool

```gherkin
Feature: Trigger Workflow B — completed tasks to agenda

  Background:
    Given the user is authenticated
    And "Total Life" has 5 completed tasks from the past week

  Scenario: Trigger agenda generation
    When the user says "Build the agenda for Total Life"
    And Claude calls trigger_agenda(client="Total Life")
    Then a workflow is initiated
    And upon completion the response shows a summary of the generated agenda sections
    And the full agenda is accessible via get_agenda

  Scenario: No completed tasks found
    Given "Total Life" has no completed tasks
    When Claude calls trigger_agenda(client="Total Life")
    Then the response is "No completed tasks found for Total Life in the specified cycle. Ensure tasks are marked completed before generating an agenda."

  Scenario: Trigger agenda for a specific cycle
    When Claude calls trigger_agenda(client="Total Life", cycle_start="2026-02-17", cycle_end="2026-02-28")
    Then the workflow filters completed tasks within that date range
```

---

## Feature: get_client_status tool

```gherkin
Feature: Get client cycle status overview

  Background:
    Given the user is authenticated
    And "Total Life" is an active client with 3 draft tasks and no agenda

  Scenario: Retrieve client status
    When Claude calls get_client_status(client="Total Life")
    Then the response includes:
      | Field          | Value                    |
      | Client         | Total Life               |
      | Draft Tasks    | 3 pending approval       |
      | Agenda         | Not yet generated        |
    And the draft task IDs are listed (TSK-0042, TSK-0043, TSK-0044)

  Scenario: Client with a ready agenda
    Given "Total Life" has a finalized agenda
    When Claude calls get_client_status(client="Total Life")
    Then the Agenda field shows "Ready (AGD-0015)"

  Scenario: Client with no pending tasks and no agenda
    Given "Total Life" has no draft tasks and no agenda
    When Claude calls get_client_status(client="Total Life")
    Then the response indicates no pending actions
```

---

## Feature: list_clients tool

```gherkin
Feature: List accessible clients

  Background:
    Given the user is authenticated
    And the user has access to 3 clients: "Total Life", "Acme Corp", "Beta Ltd"

  Scenario: List all clients
    When Claude calls list_clients()
    Then the response is a table with 3 rows
    And each row includes the client name and status

  Scenario: User has no accessible clients
    Given the user has access to 0 clients
    When Claude calls list_clients()
    Then the response is "No clients found for your account. Contact your administrator."
```

---

## Feature: edit_task tool

```gherkin
Feature: Edit a task by short ID

  Background:
    Given the user is authenticated
    And task TSK-0043 exists in "draft" status for "Total Life"

  Scenario: Update estimated time
    When the user says "Change TSK-0043 to 1 hour"
    And Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m")
    Then the API receives PATCH /tasks/TSK-0043 with estimated_time="1h 00m"
    And the response is "Task TSK-0043 updated. Estimated time: 1h 00m"

  Scenario: Update assignee and estimated time
    When Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m", assignee="Mike")
    Then both fields are updated in a single PATCH call
    And the response confirms both changes

  Scenario: No editable fields provided
    When Claude calls edit_task(id="TSK-0043")
    Then the response is "Please specify at least one field to update (description, assignee, estimated_time, workspace)."

  Scenario: Invalid estimated time format
    When Claude calls edit_task(id="TSK-0043", estimated_time="90 minutes")
    Then the response is "Invalid time format. Use format '1h 30m' or '0h 45m'."

  Scenario: Attempt to edit an approved task
    Given task TSK-0040 is in "approved" status
    When Claude calls edit_task(id="TSK-0040", description="Updated")
    Then the response is "TSK-0040 cannot be edited — it is in 'approved' status. Only draft tasks can be edited."

  Scenario: Task not found
    When Claude calls edit_task(id="TSK-9999")
    Then the response is "No task found with ID TSK-9999."
```

---

## Feature: reject_task tool

```gherkin
Feature: Reject a task by short ID

  Background:
    Given the user is authenticated
    And task TSK-0044 exists in "draft" status

  Scenario: Reject a draft task
    When the user says "Reject TSK-0044, that's not our scope"
    And Claude calls reject_task(id="TSK-0044")
    Then the API receives POST /tasks/TSK-0044/reject
    And the response is "Task TSK-0044 rejected."

  Scenario: Reject with a reason
    When Claude calls reject_task(id="TSK-0044", reason="Out of scope")
    Then the reason is passed to the API
    And the response is "Task TSK-0044 rejected."

  Scenario: Attempt to reject an already-approved task
    Given task TSK-0040 is in "approved" status
    When Claude calls reject_task(id="TSK-0040")
    Then the response is "TSK-0040 cannot be rejected — it is in 'approved' status."

  Scenario: Task not found
    When Claude calls reject_task(id="TSK-9999")
    Then the response is "No task found with ID TSK-9999."
```

---

## Feature: approve_tasks tool

```gherkin
Feature: Approve one or more tasks by short ID

  Background:
    Given the user is authenticated
    And tasks TSK-0042, TSK-0043 exist in "draft" status
    And task TSK-0044 exists in "draft" status

  Scenario: Approve a single task
    When the user says "Approve TSK-0042"
    And Claude calls approve_tasks(ids="TSK-0042")
    Then the API receives POST /tasks/TSK-0042/approve
    And the response is "Task TSK-0042 approved."

  Scenario: Approve multiple tasks in batch
    When the user says "Approve all except TSK-0044"
    And Claude calls approve_tasks(ids=["TSK-0042", "TSK-0043"])
    Then the API receives a batch approve call with both IDs
    And the response is "2 tasks approved: TSK-0042, TSK-0043."

  Scenario: Batch approval with one ineligible task
    Given task TSK-0040 is in "approved" status
    When Claude calls approve_tasks(ids=["TSK-0042", "TSK-0040"])
    Then TSK-0042 is approved
    And TSK-0040 is skipped
    And the response is "1 task approved: TSK-0042. TSK-0040 was not in draft status and was skipped."

  Scenario: None of the provided IDs are found
    When Claude calls approve_tasks(ids=["TSK-9998", "TSK-9999"])
    Then the response is "None of the provided task IDs could be found. Check IDs with get_tasks."

  Scenario: Single-ID input as string (not array)
    When Claude calls approve_tasks(ids="TSK-0042")
    Then the tool treats it as a single-item approval
    And the response is "Task TSK-0042 approved."
```

---

## Feature: get_transcript tool

```gherkin
Feature: Retrieve transcript for a client

  Background:
    Given the user is authenticated
    And "Total Life" has a transcript from 2026-03-01

  Scenario: Retrieve most recent transcript
    When Claude calls get_transcript(client="Total Life")
    Then the response includes the most recent transcript header and content
    And the header shows date, duration, and participants

  Scenario: Retrieve transcript by date
    When Claude calls get_transcript(client="Total Life", date="2026-03-01")
    Then the response includes the transcript from 2026-03-01

  Scenario: Long transcript is truncated
    Given the transcript for "Total Life" is 5000 characters
    When Claude calls get_transcript(client="Total Life")
    Then the response includes the first 2000 characters
    And the response ends with "[Transcript truncated. Full version at {UI_URL}]"

  Scenario: No transcript found for the date
    When Claude calls get_transcript(client="Total Life", date="2020-01-01")
    Then the response is "No transcript found for Total Life on 2020-01-01."
```

---

## Feature: Error Handling

```gherkin
Feature: Uniform error handling across all tools

  Scenario: API returns 403 Forbidden
    Given the user does not have access to client "Restricted Corp"
    When any tool is called with client="Restricted Corp"
    Then the response is "You don't have permission to access this resource. Contact your administrator."
    And no stack trace or raw JSON is displayed

  Scenario: API returns 401 Unauthorized (session expired mid-session)
    Given the access token has expired and the refresh token has also expired
    When any tool is called
    Then the response is "Your session has expired. Please authenticate: run iexcel login."

  Scenario: Mastra MCP server is unreachable
    Given the Mastra MCP server is not running
    When any tool is called
    Then the response is "Cannot connect to the iExcel Mastra server at {MASTRA_MCP_URL}. Ensure the server is running."

  Scenario: Network error during API call
    Given the network connection is interrupted
    When any tool is called
    Then the response is "Could not reach the iExcel API. Check your network connection and try again."

  Scenario: Invalid short ID format
    When Claude calls reject_task(id="TASK-0044")
    Then the response is "'TASK-0044' is not a valid task ID. Use the format TSK-0042."
```

---

## Feature: Full Session Integration

```gherkin
Feature: End-to-end terminal session for post-intake review

  Background:
    Given the user is authenticated as an account manager
    And "Total Life" has an intake transcript from today

  Scenario: Complete post-intake review session
    When the user says "Process the intake call from today for Total Life"
    And Claude calls trigger_intake(client="Total Life", date="today")
    Then draft tasks are generated and displayed:
      """
      | ID       | Description                           | Time   | Status |
      |----------|---------------------------------------|--------|--------|
      | TSK-0042 | Set up GA4 tracking for landing pages | 1h 30m | draft  |
      | TSK-0043 | Update DNS records for subdomain      | 0h 45m | draft  |
      | TSK-0044 | Design email template for Q2 campaign | 3h 00m | draft  |
      """

    When the user says "Change TSK-0043 to 1 hour and assign it to Mike"
    And Claude calls edit_task(id="TSK-0043", estimated_time="1h 00m", assignee="Mike")
    Then the response confirms TSK-0043 is updated

    When the user says "Approve all except TSK-0044"
    And Claude calls approve_tasks(ids=["TSK-0042", "TSK-0043"])
    Then the response confirms 2 tasks approved

    When the user says "Reject TSK-0044, not in scope"
    And Claude calls reject_task(id="TSK-0044")
    Then the response confirms TSK-0044 rejected

    And the session completes without requiring a browser or web UI
```
