# Feature 29: UI Shared Agenda (Public Client View) - Implementation Report

**Date:** 2026-03-05
**Status:** Complete

---

## Gherkin Specification (Verified)

### Feature: Shared Agenda Public View

```gherkin
Feature: Shared Agenda Public View

  As a client of iExcel
  I want to view my finalized agenda via a shared link
  So that I can review the Running Notes before my follow-up call without needing an account

  Background:
    Given the shared agenda page is deployed at the /shared/{token} route
    And the route uses PublicLayout with no authentication requirement

  Scenario: Client successfully views a finalized shared agenda
    Given a finalized agenda with short ID "AGD-0015" exists for client "Acme Corp"
    And the agenda covers the cycle period "February 1, 2026" to "February 28, 2026"
    When I navigate to "/shared/tok_abc123"
    Then I should see the short ID "AGD-0015" in the page header
    And I should see "Acme Corp" as the client name
    And I should see the cycle period formatted as "February 1 - February 28, 2026"
    And I should see a "Finalized on February 28, 2026" date

  Scenario: All six Running Notes sections are displayed in correct order
    Given I am viewing the shared agenda
    Then I should see sections in this order:
      | Completed Tasks |
      | Incomplete Tasks |
      | Relevant Deliverables |
      | Recommendations |
      | New Ideas |
      | Next Steps |

  Scenario: Empty Running Notes section displays a placeholder
    Given a section has no content
    Then I should see "Nothing to report for this period." as placeholder text

  Scenario: Rich text content is sanitized (XSS prevention)
    Given content contains a <script> tag
    When the content is rendered
    Then the <script> tag is stripped from the output

  Scenario: Links get security attributes
    Given content contains an <a> tag
    When the content is rendered
    Then the link has rel="noopener noreferrer"

  Scenario: Invalid token shows error page
    Given the API returns 404 for the token
    Then I should see heading "This link is not valid"

  Scenario: Expired token shows error page
    Given the API returns 410 for the token
    Then I should see heading "This link has expired"

  Scenario: Server error shows generic error page
    Given the API returns 500
    Then I should see heading "Something went wrong"
```

---

## Test Results

All 46 vitest tests pass, plus 80 existing api-client tests remain green.

```
Test Files  6 passed (6)
     Tests  46 passed (46)
```

### Test Breakdown

| Test File | Tests | Status |
|---|---|---|
| dates.test.ts | 8 | PASS |
| SharedAgendaError.test.tsx | 10 | PASS |
| AgendaHeader.test.tsx | 6 | PASS |
| RichTextRenderer.test.tsx | 10 | PASS |
| RunningNotesSection.test.tsx | 7 | PASS |
| RunningNotesViewer.test.tsx | 5 | PASS |

---

## Files Created/Modified

### New Files
- `packages/shared-types/src/shared-agenda.ts` - SharedAgendaResponse type
- `apps/ui/src/lib/dates.ts` - Date formatting utilities
- `apps/ui/src/lib/api-client-public.ts` - Public API client factory
- `apps/ui/src/components/SharedAgenda/SharedAgendaError/*` - Error page component
- `apps/ui/src/components/SharedAgenda/RichTextRenderer/*` - XSS-safe HTML renderer
- `apps/ui/src/components/SharedAgenda/RunningNotesSection/*` - Individual section component
- `apps/ui/src/components/SharedAgenda/RunningNotesViewer/*` - 6-section viewer
- `apps/ui/src/components/SharedAgenda/AgendaHeader/*` - Agenda header with dates
- `apps/ui/src/components/SharedAgenda/PrintActions/*` - Print/PDF buttons (client component)
- `apps/ui/vitest.config.ts` - Vitest configuration for UI app
- `apps/ui/vitest.setup.ts` - Test setup with jest-dom matchers

### Modified Files
- `packages/shared-types/src/index.ts` - Added shared-agenda export
- `packages/api-client/src/endpoints/agendas.ts` - Updated getSharedAgenda return type
- `apps/ui/src/app/shared/[token]/page.tsx` - Full implementation
- `apps/ui/package.json` - Added dependencies
