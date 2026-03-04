# Gherkin Specification
# Feature 20: Workflow B — Agenda Agent

**Feature Name:** workflow-b-agenda-agent
**Date:** 2026-03-03

---

## Feature: Agenda Agent — Core Generation

```gherkin
Feature: Agenda Agent generates Running Notes from reconciled task data
  As the Mastra workflow runtime
  I need the agenda agent to produce a six-section Running Notes document
  So that account managers have a pre-built draft ready for client follow-up calls

  Background:
    Given the Mastra runtime is running with the agenda agent registered
    And the service token manager has a valid access token
    And the api-client is configured with the service token provider
    And a client with id "client-uuid-001" and name "Total Life" exists in the system
    And the workflow invocation carries workflowRunId "run-uuid-002", clientId "client-uuid-001"
    And cycleStart is "2026-02-01" and cycleEnd is "2026-02-28"
```

---

### Scenario: Successful agenda generation from completed tasks

```gherkin
  Scenario: Agent generates a complete six-section Running Notes document
    Given the reconciled task data contains 8 completed tasks grouped across 3 themes:
      | shortId  | title                                      | asanaStatus | theme          |
      | TSK-0042 | Update proposal with Q2 pricing            | completed   | Sales Collateral |
      | TSK-0043 | Review brand guidelines document           | completed   | Sales Collateral |
      | TSK-0044 | Set up Google Analytics 4 tracking         | completed   | Analytics      |
      | TSK-0045 | Configure conversion events in GA4         | completed   | Analytics      |
      | TSK-0046 | Write Q1 campaign brief                    | completed   | Marketing      |
      | TSK-0047 | Create social media content calendar       | completed   | Marketing      |
      | TSK-0048 | Draft email sequence for new leads         | completed   | Marketing      |
      | TSK-0049 | Audit existing email list segments         | completed   | Marketing      |
    And the reconciled task data contains 2 incomplete tasks
    When the agenda agent is invoked
    Then the agent retrieves reconciled tasks via getReconciledTasksTool
    And the agent classifies 8 tasks as completed and 2 as incomplete
    And the agent updates the workflow run to status "running"
    And the agent calls the LLM with formatted task data
    And the LLM returns a content field containing a markdown Running Notes document
    And the document contains all six section headers:
      | ## Completed Tasks        |
      | ## Incomplete Tasks       |
      | ## Relevant Deliverables  |
      | ## Recommendations        |
      | ## New Ideas              |
      | ## Next Steps             |
    And the agent saves the agenda via saveDraftAgendaTool
    And the saved agenda has status "draft"
    And the agent updates the workflow run to status "completed"
    And the result contains agenda_short_id matching an "AGD-NNNN" pattern
```

### Scenario: Completed Tasks section uses theme-based prose summaries

```gherkin
  Scenario: Completed tasks are grouped by theme, not listed individually
    Given the reconciled task data contains 4 completed tasks all related to "Analytics" setup
    When the agenda agent processes the data
    Then the LLM prompt instructs the model to group by theme/project
    And the generated Completed Tasks section does NOT contain a raw bullet list of task titles
    And the Completed Tasks section contains at least one prose paragraph summarizing the Analytics work
    And the prose paragraph reads as a coherent summary, not a task title concatenation
```

### Scenario: Incomplete tasks appear in Incomplete Tasks section

```gherkin
  Scenario: Incomplete and not_found tasks populate the Incomplete Tasks section
    Given the reconciled task data contains:
      | shortId  | title                          | asanaStatus |
      | TSK-0050 | Publish Q2 campaign landing page | incomplete  |
      | TSK-0051 | Integrate CRM with email tool   | not_found   |
    When the agenda agent processes the data
    Then the generated Incomplete Tasks section references work not yet finished
    And TSK-0051 (not_found status) is reflected in the Incomplete Tasks section
    And TSK-0051 is not referenced in the Completed Tasks section
```

### Scenario: Document header contains client name and cycle date range

```gherkin
  Scenario: Document header is correctly formatted
    Given cycleStart is "2026-02-01" and cycleEnd is "2026-02-28"
    And the client name is "Total Life"
    When the agenda agent generates the Running Notes
    Then the document begins with a line containing "Total Life"
    And the document header contains "February 1" and "February 28, 2026"
    And the header uses the H1 markdown heading level (#)
```

