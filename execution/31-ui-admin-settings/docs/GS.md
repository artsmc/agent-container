# GS — Gherkin Specification
## Feature 31: UI Admin / Settings

**Version:** 1.0
**Date:** 2026-03-03

---

## Feature: Admin Settings Screen

  As a system administrator
  I want a centralized settings screen
  So that I can manage Asana connections, user roles, email configuration, and review the audit log without developer involvement

---

## Background

  Given the iExcel API is running and accessible
  And the settings page is deployed at "/settings"
  And the page is inside the DashboardLayout with auth middleware applied

---

## Scenario Group 1: Access Control

### Scenario: Admin can access all four tabs

  Given I am logged in as an admin
  When I navigate to "/settings"
  Then I should see four tabs: "Asana Workspaces", "Users & Roles", "Email Config", and "Audit Log"
  And I should be able to click and interact with all four tabs

### Scenario: Account manager sees only the Audit Log tab

  Given I am logged in as an account manager
  When I navigate to "/settings"
  Then I should see only the "Audit Log" tab
  And I should not see "Asana Workspaces", "Users & Roles", or "Email Config" tabs

### Scenario: Team member cannot access the settings page

  Given I am logged in as a team member
  When I navigate to "/settings"
  Then I should be redirected away from the settings page
  And I should not see any settings content

### Scenario: Unauthenticated user is redirected to login

  Given I am not logged in
  When I navigate to "/settings"
  Then I should be redirected to "/login"

### Scenario: Admin default tab is Asana Workspaces

  Given I am an admin navigating to "/settings"
  Then the "Asana Workspaces" tab should be active by default
  And the Asana workspace list should be visible

### Scenario: Account manager default tab is Audit Log

  Given I am an account manager navigating to "/settings"
  Then the "Audit Log" tab should be active by default
  And the audit log table should be visible

---

## Scenario Group 2: Tab Navigation

### Scenario: Clicking a tab switches content without page reload

  Given I am on the settings page as an admin with "Asana Workspaces" active
  When I click the "Users & Roles" tab
  Then the user management content should be visible
  And the Asana Workspaces content should not be visible
  And the page URL may update to reflect the active tab

### Scenario: Each tab shows a loading state while data fetches

  Given I am on the settings page as an admin
  When I click the "Audit Log" tab
  Then I should see a loading indicator while the audit data is being fetched
  And once loaded, the audit log table should replace the loading indicator

### Scenario: Each tab shows an error state if its data fails to load

  Given the API returns a server error for the Asana workspaces endpoint
  When I am on the "Asana Workspaces" tab
  Then I should see an error message "Failed to load workspaces. Please refresh."
  And I should not see a blank tab

---

## Scenario Group 3: Asana Workspaces — List

### Scenario: Viewing configured Asana workspaces

  Given two Asana workspaces "Acme Asana" and "Beta Asana" are configured
  When I am on the "Asana Workspaces" tab
  Then I should see "Acme Asana" in the workspace list
  And I should see "Beta Asana" in the workspace list
  And each workspace should have a "Test Connection" button and a "Remove" button

### Scenario: Empty state when no workspaces are configured

  Given no Asana workspaces are configured in the system
  When I am on the "Asana Workspaces" tab
  Then I should see "No Asana workspaces configured. Add one below."
  And I should still see the add workspace form

---

## Scenario Group 4: Asana Workspaces — Add

### Scenario: Admin successfully adds a new Asana workspace

  Given I am on the "Asana Workspaces" tab
  And I enter workspace name "New Client Asana"
  And I enter a valid Asana API token
  When I click "Add Workspace"
  Then the new workspace "New Client Asana" should appear in the workspace list
  And the form fields should be cleared

### Scenario: Submitting the add form without a workspace name shows a validation error

  Given I am on the "Asana Workspaces" tab
  And I have entered an Asana API token but left the workspace name empty
  When I click "Add Workspace"
  Then I should see a validation error "Workspace name is required"
  And no API call should be made

### Scenario: Submitting the add form without an API token shows a validation error

  Given I am on the "Asana Workspaces" tab
  And I have entered a workspace name but left the API token empty
  When I click "Add Workspace"
  Then I should see a validation error "API token is required"

### Scenario: The API token field value is masked

  Given I am entering an Asana API token in the add workspace form
  Then the token value should be masked (shown as dots or asterisks)
  And the token should not be visible in the browser

