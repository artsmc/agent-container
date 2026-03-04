# GS — Gherkin Specification
## Feature 29: UI Shared Agenda (Client View)

**Version:** 1.0
**Date:** 2026-03-03

---

## Feature: Shared Agenda Public View

  As a client of iExcel
  I want to view my finalized agenda via a shared link
  So that I can review the Running Notes before my follow-up call without needing an account

---

## Background

  Given the iExcel API is running and accessible
  And the shared agenda page is deployed at the `/shared/{token}` route
  And the route uses PublicLayout with no authentication requirement

---

## Scenario Group 1: Happy Path — Valid Token

### Scenario: Client successfully views a finalized shared agenda

  Given a finalized agenda with short ID "AGD-0015" exists for client "Acme Corp"
  And the agenda covers the cycle period "February 1, 2026" to "February 28, 2026"
  And a share token "tok_abc123" has been generated for this agenda
  When I navigate to "/shared/tok_abc123"
  Then I should see the iExcel branded header via PublicLayout
  And I should see the short ID "AGD-0015" in the page header
  And I should see "Acme Corp" as the client name
  And I should see the cycle period "February 1 – February 28, 2026"
  And I should see a "Finalized on" date
  And I should not see any editing controls or toolbars
  And I should not see any internal comments or metadata

### Scenario: All six Running Notes sections are displayed

  Given I am viewing the shared agenda at "/shared/tok_abc123"
  Then I should see a "Completed Tasks" section
  And I should see an "Incomplete Tasks" section
  And I should see a "Relevant Deliverables" section
  And I should see a "Recommendations" section
  And I should see a "New Ideas" section
  And I should see a "Next Steps" section
  And the sections appear in that order on the page

### Scenario: Running Notes content renders with correct formatting

  Given the "Completed Tasks" section contains a bulleted list in the agenda data
  When I view the shared agenda
  Then the bulleted list renders as HTML list elements
  And bold text in the content renders as bold
  And italic text renders as italic
  And numbered lists render in correct sequence

### Scenario: Empty Running Notes section displays a placeholder

  Given the "New Ideas" section is empty in the finalized agenda
  When I view the shared agenda
  Then I should see the "New Ideas" section heading
  And I should see "Nothing to report for this period." beneath it
  And the section is still visible (not omitted)

### Scenario: Page renders content without client-side JavaScript

  Given I have JavaScript disabled in my browser
  When I navigate to "/shared/tok_abc123"
  Then I should see the full agenda content rendered in HTML
  And no "Loading..." spinner or blank content area appears

---

## Scenario Group 2: Print and PDF Export

### Scenario: Client opens browser print dialog via Print button

  Given I am viewing a valid shared agenda
  When I click the "Print" button
  Then the browser native print dialog opens

### Scenario: Client downloads PDF via Download button

  Given I am viewing a valid shared agenda
  When I click the "Download as PDF" button
  Then the browser native print dialog opens with PDF save option available

### Scenario: Print and PDF buttons are hidden in print output

  Given I am viewing a valid shared agenda
  When I trigger the browser print preview
  Then the "Print" button is not visible in the print preview
  And the "Download as PDF" button is not visible in the print preview
  And the iExcel branding is preserved in the print output

### Scenario: All six sections are visible in print output

  Given I am viewing a valid shared agenda with content in all six sections
  When I trigger the browser print preview
  Then all six Running Notes sections are fully visible
  And no section content is cut off or truncated
  And section headings are not separated from their content by page breaks

### Scenario: Print output is clean without background decoration

  Given I am viewing a valid shared agenda
  When I trigger the browser print preview
  Then the background is white
  And text is dark (readable)
  And no decorative background colors appear in the output

---

## Scenario Group 3: Error Handling — Invalid Token

### Scenario: Client navigates to a link with a non-existent token

  Given no agenda share token "tok_invalid999" exists in the system
  When I navigate to "/shared/tok_invalid999"
  Then I should see the iExcel branded header via PublicLayout
  And I should see the heading "This link is not valid"
  And I should see an explanation that the link could not be found
  And I should see guidance to contact their account manager
  And the HTTP response status is 404
  And I should not see any raw error messages or stack traces

### Scenario: Client navigates to a link with a revoked token

  Given a share token "tok_revoked" that has been manually revoked via the API
  When I navigate to "/shared/tok_revoked"
  Then I should see the heading "This link is not valid"
  And the page uses the InvalidLink error layout

---

## Scenario Group 4: Error Handling — Expired Token

### Scenario: Client navigates to a link that has passed its expiry date

  Given a share token "tok_expired" whose expiry date was "2026-01-01"
  And today's date is "2026-03-03"
  When I navigate to "/shared/tok_expired"
  Then I should see the iExcel branded header via PublicLayout
  And I should see the heading "This link has expired"
  And I should see an explanation that the link is no longer active
  And I should see guidance to request an updated link from their account manager
  And the HTTP response status is 410

---

## Scenario Group 5: Error Handling — Server Errors

### Scenario: API is unavailable when client loads the page

  Given the API server returns a 500 error for all requests
  When I navigate to "/shared/tok_abc123"
  Then I should see the iExcel branded header via PublicLayout
  And I should see the heading "Something went wrong"
  And I should see an explanation that the agenda could not be loaded
  And I should see guidance to try again or contact their account manager
  And no technical error details are shown to the user

### Scenario: Network timeout when fetching agenda data

  Given the API call times out before returning a response
  When I navigate to "/shared/tok_abc123"
  Then I should see the generic error page
  And I should not see a browser-level network error page

---

## Scenario Group 6: Layout and Responsiveness

### Scenario: Page renders correctly on a mobile viewport

  Given I am using a device with a 375px wide viewport
  When I navigate to a valid shared agenda
  Then all six Running Notes sections are fully readable
  And there is no horizontal scrollbar
  And the Print and Download buttons are visible and tappable
  And the iExcel branded header is visible

### Scenario: Page renders correctly on a desktop viewport

  Given I am using a device with a 1440px wide viewport
  When I navigate to a valid shared agenda
  Then the content is centered in a readable column
  And the content width does not exceed the maximum readable width (~800px)
  And there is comfortable whitespace on both sides of the content

### Scenario: Page renders correctly on a tablet viewport

  Given I am using a device with a 768px wide viewport
  When I navigate to a valid shared agenda
  Then all content is readable and accessible
  And no content overflows its container

---

## Scenario Group 7: Data Privacy

### Scenario: Internal comments are never visible on the shared page

  Given an agenda with internal team comments attached
  When I view the shared agenda via a valid token
  Then no internal comments appear anywhere on the page

### Scenario: Version history is never visible on the shared page

  Given an agenda with multiple edit versions in its history
  When I view the shared agenda via a valid token
  Then no version history panel or indicators appear on the page

### Scenario: Editing metadata is never visible on the shared page

  Given an agenda that was last edited by "Jane Smith" on "2026-02-25"
  When I view the shared agenda via a valid token
  Then "Jane Smith" does not appear anywhere on the shared page
  And no "last edited by" information is visible

---

## Scenario Group 8: SEO and Metadata

### Scenario: Page title reflects agenda content

  Given I am viewing the shared agenda for client "Acme Corp" with short ID "AGD-0015"
  When I inspect the HTML `<title>` tag
  Then the title includes "Acme Corp" and "AGD-0015" and "iExcel"

### Scenario: Page is excluded from search engine indexing

  Given I am viewing any shared agenda page
  When I inspect the HTML `<meta>` tags
  Then there is a robots meta tag with content "noindex, nofollow"
