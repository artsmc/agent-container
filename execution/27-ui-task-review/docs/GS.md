# GS — Gherkin Specification
## Feature 27: UI Task Review
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## Feature: Task Review and Approval

```
Feature: Task Review and Approval
  As an authenticated account manager or internal team member
  I want to review, edit, filter, and approve AI-generated tasks in a structured table
  So that only reviewed and approved tasks are pushed to Asana
```

---

## Background

```gherkin
Background:
  Given I am authenticated as an account manager
  And the UI scaffolding (feature 23) is in place
  And the ui-auth-flow (feature 24) provides my role as "account_manager"
  And the api-client package (feature 22) is available
  And a client with ID "client-uuid-001" and name "Total Life" exists
  And the client has tasks including:
    | short_id  | title                        | status   | assignee  |
    | TSK-0001  | Review proposal deck         | draft    | Alice     |
    | TSK-0002  | Set up onboarding call       | approved | Bob       |
    | TSK-0003  | Send contract documents      | rejected | Alice     |
    | TSK-0004  | Update project timeline      | pushed   | Bob       |
    | TSK-0042  | Prepare Q2 business review   | draft    | Alice     |
```

---

## Page Load

```gherkin
Scenario: Task Review page loads with the full task table
  Given I navigate to "/clients/client-uuid-001/tasks"
  When the page loads
  Then I should see a loading skeleton for the task table
  When the GET /clients/client-uuid-001/tasks response resolves
  Then I should see a table with task rows
  And each row should display: checkbox, short ID, title, assignee, estimated time, scrum stage, workspace, status badge, action buttons
  And the filter bar should be visible above the table
  And the batch action bar should NOT be visible (no tasks selected)

Scenario: Page loads with pre-filtered transcript when transcript_id is in URL
  Given I navigate to "/tasks?transcript=transcript-uuid-005"
  Then the transcript filter dropdown should pre-select "transcript-uuid-005"
  And the table should show only tasks from that transcript
```

---

## Filter Bar

```gherkin
Scenario: Filtering by status shows only matching tasks
  Given I am on the Task Review page
  And the filter bar shows all tasks by default
  When I select "draft" from the status filter dropdown
  Then only tasks with status "draft" should be visible
  And the URL should include "?status=draft"

Scenario: Filtering by assignee shows only that assignee's tasks
  Given I am on the Task Review page
  When I select "Alice" from the assignee filter
  Then only tasks assigned to Alice should be visible
  And the URL should include "?assignee_id=alice-id"

Scenario: Filtering by transcript narrows the task list
  Given the client has two transcripts
  When I select the first transcript from the transcript filter
  Then only tasks from that transcript should be visible

Scenario: Multiple filters combine (AND logic)
  Given I select status "draft" and assignee "Alice"
  Then only draft tasks assigned to Alice should be visible
  And the URL should include both "?status=draft&assignee_id=alice-id"

Scenario: Clear filters resets the task list
  Given I have set status filter to "draft"
  When I click "Clear filters"
  Then all tasks should be visible again
  And the URL should have no filter params
  And the filter dropdowns should reset to "All"
```

---

## Batch Action Bar

```gherkin
Scenario: Batch action bar appears when a task is selected
  Given no tasks are selected
  And the batch action bar is not visible
  When I check the checkbox on the TSK-0001 row
  Then the batch action bar should become visible
  And it should show "1 task selected"

Scenario: Select all selects all visible tasks
  Given 5 tasks are visible (matching current filters)
  When I click "Select all"
  Then all 5 task checkboxes should be checked
  And the batch action bar should show "5 tasks selected"

Scenario: Deselect all clears selection
  Given 5 tasks are selected
  When I click "Deselect all" in the batch action bar
  Then all checkboxes should be unchecked
  And the batch action bar should hide

Scenario: Batch approve sends the correct API request and updates statuses
  Given tasks TSK-0001 and TSK-0042 are selected (both "draft")
  When I click "Approve" in the batch action bar
  Then a POST /clients/client-uuid-001/tasks/approve request should be sent
  And the request body should include the IDs of TSK-0001 and TSK-0042
  When the request succeeds
  Then TSK-0001 and TSK-0042 status badges should update to "approved"
  And the selection should be cleared

Scenario: Batch reject sends the correct API request
  Given tasks TSK-0001 and TSK-0042 are selected
  When I click "Reject" in the batch action bar
  Then a POST request for batch reject should be sent with the selected task IDs
  When the request succeeds
  Then the selected tasks' status badges should update to "rejected"

Scenario: Batch approve is hidden for team_member role
  Given I am authenticated as a "team_member"
  And I select a task
  Then the batch action bar should show "1 task selected"
  And there should be NO "Approve" button in the batch action bar
  And there should be NO "Push" button in the batch action bar
```

