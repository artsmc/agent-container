# Task Update: Create Client Modal

## Date: 2026-03-08

## Summary
Added a "New Client" button and modal dialog to the clients list page, allowing admins and account managers to create new clients with a minimal form (name only).

## Gherkin Specification

```gherkin
Feature: Create New Client

  Scenario: User sees the "New Client" button on the clients page
    Given the user is on the clients list page
    Then a "New Client" button is visible next to the page heading

  Scenario: User opens the create client modal
    Given the user is on the clients list page
    When the user clicks the "New Client" button
    Then a modal dialog titled "New Client" is displayed
    And a "Name" text input field is visible
    And "Cancel" and "Create" buttons are visible in the footer

  Scenario: User cannot submit without a name
    Given the create client modal is open
    When the "Name" field is empty
    Then the "Create" button is disabled

  Scenario: User successfully creates a client
    Given the create client modal is open
    And the user has typed "Acme Corp" into the "Name" field
    When the user clicks "Create"
    Then the "Create" button shows "Creating..."
    And the API is called with { name: "Acme Corp" }
    And on success, the modal closes
    And the page refreshes

  Scenario: User sees an error when creation fails
    Given the create client modal is open
    And the user has typed "Acme Corp" into the "Name" field
    When the user clicks "Create" and the API returns an error
    Then an error message is displayed in the modal
    And the modal remains open

  Scenario: User cancels client creation
    Given the create client modal is open
    When the user clicks "Cancel"
    Then the modal closes
    And no API call is made
```

## Test Results

All 18 Vitest tests pass:
- **CreateClientModal.test.tsx** (15 tests) -- covers rendering, validation, submission, error handling, loading states
- **CreateClientButton.test.tsx** (3 tests) -- covers button rendering, modal open/close behavior

## Files Changed

- `apps/ui/src/features/clients/components/CreateClientModal.tsx` (new)
- `apps/ui/src/features/clients/components/CreateClientModal.module.scss` (new)
- `apps/ui/src/features/clients/components/CreateClientModal.test.tsx` (new)
- `apps/ui/src/features/clients/components/CreateClientButton.tsx` (new)
- `apps/ui/src/features/clients/components/CreateClientButton.module.scss` (new)
- `apps/ui/src/features/clients/components/CreateClientButton.test.tsx` (new)
- `apps/ui/src/app/(dashboard)/clients/page.tsx` (modified -- added CreateClientButton)
- `apps/ui/src/app/(dashboard)/clients/clients.module.scss` (modified -- added pageHeader layout)
