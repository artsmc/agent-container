# GS — Gherkin Specification
## Feature 30: UI Workflow Trigger

**Version:** 1.0
**Date:** 2026-03-03

---

## Feature: Workflow Trigger Screen

  As an account manager
  I want to manually trigger intake and agenda workflows from the UI
  So that I can initiate AI processing without terminal access and navigate directly to the results

---

## Background

  Given the iExcel API is running and accessible
  And the workflow trigger page is deployed at `/workflows/new`
  And the page is inside the DashboardLayout with auth middleware applied
  And I am logged in as a user with the "account_manager" or "admin" role

---

## Scenario Group 1: Access Control

### Scenario: Account manager can access the workflow trigger page

  Given I am logged in as an account manager
  When I navigate to "/workflows/new"
  Then I should see the workflow trigger page with DashboardLayout chrome
  And I should see the workflow selector with "Intake → Tasks" and "Completed Tasks → Agenda" options
  And I should not see any 403 or error page

### Scenario: Admin can access the workflow trigger page

  Given I am logged in as an admin
  When I navigate to "/workflows/new"
  Then I should see the workflow trigger page
  And the client selector should include all clients (not just assigned ones)

### Scenario: Team member cannot access the workflow trigger page

  Given I am logged in as a team member
  When I navigate to "/workflows/new"
  Then I should be redirected away from the workflow trigger page
  And I should not be able to trigger any workflow

### Scenario: Unauthenticated user is redirected to login

  Given I am not logged in
  When I navigate to "/workflows/new"
  Then I should be redirected to "/login"

---

## Scenario Group 2: Workflow Selection

### Scenario: Page loads with no workflow selected

  Given I navigate to "/workflows/new"
  Then I should see both workflow options displayed
  And neither "Intake → Tasks" nor "Completed Tasks → Agenda" should appear selected
  And the submit button should be disabled or show "Select a workflow to continue"
  And no input form section should be visible

### Scenario: Selecting "Intake → Tasks" reveals intake inputs

  Given I am on the workflow trigger page
  When I click "Intake → Tasks"
  Then the "Intake → Tasks" option should appear selected
  And I should see the transcript source selector (Paste text, Upload file, Grain)
  And I should see the call date picker
  And I should not see the cycle date range inputs

### Scenario: Selecting "Completed Tasks → Agenda" reveals agenda inputs

  Given I am on the workflow trigger page
  When I click "Completed Tasks → Agenda"
  Then the "Completed Tasks → Agenda" option should appear selected
  And I should see the cycle start date input
  And I should see the cycle end date input
  And I should not see the transcript source selector or call date picker

### Scenario: Switching workflow type clears the previous inputs

  Given I have selected "Intake → Tasks" and pasted a transcript
  When I click "Completed Tasks → Agenda"
  Then the transcript text area is no longer visible
  And the previously pasted transcript content is cleared
  And the cycle date range inputs appear (possibly pre-populated)

---

## Scenario Group 3: Client Selection

### Scenario: Client selector loads the account manager's assigned clients

  Given I am an account manager assigned to clients "Acme Corp" and "Beta LLC"
  And I have selected a workflow type
  When I look at the client selector
  Then I should see "Acme Corp" and "Beta LLC" in the dropdown
  And I should not see clients not assigned to me

### Scenario: Client selector is searchable

  Given the client selector is visible with multiple clients
  When I type "Acme" into the client selector
  Then only clients whose names match "Acme" should appear in the dropdown

### Scenario: Submitting without selecting a client shows a validation error

  Given I have selected "Intake → Tasks" and pasted a transcript
  But I have not selected a client
  When I click the submit button
  Then I should see a validation error "Please select a client"
  And no API call should have been made

### Scenario: Selecting a client for the agenda workflow auto-populates cycle dates

  Given I have selected "Completed Tasks → Agenda"
  And client "Acme Corp" has a previous agenda with cycle end date "2026-02-28"
  When I select "Acme Corp" from the client selector
  Then the cycle start date should be auto-populated as "2026-03-01"
  And the cycle end date should be auto-populated as "2026-03-31"