---

## Inline Editing — Task Table

```gherkin
Scenario: Inline-editing the title field
  Given I am on the Task Review page
  And TSK-0001 has title "Review proposal deck"
  When I click on the title cell of TSK-0001
  Then an editable input should appear with the current title pre-filled
  When I type "Review updated proposal deck" and press Enter
  Then a PATCH /tasks/TSK-0001 request should be sent with the new title
  When the request succeeds
  Then the cell should show "Review updated proposal deck" in read-only mode
  And a brief green confirmation flash should appear on the cell

Scenario: Inline edit reverts on API failure
  Given I click on the title of TSK-0001 and change it to "Bad title"
  And the PATCH /tasks/TSK-0001 request returns a 500 error
  Then the title cell should revert to "Review proposal deck"
  And a row-level error indicator should appear

Scenario: Inline-editing the assignee dropdown
  Given TSK-0001 is assigned to "Alice"
  When I click on the assignee cell of TSK-0001
  Then a dropdown should appear with team member names
  When I select "Bob"
  Then a PATCH /tasks/TSK-0001 request should be sent with the new assignee
  And the assignee cell should immediately update to "Bob"

Scenario: Workspace dropdown shows client default as hint when no override exists
  Given TSK-0001 has no workspace override
  And the client's default workspace is "Total Life Workspace"
  When I look at the workspace column for TSK-0001
  Then it should show "Total Life Workspace" in a muted/italic style (indicating it's the default, not an override)

Scenario: Inline-editing the workspace dropdown sets a task-level override
  Given I click the workspace cell for TSK-0001
  When I select "Other Workspace" from the dropdown
  Then a PATCH /tasks/TSK-0001 request should be sent with "asana_workspace_id": "other-ws-id"
  And the workspace cell should show "Other Workspace" in normal (non-italic) style

Scenario: Invalid estimated time is rejected
  Given I click the estimated time cell for TSK-0001
  When I type "abc" and press Enter
  Then the cell should show an inline validation error
  And no PATCH request should be sent
```

---

## Row Actions

```gherkin
Scenario: Approve button on a draft task
  Given TSK-0001 has status "draft"
  When I click the "Approve" button on the TSK-0001 row
  Then a POST /tasks/TSK-0001/approve request should be sent
  When the request succeeds
  Then the status badge should update to "approved"
  And the "Approve" button should be replaced by a "Push" button

Scenario: Reject button on a draft task
  Given TSK-0001 has status "draft"
  When I click the "Reject" button on the TSK-0001 row
  Then a POST /tasks/TSK-0001/reject request should be sent
  When the request succeeds
  Then the status badge should update to "rejected"
  And the action buttons should be empty (no further actions available)

Scenario: Push button on an approved task
  Given TSK-0002 has status "approved"
  When I click the "Push" button on the TSK-0002 row
  Then a POST /tasks/TSK-0002/push request should be sent
  When the request succeeds
  Then the status badge should update to "pushed"
  And the "Push" button should disappear

Scenario: Push fails with WORKSPACE_NOT_CONFIGURED
  Given TSK-0042 has no workspace override and the client has no default workspace
  When I click "Approve" and then "Push" for TSK-0042
  Then the POST /tasks/TSK-0042/push request should fail with "WORKSPACE_NOT_CONFIGURED"
  And the row should show: "No workspace configured. Set one in the workspace column."
  And the task status should remain "approved"

Scenario: Action buttons are hidden for team_member role
  Given I am authenticated as a "team_member"
  When I view the task table
  Then the "Approve", "Reject", and "Push" buttons should NOT be visible on any row
```

