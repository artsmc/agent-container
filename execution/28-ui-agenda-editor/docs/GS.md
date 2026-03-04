# GS — Gherkin Specification
## Feature 28: UI Agenda Editor
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Status:** Pending
**Last Updated:** 2026-03-03

---

## Feature: Agenda List and Editor

```
Feature: Agenda List and Editor
  As an authenticated account manager or internal team member
  I want to view, edit, collaborate on, and distribute client agendas
  So that finalized Running Notes reach clients via shareable links and email without manual copy-paste
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
  And the client has the following agendas:
    | short_id  | cycle_start   | cycle_end     | status     | last_edited_by |
    | AGD-0015  | 2026-02-01    | 2026-02-14    | draft      | Mastra Agent   |
    | AGD-0014  | 2026-01-15    | 2026-01-31    | finalized  | Mark           |
    | AGD-0013  | 2025-12-30    | 2026-01-14    | shared     | Mark           |
```

---

## Screen 5: Agenda List

```gherkin
Scenario: Agenda list renders cards ordered by cycle start date descending
  Given I navigate to "/clients/client-uuid-001/agendas"
  When the GET /clients/client-uuid-001/agendas response resolves
  Then I should see 3 agenda cards
  And the first card should be "AGD-0015" (most recent cycle)
  And the second card should be "AGD-0014"
  And the third card should be "AGD-0013"

Scenario: Each agenda card shows the correct fields
  Given the agenda "AGD-0015" has:
    | field          | value                              |
    | cycle_start    | 2026-02-01                         |
    | cycle_end      | 2026-02-14                         |
    | status         | draft                              |
    | last_edited_by | Mastra Agent (source: agent)       |
  When I view the Agenda List
  Then the AGD-0015 card should show:
    | displayed field   | expected value                     |
    | short_id          | AGD-0015                           |
    | cycle_dates       | Feb 1, 2026 → Feb 14, 2026         |
    | status            | draft (default/gray badge)         |
    | last_edited       | Mastra Agent · {relative time}     |

Scenario: Clicking "Edit" on an agenda card navigates to the editor
  Given I see the agenda card for "AGD-0015"
  When I click "Edit"
  Then I should navigate to "/agendas/AGD-0015"

Scenario: "Finalize" button is visible on draft agendas for account managers
  Given the agenda "AGD-0015" has status "draft"
  When I view the agenda list as an account_manager
  Then the AGD-0015 card should have a "Finalize" button

Scenario: "Finalize" button is hidden for team_member role
  Given I am authenticated as a "team_member"
  When I view the agenda list
  Then no agenda card should have a "Finalize" button

Scenario: Finalizing from the list shows a confirmation dialog
  Given I am on the agenda list
  When I click "Finalize" on the AGD-0015 card
  Then a confirmation dialog should appear: "Finalize this agenda? This will lock editing."
  When I confirm
  Then a POST /agendas/AGD-0015/finalize request should be sent
  When the request succeeds
  Then the AGD-0015 status badge should update to "finalized"

Scenario: "Share" button is only available for finalized agendas
  Given AGD-0014 has status "finalized"
  And AGD-0015 has status "draft"
  When I view the agenda list
  Then the AGD-0014 card should have a "Share" button
  And the AGD-0015 card should NOT have a "Share" button (or it should be disabled)

Scenario: Agenda list empty state
  Given the client has no agendas
  When I navigate to "/clients/client-uuid-001/agendas"
  Then I should see: "No agendas have been created for this client yet."
  And I should NOT see a "New Agenda" button

Scenario: Agenda list error state
  Given GET /clients/client-uuid-001/agendas returns a 500 error
  When I navigate to the Agenda List
  Then I should see an error message
  And a "Retry" button should be visible
```

---

## Screen 6: Agenda Editor — Page Load and Header

```gherkin
Scenario: Agenda editor loads for a valid short ID
  Given I navigate to "/agendas/AGD-0015"
  When GET /agendas/AGD-0015 resolves
  Then the editor header should show "AGD-0015"
  And the header should show "Total Life" (client name)
  And the header should show "Feb 1, 2026 → Feb 14, 2026" (cycle dates)
  And the status badge should show "draft"
  And the rich text editor should render with the six Running Notes sections

Scenario: Editor for a non-existent agenda shows 404 state
  Given I navigate to "/agendas/AGD-9999"
  And GET /agendas/AGD-9999 returns 404
  Then I should see "Agenda not found"
  And I should see a back navigation link
```

---

## Rich Text Editor and Auto-Save

