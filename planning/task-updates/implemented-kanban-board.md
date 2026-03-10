# Task Update: Kanban Board for Tasks

## Summary

Replaced the `TasksSummaryTab` table view with a Kanban/swim-lane board showing four status columns (Draft, Approved, Rejected, Pushed). Each column displays task cards with short ID, title, assignee, and formatted estimated time. Clicking a card opens a SlideOver edit panel with all task fields editable and status-transition action buttons.

## Files Created/Modified

- `apps/ui/src/features/clients/components/TasksSummaryTab.tsx` -- Replaced with Kanban board component
- `apps/ui/src/features/clients/components/TasksSummaryTab.module.scss` -- New Kanban styles
- `apps/ui/src/features/clients/components/TaskEditPanel.tsx` -- New edit panel for SlideOver
- `apps/ui/src/features/clients/components/TaskEditPanel.module.scss` -- Edit panel styles
- `apps/ui/src/features/clients/hooks/useAllClientTasks.ts` -- New hook fetching all tasks (limit 100)
- `apps/ui/src/features/clients/components/TasksSummaryTab.test.tsx` -- 15 Vitest tests

## Gherkin Specification

```gherkin
Feature: Task Kanban Board

  Scenario: Display Kanban columns with task counts
    Given the client has tasks in various statuses
    When the Kanban board loads
    Then four columns are visible: "Draft", "Approved", "Rejected", "Pushed"
    And each column header shows a badge with the count of tasks in that status

  Scenario: Display task cards in correct columns
    Given the client has tasks in various statuses
    When the Kanban board loads
    Then each task card appears in its corresponding status column
    And each card shows the short ID in monospace font
    And each card shows the task title
    And each card shows the assignee if set
    And each card shows the estimated time formatted as "Xh Ym" if set

  Scenario: Open task edit panel
    Given the Kanban board is displayed with tasks
    When the user clicks a task card
    Then a SlideOver panel opens with the task title as the header
    And the panel shows editable fields

  Scenario: Save task edits
    Given the task edit panel is open
    When the user modifies field values and clicks "Save"
    Then the API is called with updated field values

  Scenario: Approve a draft task
    Given the task edit panel is open for a task with status "draft"
    When the user clicks "Approve"
    Then the approve API is called

  Scenario: Reject a draft task
    Given the task edit panel is open for a task with status "draft"
    When the user clicks "Reject"
    Then the reject API is called

  Scenario: Push an approved task
    Given the task edit panel is open for a task with status "approved"
    When the user clicks "Push"
    Then the push API is called

  Scenario: Close the edit panel
    Given the task edit panel is open
    When the user clicks the close button
    Then the panel closes

  Scenario: Loading state
    Then skeleton placeholders are shown

  Scenario: Error state
    Then an error message and retry button are shown

  Scenario: Empty state
    Then a "No tasks" message is shown
```

## Test Results

All 15 Vitest tests passed:

```
 PASS  src/features/clients/components/TasksSummaryTab.test.tsx (15 tests) 326ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Tests cover: loading state, error state, empty state, column rendering, task counts, card content (short ID, title, assignee, estimated time), opening the edit panel, saving edits, approve/reject/push actions, and closing the panel.