---

## Feature: Agenda Agent — Advisory Sections

```gherkin
Feature: Agenda Agent generates context-aware advisory sections
  The three advisory sections (Recommendations, New Ideas, Next Steps) must be grounded
  in the actual task data provided, not generic filler content
```

### Scenario: Recommendations are grounded in completed work

```gherkin
  Scenario: Recommendations relate to the actual work completed this cycle
    Given 6 completed tasks related to setting up Google Analytics and conversion tracking
    When the agenda agent generates the document
    Then the Recommendations section contains at least 2 items
    And at least one recommendation references analytics, tracking, or related context
    And no recommendation is a completely generic statement (e.g., "Continue to work hard")
```

### Scenario: Next Steps provide forward-looking action items

```gherkin
  Scenario: Next Steps section contains specific actionable items
    Given a set of completed tasks and incomplete tasks for a client
    When the agenda agent generates the document
    Then the Next Steps section contains between 3 and 5 items
    And each item is a specific action item, not a vague statement
    And at least one next step relates to the incomplete tasks
```

### Scenario: New Ideas section is present even with limited context

```gherkin
  Scenario: New Ideas section is populated with contextually appropriate suggestions
    Given any non-empty set of completed tasks
    When the agenda agent generates the document
    Then the New Ideas section contains at least 1 item
    And the New Ideas section is not empty or placeholder text
```

---

## Feature: Agenda Agent — Guardrails

```gherkin
Feature: Agenda Agent enforces pre-generation guardrails
```

### Scenario: Agent refuses to generate agenda when no completed tasks exist

```gherkin
  Scenario: Empty completed tasks causes graceful failure
    Given the reconciled task data returns 5 tasks, all with asanaStatus "incomplete"
    And zero tasks have asanaStatus "completed"
    When the agenda agent is invoked
    Then the agent classifies 0 tasks as completed
    And the agent does NOT call the LLM
    And the agent does NOT call saveDraftAgendaTool
    And the agent updates the workflow run to status "failed"
    And the workflow run error code is "NO_COMPLETED_TASKS"
    And the workflow run error message is human-readable and explains no completed tasks were found
```

### Scenario: Agent refuses to generate when reconciled task data is empty

```gherkin
  Scenario: No tasks in cycle window causes graceful failure
    Given the getReconciledTasksTool returns an empty tasks array
    When the agenda agent is invoked
    Then the agent does NOT call the LLM
    And the workflow run is updated to status "failed"
    And the error code is "NO_COMPLETED_TASKS"
```

### Scenario: All tasks are incomplete

```gherkin
  Scenario: All tasks still pending — no agenda generated
    Given 10 tasks for the client, all with asanaStatus "incomplete" or "not_found"
    When the agenda agent is invoked
    Then no agenda is created
    And the workflow run is marked failed with NO_COMPLETED_TASKS
```

---

## Feature: Agenda Agent — LLM Output Validation

```gherkin
Feature: Agenda Agent validates LLM output before saving
```

### Scenario: Agent rejects LLM output missing required sections

```gherkin
  Scenario: LLM response missing a required section triggers retry
    Given the LLM returns a response that is missing the "## New Ideas" section on attempt 1
    And the LLM returns a valid complete response on attempt 2
    When the agenda agent processes the LLM output
    Then the agent detects the missing section on attempt 1
    And a warn log is emitted for the missing section
    And the agent retries the LLM call
    And the second response is accepted
    And the agenda is saved with the valid content
```

### Scenario: All LLM attempts produce incomplete output

```gherkin
  Scenario: Three consecutive invalid LLM responses cause failure
    Given the LLM returns responses missing required sections on all 3 attempts
    When the agenda agent exhausts all retries
    Then the workflow run is updated to status "failed"
    And the error code is "LLM_OUTPUT_INVALID"
    And no agenda is saved
```

### Scenario: LLM content minimum length enforced

```gherkin
  Scenario: Degenerate short response is rejected
    Given the LLM returns a response with a content field only 50 characters long
    When the agent validates the output
    Then the response is rejected due to failing the minimum length check (100 chars)
    And the agent retries the LLM call
```

---

## Feature: Agenda Agent — Task Retrieval

```gherkin
Feature: Agenda Agent fetches reconciled tasks correctly
```

