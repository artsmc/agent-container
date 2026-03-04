# GS — Gherkin Specification
# Feature 25: UI Dashboard (`ui-dashboard`)

**Date:** 2026-03-03

---

## Feature: Dashboard — Client Cards Grid

```gherkin
Feature: Dashboard Client Cards Grid
  As an authenticated internal user
  I want to see a grid of client cards on the dashboard
  So that I can get an at-a-glance status of all my clients

  Background:
    Given I am authenticated as an account manager
    And I have access to clients "Acme Corp", "Globex Corp", and "Initech"
    And I navigate to "/"

  Scenario: Client cards render with full data
    Given all three clients have status data available
    And "Acme Corp" has 3 pending draft tasks, agenda status "in_review", and next call "2026-03-10"
    And "Globex Corp" has 0 pending draft tasks, agenda status "finalized", and next call date not set
    And "Initech" has 1 pending draft task, agenda status "draft", and next call "2026-03-15"
    When the dashboard finishes loading
    Then I see a card for "Acme Corp" with a badge showing "3"
    And I see the agenda status badge showing "in_review" on the Acme Corp card
    And I see "Mar 10" as the next call date on the Acme Corp card
    And I see no pending badge on the "Globex Corp" card
    And I see "No call scheduled" on the Globex Corp card
    And I see a badge showing "1" on the "Initech" card

  Scenario: Client cards show loading skeletons while data is fetching
    Given the API response for "GET /clients" is delayed by 2 seconds
    When I first navigate to "/"
    Then I immediately see 6 skeleton placeholder cards
    And the skeleton cards have an animated shimmer effect
    When the API response arrives
    Then the skeleton cards are replaced with real client cards

  Scenario: Client cards show error state when client list fails
    Given the "GET /clients" endpoint returns a 500 error
    When the dashboard finishes loading
    Then I see an error banner "Could not load clients. Try refreshing the page."
    And I see a "Retry" button within the error banner
    When I click the "Retry" button
    Then the dashboard re-fetches "GET /clients"

  Scenario: Empty state when user has no clients
    Given the "GET /clients" endpoint returns an empty array
    When the dashboard finishes loading
    Then I see a full-width message "No clients found. Contact your administrator to be assigned client access."
    And I do not see any client cards

  Scenario: Individual client status failure shows partial card
    Given "Acme Corp" status fetch fails with a 503 error
    And the other clients load successfully
    When the dashboard finishes loading
    Then I see the "Acme Corp" card with the client name displayed
    And I see "—" in place of the agenda status, pending badge, and next call date on the Acme Corp card
    And I see the other client cards rendered correctly

  Scenario: Navigating to task review via client card button
    Given the dashboard is loaded with client cards
    When I click the "View Tasks" button on the "Acme Corp" card
    Then I am navigated to "/clients/acme-corp/tasks"

  Scenario: Navigating to agenda list via client card button
    Given the dashboard is loaded with client cards
    When I click the "View Agenda" button on the "Acme Corp" card
    Then I am navigated to "/clients/acme-corp/agendas"
```

---

## Feature: Dashboard — Pending Approvals Panel

```gherkin
Feature: Dashboard Pending Approvals Panel
  As an authenticated internal user
  I want to see all draft tasks across all clients in one panel
  So that I can quickly identify and act on tasks awaiting approval

  Background:
    Given I am authenticated as an account manager
    And I have access to clients "Acme Corp" and "Globex Corp"
    And I navigate to "/"

  Scenario: Pending approvals panel renders draft tasks across all clients
    Given "Acme Corp" has draft tasks: TSK-0001 "Set up onboarding", estimated 2h; TSK-0002 "Write proposal", estimated 1h
    And "Globex Corp" has draft tasks: TSK-0003 "Review contract", estimated 30m
    When the dashboard finishes loading
    Then the pending approvals panel shows 3 rows
    And the first row shows "TSK-0001", "Set up onboarding", "Acme Corp", "2h"
    And the second row shows "TSK-0002", "Write proposal", "Acme Corp", "1h"
    And the third row shows "TSK-0003", "Review contract", "Globex Corp", "30m"

  Scenario: Tasks are sorted by short ID ascending
    Given draft tasks across clients include TSK-0010, TSK-0003, and TSK-0007
    When the dashboard finishes loading
    Then the pending approvals panel shows rows in order: TSK-0003, TSK-0007, TSK-0010

  Scenario: Panel shows maximum 20 rows with overflow link
    Given there are 25 draft tasks across all clients
    When the dashboard finishes loading
    Then the pending approvals panel shows exactly 20 rows
    And I see a footer message "View all 25 pending tasks" as a link

  Scenario: Navigating to task review via pending approvals row
    Given the pending approvals panel shows TSK-0042 belonging to "Acme Corp"
    When I click on the row for TSK-0042
    Then I am navigated to "/clients/acme-corp/tasks?task=TSK-0042"

  Scenario: Navigating to task review via short ID link
    Given the pending approvals panel shows TSK-0042 belonging to "Acme Corp"
    When I click on the "TSK-0042" short ID link
    Then I am navigated to "/clients/acme-corp/tasks?task=TSK-0042"

  Scenario: Pending approvals panel shows loading skeleton
    Given the API response for tasks is delayed
    When I first navigate to "/"
    Then I see a skeleton list of 5 placeholder rows in the pending approvals panel

  Scenario: Empty state when no draft tasks exist
    Given no clients have any draft tasks
    When the dashboard finishes loading
    Then the pending approvals panel shows "No tasks pending approval. All caught up."

  Scenario: Partial results when some client task fetches fail
    Given "Acme Corp" tasks fetch fails with a 503 error
    And "Globex Corp" has 2 draft tasks that load successfully
    When the dashboard finishes loading
    Then the pending approvals panel shows the 2 tasks from Globex Corp
    And I see a warning banner "Some clients could not be loaded. Showing partial results."

  Scenario: Task title is truncated at display boundary
    Given a draft task has a title of 80 characters
    When the dashboard finishes loading
    Then the task title in the panel is truncated with an ellipsis at approximately 60 characters
    And hovering over the truncated title shows the full title as a tooltip

  Scenario: Estimated time shows dash when not set
    Given TSK-0005 has no estimated time set
    When the dashboard finishes loading
    Then the estimated time column for TSK-0005 shows "—"
```