---

## Task Detail Slide-Over Panel

```gherkin
Scenario: Clicking a Short ID opens the task detail panel
  Given I am on the Task Review page
  When I click "TSK-0042"
  Then the task detail slide-over panel should open from the right
  And the panel header should show "TSK-0042", a status badge "draft", and "Total Life"
  And the task list behind the panel should still be visible

Scenario: Panel shows title, description sections, and custom fields
  Given the task detail panel is open for TSK-0042
  Then I should see the title "Prepare Q2 business review" as an editable field
  And I should see three description sections: "Task Context", "Additional Context", "Requirements"
  And I should see editable fields for: Assignee, Estimated Time, Scrum Stage, Asana Workspace, Asana Project

Scenario: Editing title in the panel saves via PATCH
  Given the panel is open for TSK-0042
  When I click the title and change it to "Prepare Q2 Review — Updated"
  Then a PATCH /tasks/TSK-0042 request should be sent
  And the title in both the panel AND the table row behind it should update

Scenario: Rich text editor saves description changes
  Given the panel is open for TSK-0042
  And I edit the "Requirements" section in the rich text editor
  When I finish editing (blur or explicit save)
  Then a PATCH /tasks/TSK-0042 request should be sent with the updated description content

Scenario: Version history panel is collapsed by default and expands on toggle
  Given the task detail panel is open for TSK-0042
  Then the version history panel should be collapsed
  When I click "History"
  Then the version history panel should expand
  And I should see a list of edits with: editor name/source, changed field, old → new value, timestamp

Scenario: Version history shows agent edits with "agent" source label
  Given TSK-0042 has a version history entry created by the Mastra agent
  When I expand the version history
  Then I should see an entry with source badge "agent"

Scenario: Source transcript link is present for agent-generated tasks
  Given TSK-0042 was generated from transcript "transcript-uuid-005"
  When I view the task detail panel
  Then I should see a "Source transcript" link
  And clicking it should navigate to the relevant transcript

Scenario: Closing the panel via Escape key
  Given the task detail panel is open
  When I press the Escape key
  Then the panel should close and slide out to the right

Scenario: Closing the panel via the backdrop
  Given the task detail panel is open
  When I click the overlay backdrop behind the panel
  Then the panel should close

Scenario: Approve button in panel works and updates the table
  Given the panel is open for TSK-0042 (status: "draft")
  When I click "Approve" in the panel action buttons
  Then POST /tasks/TSK-0042/approve should be called
  When the request succeeds
  Then the status badge in the panel should update to "approved"
  And the status badge in the task table row should also update to "approved"
```

---

## Pagination

```gherkin
Scenario: Task table shows pagination controls when there are more than 25 tasks
  Given the client has 47 tasks
  When the task table loads
  Then I should see 25 task rows
  And a pagination control should show "Page 1 of 2" and "47 tasks"
  And "Next" should be enabled, "Previous" should be disabled

Scenario: Clicking Next loads the next page
  Given I am on page 1 of 2
  When I click "Next"
  Then the table should show the next 22 tasks
  And the pagination should show "Page 2 of 2"
  And "Previous" should be enabled, "Next" should be disabled

Scenario: Changing a filter resets to page 1
  Given I am on page 2 of 3
  When I change the status filter to "draft"
  Then the table should reload from page 1
  And the pagination should reset to "Page 1"
```

---

## Accessibility

```gherkin
Scenario: Task table is keyboard navigable
  Given I am on the Task Review page
  When I press Tab to focus the task table
  Then I should be able to navigate through rows with arrow keys
  When I focus a Short ID cell and press Enter
  Then the task detail panel should open

Scenario: Slide-over panel traps focus
  Given the task detail panel is open
  When I press Tab repeatedly
  Then focus should cycle only within the panel (not to the table behind it)

Scenario: Screen reader receives panel open announcement
  Given the task detail panel was closed
  When it opens
  Then a screen reader should announce the panel title (e.g., "Task detail: TSK-0042")
```