### Scenario: Agent fetches tasks scoped to the correct client and cycle

```gherkin
  Scenario: getReconciledTasksTool is called with correct parameters
    Given the agent is invoked with clientId "client-uuid-001", cycleStart "2026-02-01", cycleEnd "2026-02-28"
    When the agent retrieves reconciled tasks
    Then getReconciledTasksTool is called with clientId "client-uuid-001"
    And the tool is called with cycleStart "2026-02-01" and cycleEnd "2026-02-28"
    And the tool is called with status filter "pushed"
```

### Scenario: Task retrieval API error causes failure

```gherkin
  Scenario: API error during task retrieval marks workflow as failed
    Given the API returns a 503 error when getReconciledTasksTool is called
    When the agenda agent attempts to retrieve tasks
    Then the agent does not call the LLM
    And the agent does not attempt to save an agenda
    And the workflow run is updated to status "failed"
    And the error code is "TASK_RETRIEVAL_FAILED"
```

---

## Feature: Agenda Agent — Agenda Persistence

```gherkin
Feature: Agenda Agent saves draft agendas correctly
```

### Scenario: Agenda is saved with correct metadata

```gherkin
  Scenario: saveDraftAgendaTool is called with correct parameters
    Given the LLM returns a valid Running Notes document
    When the agent saves the agenda
    Then saveDraftAgendaTool is called with clientId "client-uuid-001"
    And the tool is called with cycleStart "2026-02-01" and cycleEnd "2026-02-28"
    And the tool is called with the full markdown content from the LLM response
    And the saved agenda has status "draft"
```

### Scenario: Agenda save failure marks workflow as failed

```gherkin
  Scenario: API error during agenda save causes failure
    Given the LLM returns valid content
    And the API returns a 422 error when saveDraftAgendaTool is called
    When the agent attempts to save the agenda
    Then the workflow run is updated to status "failed"
    And the error code is "AGENDA_SAVE_FAILED"
    And a structured error log is emitted
```

### Scenario: Saved agenda carries correct short ID in workflow result

```gherkin
  Scenario: Workflow result contains agenda short ID
    Given the LLM returns valid content
    And saveDraftAgendaTool returns shortId "AGD-0015"
    When the agent completes successfully
    Then the workflow status is updated to "completed"
    And the result contains agenda_short_id "AGD-0015"
    And the result contains tasks_analyzed, tasks_completed, and tasks_incomplete counts
```

---

## Feature: Agenda Agent — Workflow Status Lifecycle

```gherkin
Feature: Agenda Agent manages workflow run status transitions correctly
```

### Scenario: Status transitions follow correct order

```gherkin
  Scenario: Agent transitions workflow through pending to running to completed
    Given a successful end-to-end run
    When the agent processes the invocation
    Then the first call to updateWorkflowStatusTool uses status "running"
    And the last call to updateWorkflowStatusTool uses status "completed"
    And no "failed" status is set during a successful run
```

### Scenario: Failure before running status is set still marks run as failed

```gherkin
  Scenario: Task retrieval failure sets status to failed without running first
    Given the task retrieval API call fails immediately
    When the agent cannot retrieve tasks
    Then the workflow run is updated to "failed" directly
    And the workflow run never transitions to "running"
```

---

## Feature: Agenda Agent — Client Scoping

```gherkin
Feature: Agenda Agent enforces strict client isolation
```

### Scenario: Agenda is always created for the correct client

```gherkin
  Scenario: All API calls use the invocation clientId
    Given the agent is invoked with clientId "client-uuid-001"
    When the agent retrieves tasks and saves the agenda
    Then getReconciledTasksTool is called with clientId "client-uuid-001"
    And saveDraftAgendaTool is called with clientId "client-uuid-001"
    And no API calls reference any other clientId
```

### Scenario: not_found tasks are included as incomplete, not silently dropped

```gherkin
  Scenario: Tasks with not_found Asana status appear in Incomplete Tasks
    Given 2 tasks with asanaStatus "not_found" and 6 tasks with asanaStatus "completed"
    When the agenda agent processes the data
    Then the total tasks_analyzed count in the workflow result is 8
    And the tasks_incomplete count is 2
    And the Incomplete Tasks section of the Running Notes references these outstanding items
```