### Scenario: Failed workspace add shows an error

  Given the API returns an error when adding a workspace
  When I complete and submit the add workspace form
  Then I should see an error message below the form
  And the form fields should retain their values so I can retry

---

## Scenario Group 5: Asana Workspaces — Test Connection

### Scenario: Testing a workspace connection shows a success result

  Given "Acme Asana" is a configured workspace with valid credentials
  When I click "Test Connection" for "Acme Asana"
  Then the button should enter a loading state
  And I should see a success indicator "Connection OK" next to "Acme Asana"

### Scenario: Testing a workspace connection shows a failure result

  Given "Old Workspace" is a configured workspace with expired credentials
  When I click "Test Connection" for "Old Workspace"
  Then I should see a failure indicator "Connection Failed" next to "Old Workspace"
  And I should see a brief error message explaining the failure

### Scenario: Testing one workspace does not affect others in the list

  Given two workspaces are listed and I click "Test Connection" for the first
  Then only the first workspace row should show a loading or result state
  And the second workspace row should remain unchanged

---

## Scenario Group 6: Asana Workspaces — Remove

### Scenario: Removing a workspace requires confirmation

  Given "Old Workspace" is in the workspace list
  When I click "Remove" for "Old Workspace"
  Then I should see a confirmation dialog
  And the dialog should mention "Old Workspace" by name
  And the dialog should warn that tasks using it may be affected

### Scenario: Confirming removal deletes the workspace

  Given the confirmation dialog is open for "Old Workspace"
  When I click "Confirm" in the dialog
  Then "Old Workspace" should be removed from the workspace list
  And the confirmation dialog should close

### Scenario: Cancelling removal leaves the workspace in the list

  Given the confirmation dialog is open for "Old Workspace"
  When I click "Cancel" in the dialog
  Then "Old Workspace" should still be visible in the workspace list
  And no API call should have been made

---

## Scenario Group 7: Users & Roles — User List

### Scenario: Viewing the user list

  Given users "Alice" (admin), "Bob" (account manager), and "Carol" (team member) exist
  When I am on the "Users & Roles" tab
  Then I should see all three users listed
  And each user should show their name, email, and role badge
  And "Alice" should show an "Admin" badge
  And "Bob" should show an "Account Manager" badge
  And "Carol" should show a "Team Member" badge

### Scenario: Current admin user cannot deactivate themselves

  Given I am logged in as admin "Alice"
  When I am on the "Users & Roles" tab viewing my own row
  Then the "Deactivate" button should not be available for my row
  And I should still be able to see but not deactivate myself

---

## Scenario Group 8: Users & Roles — Edit

### Scenario: Admin changes a user's role

  Given "Bob" is currently an "Account Manager"
  When I click "Edit" for "Bob"
  And I change the role to "Team Member"
  And I click "Save"
  Then "Bob" should now show a "Team Member" badge in the user list
  And the edit interface should close

### Scenario: Admin assigns a client to an account manager

  Given "Bob" is an account manager currently assigned to "Acme Corp" only
  When I click "Edit" for "Bob"
  And I add "Beta LLC" to Bob's client assignments
  And I click "Save"
  Then "Bob" should now be assigned to both "Acme Corp" and "Beta LLC"

### Scenario: Admin cannot change their own role

  Given I am logged in as admin "Alice"
  When I click "Edit" for my own user row
  Then the role selector should be disabled or my row should not have an Edit option for role

### Scenario: Failed role save shows an inline error

  Given the API returns an error when saving a role change
  When I click "Save" after editing a user's role
  Then I should see an error message in the edit interface
  And the user's role in the list should not have changed

---

## Scenario Group 9: Users & Roles — Deactivate

### Scenario: Deactivating a user requires confirmation

  Given "Carol" is an active team member
  When I click "Deactivate" for "Carol"
  Then I should see a confirmation dialog mentioning "Carol" by name
  And the dialog should warn that Carol will immediately lose access

### Scenario: Confirming deactivation marks the user as deactivated

  Given the confirmation dialog for "Carol" is open
  When I click "Confirm"
  Then "Carol" should appear as deactivated in the user list
  And Carol's row should show a "Deactivated" badge
  And the Edit button for Carol should be disabled

### Scenario: Cancelling deactivation leaves the user active

  Given the confirmation dialog for "Carol" is open
  When I click "Cancel"
  Then "Carol" should still appear as active in the user list

---

## Scenario Group 10: Email Config