```gherkin
Scenario: Six Running Notes sections are rendered in the correct order
  Given the agenda editor is open for AGD-0015
  Then I should see the following sections in order:
    | section               |
    | Completed Tasks       |
    | Incomplete Tasks      |
    | Relevant Deliverables |
    | Recommendations       |
    | New Ideas             |
    | Next Steps            |
  And each section should have a non-editable h3 header
  And each section should have a rich text editor below the header

Scenario: Editing a section triggers auto-save after 1.5 seconds
  Given the agenda editor is open for AGD-0015
  When I type "Updated recommendation text" in the "Recommendations" section
  And I stop typing
  Then after 1500ms, a PATCH /agendas/AGD-0015 request should be sent
  And the auto-save indicator should show "Saving..."
  When the PATCH succeeds
  Then the auto-save indicator should show "Saved · {time}"

Scenario: Auto-save failure shows a retry indicator
  Given I have made edits and the auto-save fires
  And PATCH /agendas/AGD-0015 returns a 500 error
  Then the auto-save indicator should show "Save failed — Retry"
  And clicking "Retry" should re-trigger the PATCH

Scenario: Finalized agenda is read-only in the editor
  Given AGD-0014 has status "finalized"
  When I navigate to "/agendas/AGD-0014"
  Then the rich text editor sections should be in read-only mode
  And a banner should show: "This agenda is finalized and locked for editing."
  And the "Finalize" button should be disabled
```

---

## Collaborative Editing

```gherkin
Scenario: Presence indicators show when another user is viewing the same agenda
  Given User A and User B are both on "/agendas/AGD-0015"
  Then User A should see an avatar chip for User B in the presence indicator area
  And User B should see an avatar chip for User A

Scenario: Polling refreshes the editor when another user makes a change
  Given User A is editing AGD-0015
  And User B saves a change to the "New Ideas" section
  When User A's polling interval fires (5 seconds)
  Then User A should see a notification: "This agenda was updated by User B"
  And the "New Ideas" section should reflect User B's changes

Scenario: Active typing is not interrupted by a polling refresh
  Given User A is actively typing in the "Next Steps" section
  And a polling response arrives showing a change from User B in a different section
  Then User A's typing should NOT be interrupted
  And the change from User B should be queued and applied after User A finishes typing
```

---

## Internal Comments

```gherkin
Scenario: Comments sidebar is collapsed by default
  Given I am on the agenda editor for AGD-0015
  Then the comments sidebar should be collapsed
  And a "Comments" toggle button should be visible (with count badge if comments exist)

Scenario: Opening the comments sidebar shows all internal comments
  Given AGD-0015 has 2 comments
  When I click the "Comments" toggle button
  Then the comments sidebar should expand
  And I should see 2 comment threads

Scenario: Adding a new comment
  Given the comments sidebar is open
  When I type "We should clarify the Q2 timeline in the Recommendations section" in the comment input
  And I click "Submit"
  Then a request to add the comment should be sent to the API
  When the request succeeds
  Then my comment should appear in the comments sidebar with my name, avatar, and timestamp

Scenario: Replying to a comment
  Given a comment exists: "Great context on completed tasks"
  When I click "Reply" on that comment
  And I type "Agreed — I'll add more detail"
  And I click "Submit"
  Then my reply should appear below the parent comment, indented

Scenario: Internal comments are not visible in the shared version
  Given AGD-0015 has 3 internal comments
  When the agenda is shared (status: "shared")
  Then the shared agenda view at /shared/{token} should show NONE of the 3 comments
  And the exported PDF/Google Doc should also contain no comments
```

---

## Version History

```gherkin
Scenario: Version history panel is collapsed by default
  Given I am on the agenda editor
  Then the version history panel should be collapsed

Scenario: Opening version history shows all edit entries
  Given AGD-0015 has been edited 4 times: twice by the agent, once by Mark via UI, once via terminal
  When I click "History" to expand the version history panel
  Then I should see 4 version entries
  And 2 entries should have source badge "agent"
  And 1 entry should have source badge "ui"
  And 1 entry should have source badge "terminal"

Scenario: Each version entry shows a diff of what changed
  Given a version entry records that the "Recommendations" section changed
  When I view that entry in the version history
  Then I should see the previous text struck through in red
  And the new text highlighted in green
```

---

## Action Bar — Finalize

