# Gherkin Specification
# Feature 19: Workflow A — Intake Agent

**Feature Name:** workflow-a-intake-agent
**Date:** 2026-03-03

---

## Feature: Intake Agent — Core Extraction

```gherkin
Feature: Intake Agent extracts action items from normalized transcripts
  As the Mastra workflow runtime
  I need the intake agent to parse a NormalizedTranscript and produce structured draft tasks
  So that iExcel account managers receive pre-built task drafts without manual extraction

  Background:
    Given the Mastra runtime is running with the intake agent registered
    And the service token manager has a valid access token
    And the api-client is configured with the service token provider
    And a client with id "client-uuid-001" exists in the system
    And a transcript with id "transcript-uuid-001" exists for client "client-uuid-001"
    And the transcript has meeting_type "intake"
    And the transcript has 3 segments with action items assigned to iExcel team members
```

---

### Scenario: Successful extraction of multiple tasks from intake transcript

```gherkin
  Scenario: Agent extracts and saves multiple tasks from a well-formed intake transcript
    Given the transcript contains the following action items:
      | action                              | assignee | estimated_time |
      | Update proposal with Q2 pricing     | Mark     | 2 hours        |
      | Send follow-up email to client      | Sarah    | 30 minutes     |
      | Build campaign report in Looker     | Dev Team | 4 hours        |
    When the intake agent is invoked with workflowRunId "run-uuid-001", clientId "client-uuid-001", transcriptId "transcript-uuid-001"
    Then the agent retrieves the transcript via getTranscriptTool
    And the agent updates the workflow run to status "running"
    And the agent calls the LLM with the assembled prompt containing the transcript content
    And the LLM returns a tasks array with 3 task objects
    And each task object has all three description sections populated: taskContext, additionalContext, requirements
    And the agent calls saveTasksTool 3 times, once per task
    And each API call is made to POST /clients/client-uuid-001/tasks
    And each task is created with status "draft"
    And the agent updates the workflow run to status "completed" with result containing 3 task short IDs
```

### Scenario: Task titles are concise and actionable

```gherkin
  Scenario: Agent generates properly formatted task titles
    Given a transcript where an account manager says "we need to get the proposal updated with the new pricing by end of week"
    When the intake agent processes the transcript
    Then the generated task title is a concise verb phrase no longer than 255 characters
    And the title does not contain generic words like "Task" or "Item" as the entire title
    And the title reflects the specific action from the transcript
```

### Scenario: Task descriptions contain all three required sections

```gherkin
  Scenario: Agent produces complete three-section descriptions
    Given a transcript with one clear action item
    When the intake agent processes the transcript
    Then the created task description has a non-empty taskContext field
    And the taskContext field includes a reference to the call date
    And the created task description has a non-empty additionalContext field
    And the created task description has a non-empty requirements field
    And the requirements field includes specific steps or acceptance criteria
```

### Scenario: Transcript quotes are included in Task Context

```gherkin
  Scenario: Agent includes relevant transcript quotes in task context
    Given a transcript where the client says "We need the monthly report by the 5th of every month, without exception" at timestamp 00:14:32
    And the meeting date is "2026-02-15"
    When the intake agent processes the transcript
    And the resulting task is about the monthly report
    Then the taskContext description section includes a verbatim or closely paraphrased quote
    And the quote is attributed with the call date "February 15, 2026"
```

---

## Feature: Intake Agent — Assignee Extraction

```gherkin
Feature: Intake Agent correctly handles assignee extraction
  The agent must extract assignees from transcript content without inventing them
```

### Scenario: Agent extracts explicitly named assignee

```gherkin
  Scenario: Agent correctly assigns task to named team member
    Given a transcript segment where the account manager says "Mark, you'll handle the SEO audit"
    When the intake agent processes the transcript
    Then the task for the SEO audit has assignee set to "Mark"
```

### Scenario: Agent leaves assignee null when ambiguous

```gherkin
  Scenario: Agent does not invent assignees for ambiguous mentions
    Given a transcript segment where the account manager says "someone needs to check the analytics dashboard"
    When the intake agent processes the transcript
    Then the task for checking the analytics dashboard has assignee set to null
```

### Scenario: Agent leaves assignee null when unmentioned

```gherkin
  Scenario: Agent leaves assignee null when transcript does not specify
    Given a transcript that mentions a task without naming an assignee
    When the intake agent processes the transcript
    Then the task has assignee set to null
    And the task is still created with status "draft"
```

---

## Feature: Intake Agent — Estimated Time

```gherkin
Feature: Intake Agent provides estimated time for every task
```

### Scenario: Agent uses transcript-stated estimate

```gherkin
  Scenario: Transcript-stated estimate takes priority
    Given a transcript segment where the account manager says "that should take about 3 hours"
    When the intake agent processes the transcript for the corresponding task
    Then the task estimatedTime is set to "PT3H"
    And the estimatedTime is in ISO 8601 duration format
```

### Scenario: Agent applies industry-standard estimate when not stated

```gherkin
  Scenario: Agent estimates time based on task type when transcript is silent
    Given a transcript where an action item is to "write a blog post about the product launch"
    And the transcript does not mention any time estimate for this item
    When the intake agent processes the transcript
    Then the task estimatedTime is not null
    And the estimatedTime reflects a reasonable estimate for writing a blog post
    And the estimatedTime is in ISO 8601 duration format (e.g., "PT3H" or "PT4H")
```

