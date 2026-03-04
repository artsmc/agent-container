# GS — Gherkin Specification
## Feature 26: UI Client Detail
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## Feature: Client Detail Page

```
Feature: Client Detail Page
  As an authenticated account manager or internal team member
  I want to view all information about a client in one tabbed page
  So that I can review tasks, agendas, transcripts, settings, and history without switching tools
```

---

## Background

```gherkin
Background:
  Given I am authenticated as an account manager
  And the UI scaffolding (feature 23) is in place with DashboardLayout
  And the ui-auth-flow (feature 24) is active and protects the dashboard routes
  And the api-client package (feature 22) is available
  And a client with ID "client-uuid-001" and name "Total Life" exists in the system
```

---

## Page Load and Header

```gherkin
Scenario: Loading the client detail page for a valid client
  Given I navigate to "/clients/client-uuid-001"
  When the page loads
  Then I should see a loading skeleton in the header area
  And the DashboardLayout sidebar should be visible
  When the GET /clients/client-uuid-001 response resolves
  Then the header should display "Total Life" as an h1 heading
  And the header should display the default Asana workspace name
  And the Tasks tab should be active by default

Scenario: Client with a configured Grain playlist shows the playlist link
  Given the client "Total Life" has grain_playlist_id "grain-pl-123"
  When I navigate to "/clients/client-uuid-001"
  Then the header should display a "View Grain Playlist" link
  And the link should open in a new tab

Scenario: Client without a Grain playlist does not show the playlist link
  Given the client "Total Life" has grain_playlist_id set to null
  When I navigate to "/clients/client-uuid-001"
  Then the header should NOT display a "View Grain Playlist" link

Scenario: Client with no default Asana workspace shows a muted placeholder
  Given the client "Total Life" has default_asana_workspace_id set to null
  When I navigate to "/clients/client-uuid-001"
  Then the header should display "No default workspace" in a muted style

Scenario: Navigating to a client that does not exist shows a 404 state
  Given no client with ID "nonexistent-uuid" exists
  When I navigate to "/clients/nonexistent-uuid"
  Then I should see "Client not found"
  And I should see a back navigation link
```

---

## Tab Navigation

```gherkin
Scenario: Five tabs are rendered in the correct order
  Given I am on the client detail page for "Total Life"
  Then I should see tabs in this order: "Tasks", "Agendas", "Transcripts", "Settings", "History"

Scenario: Tasks tab is active by default
  Given I navigate to "/clients/client-uuid-001" without a tab parameter
  Then the "Tasks" tab should be visually active
  And the URL should show "?tab=tasks" or no tab parameter

Scenario: Clicking a tab updates the URL and renders the correct content
  Given I am on the "Tasks" tab of the client detail page
  When I click the "Agendas" tab
  Then the URL should update to include "?tab=agendas"
  And the Agendas tab content should load
  And a loading skeleton should appear while data is fetching

Scenario: Deep-linking to a specific tab via URL parameter
  Given I navigate to "/clients/client-uuid-001?tab=settings"
  Then the "Settings" tab should be active on page load
  And the Settings form should load

Scenario: Invalid tab parameter falls back to Tasks
  Given I navigate to "/clients/client-uuid-001?tab=unknown"
  Then the "Tasks" tab should be active
  And the URL should correct to "?tab=tasks"

Scenario: Tab data is fetched only on first activation (lazy loading)
  Given I am on the Tasks tab
  And no request to GET /clients/client-uuid-001/agendas has been made
  When I click the "Agendas" tab
  Then a request to GET /clients/client-uuid-001/agendas should be made
  When I click back to "Tasks" tab
  Then no new request to GET /clients/client-uuid-001/tasks should be made

Scenario: A tab data fetch failure shows an error state within the tab
  Given the Transcripts tab is activated
  And GET /clients/client-uuid-001/transcripts returns a 500 error
  Then the Transcripts tab panel should show an error message
  And a "Retry" button should be visible
  And the other tabs should be unaffected
```

---

## Tasks Tab

```gherkin
Scenario: Tasks tab shows up to 10 tasks in summary form
  Given the client has 15 tasks
  When I activate the Tasks tab
  Then I should see exactly 10 task rows
  And each row should show: short ID, truncated title, status badge, assignee avatar
  And I should see a "View all tasks" link below the list

Scenario: Tasks tab shows "Review Tasks" button
  Given I am on the Tasks tab
  Then I should see a "Review Tasks" button
  When I click "Review Tasks"
  Then I should navigate to "/clients/client-uuid-001/tasks"

Scenario: Short ID in Tasks tab links to full task review
  Given the Tasks tab is showing a task "TSK-0042"
  When I click "TSK-0042"
  Then I should navigate to "/clients/client-uuid-001/tasks" with that task highlighted

Scenario: Tasks tab empty state
  Given the client has no tasks
  When I activate the Tasks tab
  Then I should see "No tasks for this client yet."
  And I should NOT see the "View all tasks" link
```

---

## Agendas Tab