---

## Feature: Dashboard — Recent Activity Feed

```gherkin
Feature: Dashboard Recent Activity Feed
  As an authenticated internal user
  I want to see recent system actions in a chronological feed
  So that I can monitor what has happened in the system without navigating to the audit log

  Background:
    Given I am authenticated as an account manager
    And I navigate to "/"

  Scenario: Activity feed renders the most recent 20 entries
    Given the audit log contains 30 entries
    When the dashboard finishes loading
    Then the activity feed shows exactly 20 entries in descending chronological order

  Scenario: Task approved action is rendered correctly
    Given the audit log contains an entry: type "task.approved", actor "Alice", entity "TSK-0042", timestamp "2026-03-03T14:00:00Z"
    When the dashboard finishes loading
    Then I see "Alice" with her avatar in the feed
    And I see the description "Approved task TSK-0042"
    And I see a relative timestamp like "X hours ago"

  Scenario: Task pushed to Asana action is rendered correctly
    Given the audit log contains an entry: type "task.pushed", actor "Bob", entity "TSK-0010"
    When the dashboard finishes loading
    Then I see the description "Pushed task TSK-0010 to Asana"

  Scenario: Agenda shared action is rendered correctly
    Given the audit log contains an entry: type "agenda.shared", actor "Alice", entity "AGD-0005", client "Acme Corp"
    When the dashboard finishes loading
    Then I see the description "Shared agenda AGD-0005 with client Acme Corp"

  Scenario: Workflow triggered action is rendered correctly
    Given the audit log contains an entry: type "workflow.triggered", actor "Bob", workflow "Intake → Tasks", client "Globex Corp"
    When the dashboard finishes loading
    Then I see the description "Triggered Intake → Tasks for Globex Corp"

  Scenario: Unknown action type is rendered with fallback description
    Given the audit log contains an entry: type "unknown.action", entity type "task", entity "TSK-0099"
    When the dashboard finishes loading
    Then I see the description "Performed action on task TSK-0099"

  Scenario: Relative timestamps show absolute date/time on hover
    Given the activity feed shows an entry with timestamp "2026-03-03T08:00:00Z"
    When I hover over the relative timestamp "7 hours ago"
    Then I see a tooltip showing the full date and time "Mar 3, 2026, 8:00 AM"

  Scenario: Activity feed shows loading skeleton
    Given the audit log API is slow to respond
    When I first navigate to "/"
    Then I see 5 skeleton placeholder rows in the activity feed section

  Scenario: Empty state when no audit entries exist
    Given the audit log is empty
    When the dashboard finishes loading
    Then the activity feed shows "No recent activity."

  Scenario: Error state when audit log fails
    Given the "GET /audit" endpoint returns a 503 error
    When the dashboard finishes loading
    Then the activity feed shows "Activity feed unavailable."
    And the client cards grid and pending approvals panel are still visible and functional

  Scenario: Actor avatar uses initials when no photo is available
    Given the audit log entry actor "Charlie Brown" has no profile photo
    When the dashboard finishes loading
    Then I see an avatar circle with the initials "CB" for that entry
```

---

## Feature: Dashboard — Cross-Section Behaviour

```gherkin
Feature: Dashboard Cross-Section Behaviour
  As an authenticated internal user
  I want sections to load and fail independently
  So that a failure in one section does not degrade the entire dashboard

  Background:
    Given I am authenticated as an account manager
    And I navigate to "/"

  Scenario: All three sections load independently
    Given all API endpoints respond successfully
    When the dashboard finishes loading
    Then I see the client cards grid
    And I see the pending approvals panel
    And I see the recent activity feed

  Scenario: Audit log failure does not affect client cards or pending approvals
    Given "GET /audit" returns a 503
    And "GET /clients" and task endpoints respond successfully
    When the dashboard finishes loading
    Then I see the client cards grid populated with data
    And I see the pending approvals panel populated with data
    And I see "Activity feed unavailable." in the feed section

  Scenario: Client list failure does not affect activity feed
    Given "GET /clients" returns a 500
    And "GET /audit" responds successfully
    When the dashboard finishes loading
    Then I see an error banner in the client cards section
    And I see the recent activity feed populated with data

  Scenario: Unauthenticated user is redirected before dashboard renders
    Given my session has expired
    When I navigate to "/"
    Then I am redirected to the login page
    And the dashboard page is never rendered
```