### Scenario: Email config tab loads current configuration

  Given the system has a configured sender address "team@iexcel.com" and sender name "iExcel Team"
  When I navigate to the "Email Config" tab
  Then the sender name field should show "iExcel Team"
  And the sender address field should show "team@iexcel.com"

### Scenario: Saving updated email configuration

  Given I am on the "Email Config" tab with current configuration loaded
  When I change the default sender name to "iExcel Support"
  And I click "Save"
  Then I should see a success notification "Email configuration saved"
  And the form should show the new values

### Scenario: Invalid email address shows a validation error

  Given I am on the "Email Config" tab
  When I enter "not-an-email" in the sender address field
  And I click "Save"
  Then I should see a validation error "Please enter a valid email address"
  And no API call should be made

### Scenario: Editing an email template shows current content

  Given an "Agenda Distribution" template exists with content
  When I click "Edit" for the "Agenda Distribution" template
  Then I should see the current template content in the editor
  And I should see a list of available template variables (e.g., {{client_name}})

### Scenario: Saving an edited template persists the changes

  Given I have edited the "Agenda Distribution" template
  When I click "Save" for the template
  Then the template content should be updated
  And I should see a success indicator
  And the template list should show an updated "last modified" date

---

## Scenario Group 11: Audit Log — Display

### Scenario: Audit log loads with default (no filter) results

  Given multiple audit events exist in the system
  When I navigate to the "Audit Log" tab
  Then I should see a paginated table of audit events
  And each row should show: timestamp, user, action, entity type, entity link, source

### Scenario: Automated agent actions show "Agent" as the user

  Given an audit event exists with source "agent" and no user_id
  When I view the audit log
  Then that event's user column should show "Agent"
  And the source column should show an "agent" badge

### Scenario: Entity IDs in the audit log are clickable links

  Given an audit event exists for entity type "task" with entity "TSK-0042"
  When I view the audit log
  Then the entity column should show "TSK-0042" as a clickable link
  And clicking it should navigate to "/tasks/TSK-0042"

### Scenario: Source badges are visually distinct

  Given audit events from "agent", "ui", and "terminal" sources are visible
  Then each source should be rendered as a badge with a distinct style
  And "agent" badge should look different from "ui" badge and "terminal" badge

### Scenario: Pagination controls navigate through results

  Given more than 25 audit events exist
  When I am on the audit log page 1
  Then I should see 25 rows
  And a "Next" page control should be available
  And clicking "Next" should load the next 25 results

---

## Scenario Group 12: Audit Log — Filters

### Scenario: Filtering by user narrows results

  Given audit events from users "Alice" and "Bob" exist
  When I select "Bob" from the User filter and apply filters
  Then I should see only audit events performed by "Bob"
  And events from "Alice" should not appear

### Scenario: Filtering by entity type narrows results

  Given audit events for "task" and "agenda" entities exist
  When I select "agenda" from the Entity Type filter and apply filters
  Then I should see only agenda-related audit events

### Scenario: Filtering by date range narrows results

  Given audit events exist from "2026-02-01" to "2026-03-03"
  When I set the date range filter to "2026-03-01" to "2026-03-03" and apply filters
  Then I should see only events from that 3-day period

### Scenario: Applying a filter resets pagination to page 1

  Given I am on page 3 of unfiltered audit results
  When I select a User filter and apply it
  Then I should be taken back to page 1 of the filtered results

### Scenario: Clearing filters returns to unfiltered results

  Given I have applied User and Entity Type filters
  When I click "Clear Filters"
  Then all filter selections should be reset to defaults
  And the full unfiltered audit log should be displayed

### Scenario: Account manager audit log only shows their clients' events

  Given I am logged in as account manager "Bob" assigned to "Acme Corp"
  When I navigate to the "Audit Log" tab
  Then I should only see audit events related to "Acme Corp" entities
  And I should not see events for clients not assigned to me

---

## Scenario Group 13: Confirmation Dialogs

### Scenario: Confirmation dialog default focus is on Cancel

  Given a confirmation dialog is open for removing a workspace
  Then the focus should be on the "Cancel" button by default
  So that pressing Enter does not accidentally confirm the destructive action

### Scenario: Pressing Escape dismisses the confirmation dialog

  Given a confirmation dialog is open
  When I press the Escape key
  Then the dialog should close without performing the action

### Scenario: Confirmation dialog is accessible via keyboard

  Given a confirmation dialog is open
  Then I should be able to Tab between the "Confirm" and "Cancel" buttons
  And pressing Enter on the focused button should activate it