```gherkin
Scenario: Finalize button is visible for account_manager role
  Given I am authenticated as "account_manager"
  When I open the agenda editor for a "draft" agenda
  Then the action bar should contain a "Finalize" button

Scenario: Finalize shows confirmation modal before proceeding
  Given the agenda has status "draft"
  When I click "Finalize"
  Then a modal should appear: "Finalize this agenda? This will lock editing."
  And the modal should have "Confirm" and "Cancel" buttons

Scenario: Confirming finalize locks the editor and updates status
  Given I click "Finalize" and confirm in the modal
  Then POST /agendas/AGD-0015/finalize should be called
  When the request succeeds
  Then the status badge should update to "finalized"
  And the rich text editor should switch to read-only mode
  And the "Finalize" button should become disabled
  And a banner should appear: "This agenda is finalized and locked for editing."

Scenario: Finalize fails with FINALIZE_REQUIRES_EDIT
  Given the agenda has not been edited since it was created by the agent
  When I click "Finalize" and confirm
  Then the API returns error "FINALIZE_REQUIRES_EDIT"
  And an inline message should appear: "Please make at least one edit before finalizing."
  And the agenda status should remain "draft"

Scenario: Finalize button is hidden for team_member role
  Given I am authenticated as "team_member"
  When I open the agenda editor
  Then the action bar should NOT contain a "Finalize" button
```

---

## Action Bar — Share

```gherkin
Scenario: Share button is disabled for non-finalized agendas
  Given the agenda has status "draft"
  When I view the action bar
  Then the "Share" button should be disabled

Scenario: Share generates two URLs and displays them in a modal
  Given the agenda has status "finalized"
  When I click "Share"
  Then POST /agendas/AGD-0015/share should be called
  When the request succeeds
  Then a modal should appear with:
    | URL type        | description                                           |
    | Client-facing   | Read-only, no auth — https://app.../shared/{token}    |
    | Internal        | Edit-enabled, auth required — https://app.../agendas/AGD-0015 |
  And each URL should have a "Copy" button
  And the agenda status badge should update to "shared"
```

---

## Action Bar — Email

```gherkin
Scenario: Email button is disabled for non-finalized agendas
  Given the agenda has status "draft"
  Then the "Email" button should be disabled

Scenario: Email modal opens with pre-filled recipients and subject
  Given the agenda has status "finalized"
  And the client's email_recipients are ["alice@total-life.com", "bob@iexcel.com"]
  When I click "Email"
  Then a modal should open
  And the recipients field should pre-fill with "alice@total-life.com" and "bob@iexcel.com" as chips
  And the subject should pre-fill as "Running Notes — Total Life — Feb 1, 2026 → Feb 14, 2026"

Scenario: Sending the email calls the API with the updated recipients
  Given the email modal is open
  And I remove "bob@iexcel.com" from recipients
  And I add "carol@total-life.com"
  When I click "Send"
  Then POST /agendas/AGD-0015/email should be called with:
    | field      | value                                                    |
    | recipients | ["alice@total-life.com", "carol@total-life.com"]         |
    | subject    | "Running Notes — Total Life — Feb 1, 2026 → Feb 14, 2026"|
  When the request succeeds
  Then a toast should appear: "Email sent to 2 recipient(s)"
  And the modal should close
```

---

## Action Bar — Export

```gherkin
Scenario: Export dropdown shows Google Docs and PDF options
  Given I click the "Export" button
  Then a dropdown should appear with:
    | option                 |
    | Export to Google Docs  |
    | Download as PDF        |

Scenario: Export to Google Docs calls the export endpoint
  When I click "Export to Google Docs"
  Then POST /agendas/AGD-0015/export?format=google_docs should be called
  When the request succeeds
  Then a toast should appear with a link: "Exported to Google Docs — View document"

Scenario: Download as PDF triggers a file download
  When I click "Download as PDF"
  Then POST /agendas/AGD-0015/export?format=pdf should be called
  When the request succeeds
  Then a file download should trigger for the PDF
```

---

## Accessibility

```gherkin
Scenario: Comments sidebar toggle announces expansion state
  Given the comments sidebar toggle button is focused
  Then it should have aria-expanded="false" when collapsed
  When the sidebar expands
  Then it should have aria-expanded="true"

Scenario: Auto-save indicator announces to screen readers
  Given I finish editing and auto-save fires
  Then the auto-save indicator should use role="status"
  And screen readers should hear "Saving..." and then "Saved"

Scenario: Action bar buttons have descriptive labels
  Given I inspect the action bar
  Then the "Finalize" button should have aria-label="Finalize this agenda"
  And the "Share" button should have aria-label="Share agenda AGD-0015"
  And the "Email" button should have aria-label="Email agenda AGD-0015"
```
