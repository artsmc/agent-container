# Device Authentication Page

## Date
2026-03-09

## Summary
Implemented the device authentication approval page at `/auth/device`. This public UI page allows users to approve terminal/agent device access and receive a generated API token with copy-to-clipboard functionality.

## Gherkin Specification

```gherkin
Feature: Device Authentication Flow

  Scenario: Missing session parameter shows error
    Given the user navigates to "/auth/device" without query params
    Then they see an error "No session ID provided"

  Scenario: Unauthenticated user is redirected to login
    Given the user has no "iexcel_access_token" cookie
    When they visit "/auth/device?session=abc123&code=XK7M2P"
    Then they are redirected to "/login?returnTo=..."

  Scenario: Expired session shows error
    Given the session validation returns status "expired"
    Then the user sees an error about the session being expired

  Scenario: Already completed session shows error
    Given the session validation returns status "completed"
    Then the user sees an error about the device already being authorized

  Scenario: Session not found shows error
    Given the session validation returns 404
    Then the user sees an error about the session not being found

  Scenario: Valid session shows approval form
    Given the session validation returns status "pending"
    Then the user sees "Authorize Device Access" heading
    And the device code "XK7M2P" is displayed prominently
    And an "Approve" button is visible

  Scenario: Successful approval shows token
    When the user clicks "Approve" and the API returns a token
    Then the user sees "Device Authorized"
    And the token is displayed in a monospace box
    And a "Copy" button is visible
    And a warning about the token being shown once is visible

  Scenario: Copy button copies token and shows feedback
    When the user clicks "Copy"
    Then the button text changes to "Copied!" for 2 seconds

  Scenario: Done button shows completion
    When the user clicks "Done"
    Then a completion confirmation is shown
    And the token is no longer visible

  Scenario: Approve failure shows error
    When the approve API returns an error
    Then the user sees an appropriate error message

  Scenario: Network error shows error
    When the network request fails
    Then the user sees "Unable to reach the server"
```

## Files Created
- `apps/ui/src/app/auth/device/page.tsx` - Server component with auth check and redirect
- `apps/ui/src/app/auth/device/DeviceAuthClient.tsx` - Client component with state machine
- `apps/ui/src/app/auth/device/device-auth.module.scss` - SCSS module styles
- `apps/ui/src/app/auth/device/DeviceAuthClient.test.tsx` - Vitest component tests

## Test Results
All 11 Vitest tests pass, verifying all Gherkin scenarios above.

## Design Patterns Used
- Same server component pattern as `/connect/[platform]/page.tsx`
- Same client component state machine pattern as `ConnectClient.tsx`
- Same SCSS module structure and design tokens as `connect.module.scss`
- Auth via `getAccessTokenAction` server action (same pattern as `use-integrations-api.ts`)