### Scenario: Every task has an estimatedTime regardless of transcript content

```gherkin
  Scenario: No task is saved without an estimatedTime
    Given a transcript with 5 action items, none of which specify time estimates
    When the intake agent processes the transcript
    Then all 5 tasks are saved with non-null estimatedTime values
    And all estimatedTime values are valid ISO 8601 duration strings
```

---

## Feature: Intake Agent — Scrum Stage Default

```gherkin
Feature: Intake Agent sets Backlog as the default scrum stage
```

### Scenario: All agent-generated tasks default to Backlog

```gherkin
  Scenario: scrumStage is always Backlog for new tasks
    Given a transcript with multiple action items
    When the intake agent processes the transcript
    Then every created task has scrumStage equal to "Backlog"
    And no task has any other scrumStage value
```

---

## Feature: Intake Agent — Edge Cases

```gherkin
Feature: Intake Agent handles edge cases gracefully
```

### Scenario: Transcript contains no action items

```gherkin
  Scenario: Agent completes successfully when no action items are found
    Given a transcript that is purely informational with no tasks assigned to iExcel team members
    When the intake agent is invoked
    Then the LLM returns an empty tasks array
    And the agent does NOT call saveTasksTool
    And the agent updates the workflow run to status "completed"
    And the workflow result contains task_short_ids as an empty array
    And the workflow result contains an explanation field with a human-readable message
    And no error is thrown
```

### Scenario: Transcript has no segments but has a summary

```gherkin
  Scenario: Agent processes summary-only transcript
    Given a transcript with an empty segments array
    And the transcript has a non-null summary field with action item content
    When the intake agent is invoked
    Then the agent does not fail with EMPTY_TRANSCRIPT
    And the agent uses the summary content for LLM processing
    And tasks are extracted from the summary if action items are present
```

### Scenario: Transcript has neither segments nor summary

```gherkin
  Scenario: Agent fails gracefully when transcript has no processable content
    Given a transcript with an empty segments array
    And the transcript has a null summary
    When the intake agent is invoked
    Then the agent updates the workflow run to status "failed"
    And the error code is "EMPTY_TRANSCRIPT"
    And no LLM call is made
    And no tasks are saved
```

### Scenario: clientId in transcript does not match invocation clientId

```gherkin
  Scenario: Agent rejects mismatched client context
    Given a transcript that belongs to client "client-uuid-002"
    And the agent is invoked with clientId "client-uuid-001"
    When the agent retrieves and validates the transcript
    Then the agent updates the workflow run to status "failed"
    And the error code is "CLIENT_MISMATCH"
    And no LLM call is made
    And no tasks are saved
```

---

## Feature: Intake Agent — LLM Retry Behavior

```gherkin
Feature: Intake Agent retries LLM calls when output is invalid
```

### Scenario: Agent retries on invalid LLM output schema

```gherkin
  Scenario: LLM returns malformed JSON on first attempt, valid on second
    Given the LLM returns invalid JSON on attempt 1
    And the LLM returns valid JSON conforming to the task schema on attempt 2
    When the intake agent processes the transcript
    Then the agent makes 2 LLM calls total
    And a warn log is emitted for the failed attempt 1
    And tasks are saved from the valid second response
    And the workflow run is updated to "completed"
```

### Scenario: Agent fails after 3 invalid LLM responses

```gherkin
  Scenario: All LLM retry attempts produce invalid output
    Given the LLM returns invalid JSON on all 3 attempts
    When the intake agent processes the transcript
    Then the agent makes exactly 3 LLM calls
    And an error log is emitted for the exhausted retries
    And the workflow run is updated to status "failed"
    And the error code is "LLM_OUTPUT_INVALID"
    And no tasks are saved
```

---

## Feature: Intake Agent — Partial Task Failure

```gherkin
Feature: Intake Agent handles partial save failures without aborting
```

### Scenario: Some tasks fail to save but others succeed

```gherkin
  Scenario: Agent continues saving remaining tasks when one fails
    Given the LLM extracts 4 tasks from the transcript
    And the API returns a 422 error for the 2nd task (validation error)
    When the intake agent saves tasks
    Then tasks 1, 3, and 4 are saved successfully
    And task 2 is logged as failed with a warn log entry
    And the workflow run is updated to status "completed"
    And the result contains task_short_ids for the 3 successfully saved tasks
    And tasks_attempted is 4
    And tasks_created is 3
    And tasks_failed is 1
```

### Scenario: All task saves fail

```gherkin
  Scenario: Workflow marked failed when no tasks can be saved
    Given the LLM extracts 3 tasks from the transcript
    And the API returns a 503 error for all 3 save attempts
    When the intake agent attempts to save tasks
    Then all 3 save attempts are made
    And all fail
    And the workflow run is updated to status "failed"
    And the error code is "TASK_CREATION_FAILED"
```

---

## Feature: Intake Agent — Client Scoping Guardrail

```gherkin
Feature: Intake Agent enforces strict client isolation
```

### Scenario: Agent never creates tasks for a different client

```gherkin
  Scenario: All created tasks carry the correct clientId
    Given the agent is invoked with clientId "client-uuid-001"
    And the transcript contains 3 action items
    When the agent calls saveTasksTool for each task
    Then every API call to POST /clients/{id}/tasks uses clientId "client-uuid-001"
    And no task is created under any other clientId
```