### Scenario: Selecting a client with no prior agendas leaves dates empty

  Given I have selected "Completed Tasks → Agenda"
  And client "New Client Inc" has no previous agendas
  When I select "New Client Inc" from the client selector
  Then the cycle start date field should remain empty
  And the cycle end date field should remain empty

---

## Scenario Group 4: Intake Workflow — Transcript Input

### Scenario: Paste text is the default transcript input mode

  Given I have selected "Intake → Tasks"
  Then I should see a textarea labeled or described as "Paste text"
  And the "Paste text" option should appear selected in the transcript source selector

### Scenario: Account manager pastes a transcript

  Given I have selected "Intake → Tasks" and the "Paste text" input is visible
  When I paste a transcript into the textarea
  Then the textarea should contain the pasted text
  And the character count or content should be visible

### Scenario: Submitting with an empty transcript textarea shows a validation error

  Given I have selected "Intake → Tasks" and "Paste text" mode
  And I have selected a client and filled in the call date
  But the transcript textarea is empty
  When I click "Trigger Intake Workflow"
  Then I should see a validation error "Please paste the transcript text"
  And no API call should have been made

### Scenario: Switching to file upload mode shows a file input

  Given I have selected "Intake → Tasks"
  When I click "Upload file" in the transcript source selector
  Then I should see a file upload control
  And I should no longer see the paste textarea
  And I should see a hint that only .txt files are accepted

### Scenario: Uploading a valid .txt file shows the filename

  Given I have selected "Upload file" transcript mode
  When I select a ".txt" file named "acme-intake-2026-03-01.txt"
  Then I should see the filename "acme-intake-2026-03-01.txt" displayed
  And a remove or change button should be visible

### Scenario: Uploading a non-.txt file shows a validation error

  Given I have selected "Upload file" transcript mode
  When I attempt to select a ".pdf" file
  Then I should see a validation error "Only .txt files are supported"
  And the file should not be accepted

### Scenario: Uploading a file over 5 MB shows a validation error

  Given I have selected "Upload file" transcript mode
  When I select a file larger than 5 MB
  Then I should see a validation error "File is too large (max 5 MB)"
  And no API call should be made

### Scenario: Grain option is visible but disabled in V1

  Given I have selected "Intake → Tasks"
  Then I should see a "Select from Grain" option in the transcript source selector
  And the option should appear disabled or labeled as "Coming soon"
  And clicking or interacting with it should have no effect

---

## Scenario Group 5: Intake Workflow — Call Date

### Scenario: Call date defaults to today

  Given I have selected "Intake → Tasks"
  Then the call date picker should default to today's date

### Scenario: Submitting with no call date shows a validation error

  Given I have selected "Intake → Tasks" with valid transcript and client
  But the call date field is cleared
  When I click "Trigger Intake Workflow"
  Then I should see a validation error "Call date is required"

### Scenario: Setting a future call date shows a validation error

  Given I have selected "Intake → Tasks"
  When I enter tomorrow's date as the call date
  And I click "Trigger Intake Workflow"
  Then I should see a validation error "Call date cannot be in the future"

---

## Scenario Group 6: Agenda Workflow — Date Range

### Scenario: Submitting without a cycle start date shows a validation error

  Given I have selected "Completed Tasks → Agenda" with a client selected
  But the cycle start date is empty
  When I click "Trigger Agenda Workflow"
  Then I should see a validation error "Cycle start date is required"

### Scenario: Submitting without a cycle end date shows a validation error

  Given I have selected "Completed Tasks → Agenda" with a client selected
  And cycle start date is filled
  But cycle end date is empty
  When I click "Trigger Agenda Workflow"
  Then I should see a validation error "Cycle end date is required"

### Scenario: Setting an end date before start date shows a validation error

  Given I have selected "Completed Tasks → Agenda"
  And I have set cycle start date to "2026-03-01"
  When I set cycle end date to "2026-02-28"
  And I click "Trigger Agenda Workflow"
  Then I should see a validation error "End date must be after start date"

