# Task Update: Connect Integration Page

## Status: Complete

## Summary

Created the public `/connect/[platform]` page for completing integration credential sessions. This page is accessed from a link the agent sends in chat and does not require authentication -- the session ID in the URL serves as the auth mechanism (sessions expire in 5 minutes).

## Files Created

1. `apps/ui/src/app/connect/[platform]/page.tsx` -- Server component shell
2. `apps/ui/src/app/connect/[platform]/ConnectClient.tsx` -- Client component with form logic
3. `apps/ui/src/app/connect/[platform]/connect.module.scss` -- Styles using design tokens

## Gherkin Specification

```gherkin
Feature: Integration Connect Page
  As an agent-assisted user
  I want to complete an integration session via a browser link
  So that I can connect my Fireflies or Grain account

  Scenario: Valid Fireflies session - show API key form
    Given the user navigates to /connect/fireflies?session=<valid-uuid>
    When the page loads and validates the session
    Then the user sees a form with heading "Connect Fireflies"
    And the form contains a label input and an API Key input
    And a "Connect" submit button is visible

  Scenario: Valid Grain session - show authorization code form
    Given the user navigates to /connect/grain?session=<valid-uuid>
    When the page loads and validates the session
    Then the user sees a form with heading "Connect Grain"
    And the form contains a label input and an Authorization Code input
    And a "Connect" submit button is visible

  Scenario: Expired or invalid session
    Given the user navigates to /connect/fireflies?session=<expired-uuid>
    When the page loads and the session validation fails
    Then the user sees an error message indicating the session is invalid or expired

  Scenario: Missing session parameter
    Given the user navigates to /connect/fireflies without a session parameter
    Then the user sees an error message "No session ID provided"

  Scenario: Successful credential submission
    Given the user is on a valid Fireflies connect form
    When the user enters an API key and clicks "Connect"
    Then the form submits to POST /connect/fireflies/complete
    And a success message is shown

  Scenario: Failed credential submission (session expired during form fill)
    Given the user is on a valid Fireflies connect form
    When the user enters an API key and clicks "Connect"
    And the API responds with a 410 SESSION_EXPIRED error
    Then an error message about the session being expired is shown

  Scenario: Unsupported platform
    Given the user navigates to /connect/unknown-platform?session=<uuid>
    When the page loads and the session validation returns 400
    Then the user sees an error message
```

## Playwright Test Status

No Playwright infrastructure exists in this project yet (no `playwright.config.ts`, no test directory, no `@playwright/test` dependency). The Gherkin scenarios above define the acceptance criteria that should be verified when Playwright is added. The component uses `data-testid` attributes (`connect-loading`, `connect-error`, `connect-success`, `connect-form`) to facilitate future test automation.

## Design Decisions

- Used `PublicLayout` wrapper (same as login page) for brand consistency
- SCSS module uses only verified design tokens from `packages/ui-tokens`
- API URL reads from `NEXT_PUBLIC_API_URL` env var with fallback to `http://localhost:4000`
- Credential input uses `type="password"` to mask sensitive values
- Platform-specific configuration is driven by a `PLATFORM_CONFIG` map for easy extension
- Error handling covers: expired sessions, already-completed sessions, not-found sessions, network failures, and unsupported platforms