```gherkin
Scenario: Agendas tab shows agenda cards ordered by cycle date descending
  Given the client has 3 agendas with different cycle dates
  When I activate the Agendas tab
  Then I should see 3 agenda cards
  And the cards should be ordered with the most recent cycle date first

Scenario: Each agenda card shows correct information
  Given an agenda "AGD-0015" with cycle dates "Feb 1, 2026 → Feb 14, 2026", status "finalized", last edited by "Mark" 2 hours ago
  When I view the Agendas tab
  Then I should see a card showing:
    | field        | value                              |
    | short_id     | AGD-0015                           |
    | cycle_dates  | Feb 1, 2026 → Feb 14, 2026         |
    | status       | finalized (success badge)          |
    | last_edited  | Mark · 2 hours ago                 |

Scenario: Clicking "Edit" on an agenda card navigates to the agenda editor
  Given an agenda card for "AGD-0015" is visible
  When I click the "Edit" button on that card
  Then I should navigate to "/agendas/AGD-0015"

Scenario: Agendas tab shows informational note about agenda creation
  Given I am on the Agendas tab
  Then I should see "Agendas are created automatically by the intake workflow."
  And there should be no "New Agenda" button

Scenario: Agendas tab empty state
  Given the client has no agendas
  When I activate the Agendas tab
  Then I should see "No agendas created yet."
```

---

## Transcripts Tab

```gherkin
Scenario: Transcripts tab shows a table of ingested transcripts
  Given the client has 3 transcripts ingested
  When I activate the Transcripts tab
  Then I should see a table with 3 rows
  And each row should show: call date, call type, processing status badge

Scenario: Processed transcript shows a success badge
  Given a transcript processed on "Jan 15, 2026" with status "processed"
  When I view the Transcripts tab
  Then that row should show a "processed" badge in green (success variant)

Scenario: Pending transcript shows a warning badge
  Given a transcript with status "pending"
  When I view the Transcripts tab
  Then that row should show a "pending" badge in yellow (warning variant)

Scenario: Transcripts tab has no edit or action controls
  Given I am on the Transcripts tab
  Then I should NOT see any edit, delete, or reprocess buttons

Scenario: Transcripts tab empty state
  Given the client has no transcripts
  When I activate the Transcripts tab
  Then I should see "No transcripts ingested yet."
```

---

## Settings Tab

```gherkin
Scenario: Settings tab shows pre-filled form with current client config
  Given the client has:
    | field                       | value                  |
    | default_asana_workspace_id  | ws-001                 |
    | default_asana_project_id    | proj-042               |
    | email_recipients            | ["alice@co.com"]       |
  When I activate the Settings tab
  Then the workspace dropdown should show the workspace for "ws-001"
  And the project dropdown should show the project for "proj-042"
  And the email recipients field should show "alice@co.com" as a tag chip

Scenario: Changing workspace resets and reloads the project dropdown
  Given I am on the Settings tab
  And workspace "ws-001" is selected
  When I change the workspace dropdown to "ws-002"
  Then the project dropdown should reset to empty
  And a request to GET /asana/workspaces/ws-002/projects should be made
  And the project dropdown should load with options for workspace "ws-002"

Scenario: Adding an email recipient
  Given I am on the Settings tab
  When I type "bob@company.com" in the email recipients field
  And I press Enter
  Then "bob@company.com" should appear as a tag chip in the recipients list

Scenario: Removing an email recipient
  Given the recipients list contains "alice@co.com" as a tag chip
  When I click the "x" on the "alice@co.com" chip
  Then "alice@co.com" should be removed from the list

Scenario: Saving settings sends PATCH request with updated values
  Given I have changed the default workspace to "ws-002"
  When I click "Save Settings"
  Then a PATCH /clients/client-uuid-001 request should be sent
  And the request body should include "default_asana_workspace_id": "ws-002"
  And a success message "Settings saved" should appear for 3 seconds

Scenario: Settings save failure shows an error message
  Given PATCH /clients/client-uuid-001 returns a 500 error
  When I click "Save Settings"
  Then an inline error message should appear with the error detail
  And the form data should be preserved (not reset)

Scenario: Navigating away with unsaved changes prompts confirmation
  Given I have changed the workspace dropdown but not saved
  When I click the "Transcripts" tab
  Then a confirmation dialog should appear: "You have unsaved settings changes. Leave without saving?"
  When I confirm "Leave"
  Then I should be taken to the Transcripts tab
  And my changes should be discarded

Scenario: Invalid email address is rejected in the recipients field
  Given I am on the Settings tab
  When I type "not-an-email" in the email recipients field
  And I press Enter
  Then an inline validation error should appear: "Please enter a valid email address"
  And "not-an-email" should NOT be added as a tag chip
```

---

## History Tab

```gherkin
Scenario: History tab shows imported records as read-only
  Given the client has 5 imported records (is_imported = true)
  When I activate the History tab
  Then I should see a table with 5 rows
  And each row should display an "Imported" badge
  And there should be no edit, approve, or delete buttons on any row

Scenario: History tab empty state for a client with no imported records
  Given the client has no imported records
  When I activate the History tab
  Then I should see "No historical records have been imported for this client."

Scenario: History tab record columns are correctly populated
  Given an imported task record with title "Review proposal", imported on "Jan 5, 2026"
  When I view the History tab
  Then I should see a row with:
    | column       | value             |
    | record_type  | Task              |
    | title        | Review proposal   |
    | import_date  | Jan 5, 2026       |
    | status       | Imported (badge)  |
```

---

## Accessibility

```gherkin
Scenario: Tab navigation is keyboard accessible
  Given I am on the client detail page
  When I focus the tab navigation bar
  And I press the right arrow key
  Then focus should move to the next tab
  When I press Enter
  Then that tab should activate

Scenario: Status badges have accessible labels
  Given a task row with status "approved"
  When I inspect the status badge
  Then it should have aria-label="Status: approved"

Scenario: Loading states announce themselves to screen readers
  Given a tab is loading its content
  Then the tab panel container should have aria-busy="true"
```