### Scenario: Auto-populated dates can be overridden

  Given cycle dates have been auto-populated based on the client's last agenda
  When I change the cycle start date to a different date
  Then the field should accept the new date
  And no validation error should appear for a valid date

---

## Scenario Group 7: Submission and Progress

### Scenario: Successfully triggering the intake workflow shows the progress indicator

  Given all intake workflow inputs are valid
  When I click "Trigger Intake Workflow"
  Then the form should be replaced by the progress indicator
  And I should see the client name displayed
  And I should see "Intake Workflow" as the workflow type label
  And I should see a spinner or loading indicator
  And I should see a status message such as "Preparing..."

### Scenario: Successfully triggering the agenda workflow shows the progress indicator

  Given all agenda workflow inputs are valid
  When I click "Trigger Agenda Workflow"
  Then the form should be replaced by the progress indicator
  And I should see "Agenda Workflow" as the workflow type label
  And I should see a spinner or loading indicator

### Scenario: Progress indicator updates as the workflow progresses

  Given the workflow has been triggered and the progress indicator is visible
  When the API returns status "processing"
  Then the status message should update to "Processing transcript..." (for intake)
    Or "Building agenda..." (for agenda)
  And the spinner should remain visible

### Scenario: Completed intake workflow navigates to task review

  Given the intake workflow progress indicator is visible
  When the API returns status "complete"
  Then I should briefly see a success message "Complete! Redirecting..."
  And I should be automatically navigated to "/clients/{client_id}/tasks"
  Within 2 seconds of the complete status being received

### Scenario: Completed agenda workflow navigates to the agenda editor

  Given the agenda workflow progress indicator is visible
  When the API returns status "complete" with result containing agenda_short_id "AGD-0042"
  Then I should be automatically navigated to "/agendas/AGD-0042"

---

## Scenario Group 8: Error Handling

### Scenario: Transcript submission API failure shows an error on the form

  Given all intake inputs are valid and I submit the form
  When the POST to "/clients/{id}/transcripts" returns a 500 error
  Then I should remain on the form view (not transition to processing)
  And I should see an error message explaining the transcript could not be submitted
  And I should be able to correct inputs and retry

### Scenario: Workflow trigger API failure shows an error on the form

  Given the transcript was submitted successfully
  When the POST to "/workflows/intake" returns a 400 or 500 error
  Then I should see an error message indicating the workflow could not be started
  And the error message should note that the transcript was saved
  And I should be able to retry triggering the workflow

### Scenario: Agenda workflow fails due to no completed tasks

  Given I have selected "Completed Tasks → Agenda" with a valid client and date range
  When the API responds indicating no completed tasks exist for that client in that period
  Then I should remain on the form view
  And I should see a warning: "No completed tasks were found for [Client Name] between [start] and [end]. Please adjust the date range or verify tasks are marked as completed."
  And the date range fields remain editable

### Scenario: Workflow processing fails after triggering

  Given the workflow is in the processing state with a spinner visible
  When the API returns status "failed"
  Then the spinner should be replaced by an error state
  And I should see "The workflow could not be completed."
  And I should see a "Try Again" button that returns me to the form with previous inputs
  And I should see a "Return to Dashboard" button that navigates to "/"

### Scenario: "Try Again" restores the form with previous inputs

  Given I am in the workflow failure error state
  When I click "Try Again"
  Then the form view is shown again
  And the previously selected workflow type is still selected
  And the previously selected client is still selected
  And the previously entered transcript text (or filename) is still present

---

## Scenario Group 9: Submit Button State

### Scenario: Submit button is disabled before workflow type is selected

  Given I have just loaded the workflow trigger page
  Then the submit button should be disabled
  And the button should display "Select a workflow to continue" or be in a non-clickable state

### Scenario: Submit button becomes active after selecting a workflow type

  Given I have selected "Intake → Tasks"
  Then the submit button should be enabled
  And the button label should read "Trigger Intake Workflow"

### Scenario: Submit button shows loading state during submission

  Given all form inputs are valid
  When I click the submit button
  Then the button should enter a loading state (spinner + disabled)
  And the button should remain in the loading state until the API responds
  And I should not be able to click the button again during this period
