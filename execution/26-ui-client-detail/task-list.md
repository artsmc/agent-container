# Task List — Feature 26: UI Client Detail
**Phase:** 3 — Consumers (UI, Terminal, Integration)
**Last Updated:** 2026-03-03

---

## Prerequisites

Before starting this feature, verify the following are complete:
- [ ] Feature 23 (ui-scaffolding) is merged — `DashboardLayout`, `Badge`, `Card`, `Avatar`, `Button`, `Table`, `TableRow`, `InlineEdit` component stubs exist in `apps/ui/src/components/`
- [ ] Feature 24 (ui-auth-flow) is merged — authentication guard is active on `(dashboard)` route group
- [ ] Feature 22 (api-client-package) is merged — `@iexcel/api-client` resolves in the workspace
- [ ] Feature 25 (ui-dashboard) is merged — client list navigation exists and links to `/clients/{client_id}`

---

## Phase 1: Route and Page Shell

### Task 1.1 — Create the `[client_id]` route directory [small]
Create the directory `apps/ui/src/app/(dashboard)/clients/[client_id]/` and add an empty `page.tsx` placeholder that renders `null`.

References: TR.md §2 (Repository Structure), FRS.md REQ-26-ROUTE-01

Verification: `nx run ui:build` passes with the new route registered.

---

### Task 1.2 — Implement the `page.tsx` server component [medium]
Convert `page.tsx` to a Server Component that:
- Reads `params.client_id` from the route
- Calls `GET /clients/{client_id}` via the api-client using the server-side auth token
- Passes the resolved `Client` object as a prop to `<ClientDetailPage>`
- Handles 404 (renders "Client not found" state) and 5xx (renders generic error state)

References: TR.md §4 (Page Component Strategy), FRS.md REQ-26-ROUTE-03, REQ-26-ROUTE-04

Verification: Navigating to `/clients/{valid-id}` renders the client name in the header. Navigating to `/clients/nonexistent` shows "Client not found".

---

### Task 1.3 — Create `ClientDetailPage.tsx` client component shell [small]
Create `apps/ui/src/app/(dashboard)/clients/[client_id]/ClientDetailPage.tsx` as a `'use client'` component that:
- Accepts a `client: Client` prop
- Renders the `ClientHeader` and `TabNav` (both stubbed initially)
- Manages tab state via `useSearchParams` / `useRouter`

References: TR.md §4 (Tab State Management), FRS.md REQ-26-TAB-03

Verification: Page renders with client prop passed. Switching tabs updates the URL `?tab=` param.

---

### Task 1.4 — Add `ClientDetailPage.module.scss` [small]
Create the SCSS module with:
- Page container with max-width and horizontal padding from spacing tokens
- Header and tab nav vertical spacing

References: TR.md §6 (SCSS Architecture)

Verification: Page has correct horizontal padding and spacing between header and tabs.

---

## Phase 2: Client Header Component

### Task 2.1 — Build `ClientHeader` component [medium]
Create `apps/ui/src/components/ClientHeader/ClientHeader.tsx` with:
- Props: `name: string`, `workspaceName: string | null`, `grainPlaylistId: string | null`
- `<h1>` for client name
- Workspace name row (or "No default workspace" muted text if null)
- Grain playlist external link (only rendered if `grainPlaylistId` is non-null)

References: FRS.md REQ-26-HDR-01 through REQ-26-HDR-03, TR.md §3 (GET /clients/{id})

Verification: Header renders with name and workspace. Grain link appears/disappears based on `grainPlaylistId`. Link opens in new tab with `rel="noopener noreferrer"`.

---

### Task 2.2 — Add `ClientHeader.module.scss` [small]
Write styles using design tokens:
- Name as `h1` using `$text-2xl`, `$font-weight-semibold`, `$color-text-primary`
- Workspace row: `$text-sm`, `$color-text-secondary`
- Grain link: `$color-primary`, underline on hover

References: TR.md §6 (Design Tokens Applied)

Verification: Header matches the clean, minimal visual direction from the ui-prd design inspiration.

---

### Task 2.3 — Add `ClientHeader` skeleton loading state [small]
Add a `loading` prop to `ClientHeader`. When `loading={true}`, render three skeleton placeholder bars using `$color-surface-elevated` with an animation.

References: FRS.md REQ-26-HDR-04

Verification: Skeleton renders while `GET /clients/{id}` is in flight; real content replaces it on load.

---

## Phase 3: Tab Navigation Component

### Task 3.1 — Build `TabNav` and `TabPanel` components [medium]
Create `apps/ui/src/components/TabNav/`:
- `TabNav.tsx` — renders a horizontal tab bar; props: `tabs: { id: string; label: string }[]`, `activeTab: string`, `onTabChange: (id: string) => void`
- `TabPanel.tsx` — renders tab panel content; props: `id: string`, `activeTab: string`, `children: React.ReactNode`; hides (CSS `display:none`) when not active (does not unmount)

References: TR.md §4 (Lazy Loading Pattern), FRS.md REQ-26-TAB-01 through REQ-26-TAB-06

Verification: Clicking a tab activates it visually and switches the panel. Previously-loaded tab data is preserved on switch-back (no re-fetch).

---

### Task 3.2 — Add `TabNav.module.scss` [small]
Write styles:
- Tab bar: flexbox row, border-bottom using `$color-border-default`
- Tab button: no default button styles, padding from spacing tokens, cursor pointer
- Active tab indicator: bottom border using `$color-primary`, `$font-weight-semibold`
- Hover state using `$color-surface-elevated` background

References: TR.md §6 (Design Tokens Applied), FRS.md REQ-26-TAB-05

Verification: Active tab is clearly distinguished. Hover states are visible.

---

### Task 3.3 — Integrate tab lazy loading and dirty state guard in `ClientDetailPage.tsx` [medium]
Update `ClientDetailPage.tsx` to:
- Maintain `mountedTabs` state (Set of activated tab IDs)
- Implement `handleTabChange` that:
  - Checks for dirty Settings state and shows confirm dialog if needed
  - Adds the new tab to `mountedTabs`
  - Updates the URL param
- Pass `mountedTabs` state to each tab component as an `enabled` prop

References: TR.md §4 (Lazy Loading Pattern, Tab State Management), FRS.md REQ-26-TAB-04, REQ-26-SET-06

Verification: Network tab shows only the active tab's API call fires on first activation. Dirty settings prompt appears on tab switch.

---

## Phase 4: Tasks Tab

### Task 4.1 — Build `TasksSummaryTab` component [medium]
Create `apps/ui/src/features/clients/components/TasksSummaryTab.tsx` with:
- `useClientTasks(clientId, enabled)` hook call (see Task 4.2)
- Loading skeleton (table skeleton)
- Error state with Retry button
- Empty state: "No tasks for this client yet."
- Summary table with columns: Short ID (link), Title (truncated), Status Badge, Assignee Avatar
- "View all tasks" link if `total > 10`
- "Review Tasks" primary button navigating to `/clients/{clientId}/tasks`

References: FRS.md REQ-26-TASKS-01 through REQ-26-TASKS-05, TR.md §3 (GET /clients/{id}/tasks)

Verification: Table renders with 10 rows max. "View all" link appears only when `total > 10`. Review Tasks button navigates correctly.

---

### Task 4.2 — Implement `useClientTasks` hook [small]
Create `apps/ui/src/features/clients/hooks/useClientTasks.ts`:
- Parameters: `clientId: string`, `enabled: boolean`
- Fetches `GET /clients/{clientId}/tasks?limit=10&sort=created_at:desc` when `enabled` is true
- Returns `{ data, loading, error, retry }`

References: TR.md §4 (Data Hooks Pattern), TR.md §3 (GET /clients/{id}/tasks)

Verification: Hook fires only when `enabled=true`. Returns correct loading/error/data states.

---

### Task 4.3 — Flesh out `Badge` component stub [medium]
Update `apps/ui/src/components/Badge/Badge.tsx` and `Badge.module.scss` with:
- Variants: `default`, `success`, `warning`, `danger`, `info`, `primary`
- Size: `sm` (default), `md`
- Background/text color from corresponding semantic tokens
- Pill shape using `$radius-full`
- `aria-label` prop support

References: FRS.md REQ-26-TASKS-02, FRS.md §12 (Accessibility), feature 23 stub contract

Verification: `<Badge variant="success">approved</Badge>` renders with green background and text. `aria-label` is applied.

---

### Task 4.4 — Flesh out `Avatar` component stub [small]
Update `apps/ui/src/components/Avatar/Avatar.tsx` with:
- Renders initials from `name` prop if no `src`
- Circle shape, size variants: `sm` (24px), `md` (32px), `lg` (40px)
- Background color derived from name hash (consistent color per person)

References: FRS.md REQ-26-TASKS-02, feature 23 stub contract

Verification: `<Avatar name="Mark Johnson" size="sm" />` renders "MJ" initials in a circle.

---

## Phase 5: Agendas Tab

### Task 5.1 — Build `AgendasTab` component [medium]
Create `apps/ui/src/features/clients/components/AgendasTab.tsx` with:
- `useClientAgendas(clientId, enabled)` hook call
- Loading skeleton (card skeleton)
- Error state with Retry
- Informational note: "Agendas are created automatically by the intake workflow."
- Empty state: "No agendas created yet."
- List of `AgendaCard` components

References: FRS.md REQ-26-AGD-01 through REQ-26-AGD-04

Verification: Cards render ordered by cycle start date descending. Info note visible. No "New Agenda" button.

---

### Task 5.2 — Implement `useClientAgendas` hook [small]
Create `apps/ui/src/features/clients/hooks/useClientAgendas.ts` following the same pattern as `useClientTasks`.

References: TR.md §4 (Data Hooks Pattern), TR.md §3 (GET /clients/{id}/agendas)

Verification: Hook fires only when `enabled=true`.

---

### Task 5.3 — Build `AgendaCard` sub-component [medium]
Create `apps/ui/src/features/clients/components/AgendaCard.tsx` with:
- Props: `agenda: AgendaSummary`
- Short ID in monospace (`$font-family-mono`)
- Cycle dates formatted as `MMM D, YYYY → MMM D, YYYY`
- Status `Badge` (variant mapped: `draft→default`, `in_review→info`, `finalized→success`, `shared→primary`)
- Last edited line: `{name} · {relative time}` (use a `formatRelativeTime` utility)
- "Edit" button linking to `/agendas/{short_id}`

References: FRS.md REQ-26-AGD-02, REQ-26-AGD-03

Verification: Card matches design with all fields present. Edit button navigates to correct URL.

---

### Task 5.4 — Flesh out `Card` component stub [small]
Update `apps/ui/src/components/Card/Card.tsx` and `Card.module.scss` with:
- `flat`: no shadow; `raised`: `$shadow-sm`; `floating`: `$shadow-md`
- Background: `$color-surface-elevated`
- Border: 1px solid `$color-border-default`
- Border radius: `$radius-lg`
- Padding: `$space-4`

References: feature 23 stub contract, TR.md §6 (Design Tokens Applied)

Verification: `<Card elevation="raised">` renders with correct shadow and background.

---

## Phase 6: Transcripts Tab

### Task 6.1 — Build `TranscriptsTab` component [medium]
Create `apps/ui/src/features/clients/components/TranscriptsTab.tsx` with:
- `useClientTranscripts(clientId, enabled)` hook call
- Loading skeleton (table skeleton)
- Error state with Retry
- Empty state: "No transcripts ingested yet."
- Table with columns: Call Date, Call Type, Processing Status badge
- No action buttons

References: FRS.md REQ-26-TRN-01 through REQ-26-TRN-03

Verification: Table renders correctly. No edit/delete buttons present.

---

### Task 6.2 — Implement `useClientTranscripts` hook [small]
Create `apps/ui/src/features/clients/hooks/useClientTranscripts.ts`.

References: TR.md §4 (Data Hooks Pattern), TR.md §3 (GET /clients/{id}/transcripts)

Verification: Hook fires only when `enabled=true`.

---

## Phase 7: Settings Tab

### Task 7.1 — Build `TagInput` component [medium]
Create `apps/ui/src/components/TagInput/TagInput.tsx`:
- Props: `values: string[]`, `onChange: (values: string[]) => void`, `validate?: (v: string) => string | null`, `placeholder?: string`
- Renders existing values as tag chips with x-remove buttons
- Text input field that adds a tag on Enter key press
- Calls `validate` before adding; shows inline error message if invalid
- Full keyboard accessibility

References: FRS.md REQ-26-SET-03, TR.md §5 (TagInput Component)

Verification: Tags added on Enter, removed on x-click. Invalid email shows error and is not added.

---

### Task 7.2 — Build `SettingsTab` component [large]
Create `apps/ui/src/features/clients/components/SettingsTab.tsx` with:
- `useAsanaWorkspaces()` hook for workspace dropdown
- `useAsanaProjects(workspaceId)` hook for project dropdown (cascading)
- Local form state initialized from client prop
- Dirty state detection
- Fields: workspace dropdown, project dropdown, `TagInput` for email recipients, routing rules text area
- "Save Settings" button (disabled while saving)
- Success message (3s fade-out) and error message inline
- Exposes `isDirty` via callback or ref for the parent `ClientDetailPage` to use in tab-switch guard

References: FRS.md REQ-26-SET-01 through REQ-26-SET-07, TR.md §5 (Settings Tab Technical Details)

Verification: Form pre-fills with client data. Workspace change resets project. Save fires PATCH. Success/error messages display. Dirty flag detects unsaved changes.

---

### Task 7.3 — Implement `useAsanaWorkspaces` and `useAsanaProjects` hooks [small]
Create:
- `apps/ui/src/features/clients/hooks/useAsanaWorkspaces.ts` — fetches `GET /asana/workspaces`
- `apps/ui/src/features/clients/hooks/useAsanaProjects.ts` — fetches `GET /asana/workspaces/{id}/projects` when `workspaceId` is set

References: TR.md §3 (GET /asana/workspaces), FRS.md REQ-26-SET-02, REQ-26-SET-07

Verification: Workspace hook fetches on mount. Project hook refetches when `workspaceId` changes. Loading states shown in dropdowns.

---

## Phase 8: History Tab

### Task 8.1 — Build `HistoryTab` component [medium]
Create `apps/ui/src/features/clients/components/HistoryTab.tsx` with:
- `useClientImportStatus(clientId, enabled)` hook call
- Loading skeleton (table skeleton)
- Error state with Retry
- Empty state: "No historical records have been imported for this client."
- Read-only table with columns: Record Type, Title, Import Date, Source, Imported badge
- No edit or action controls

References: FRS.md REQ-26-HIST-01 through REQ-26-HIST-04, TR.md §3 (GET /clients/{id}/import/status)

Verification: Table renders with Imported badges. No edit controls visible.

---

### Task 8.2 — Implement `useClientImportStatus` hook [small]
Create `apps/ui/src/features/clients/hooks/useClientImportStatus.ts`.

References: TR.md §4 (Data Hooks Pattern)

Verification: Hook fires only when `enabled=true`.

---

## Phase 9: Utilities

### Task 9.1 — Implement `formatRelativeTime` utility [small]
Create `apps/ui/src/utils/formatRelativeTime.ts`:
- Input: ISO 8601 date string
- Output: "just now", "2 minutes ago", "3 hours ago", "yesterday", "Jan 5, 2026"
- No external dependency (use `Date` arithmetic)

References: FRS.md REQ-26-AGD-02 (Agenda Card last edited time)

Verification: `formatRelativeTime(new Date(Date.now() - 7200000).toISOString())` returns "2 hours ago".

---

### Task 9.2 — Implement `formatCycleDates` utility [small]
Create `apps/ui/src/utils/formatCycleDates.ts`:
- Input: `cycleStart: string`, `cycleEnd: string` (ISO 8601)
- Output: `"Feb 1, 2026 → Feb 14, 2026"`

References: FRS.md REQ-26-AGD-02

Verification: Correct formatted string output for a known date pair.

---

## Phase 10: Integration and Verification

### Task 10.1 — Wire all tab components into `ClientDetailPage.tsx` [medium]
Update `ClientDetailPage.tsx` to:
- Render each tab component inside its `TabPanel`
- Pass `enabled={mountedTabs.has(tabId)}` to each tab
- Pass `clientId` and `client` props to each tab
- Wire `isDirty` from `SettingsTab` into the tab-switch guard

References: TR.md §4 (Page Component Strategy)

Verification: All five tabs load correctly on first activation. Tab switch guard works for Settings.

---

### Task 10.2 — Full page smoke test [small]
Manual verification:
- Navigate to a valid client — header renders, Tasks tab loads
- Activate each tab — content loads, no console errors
- Settings: change workspace, add/remove recipient, save, verify success message
- Settings: make change, switch tab, verify confirmation prompt
- Navigate to `/clients/nonexistent-uuid` — "Client not found" renders
- URL `?tab=settings` deep-link — Settings tab opens directly

References: GS.md (all scenarios)

---

### Task 10.3 — TypeScript type-check [small]
Run `nx run ui:type-check`. Confirm zero TypeScript errors across all new files.

---

### Task 10.4 — Update execution/job-queue/index.md [small]
Update the Spec Status for feature 26 from `pending` to `complete` in `execution/job-queue/index.md`.

---

## Completion Checklist

Before marking feature 26 as complete, verify all of the following:

- [ ] Route `app/(dashboard)/clients/[client_id]/page.tsx` registered and functional
- [ ] Client header renders name, workspace, and conditional Grain link
- [ ] Five tabs render in correct order with URL-driven active state
- [ ] Tab content is lazy-loaded (confirmed via Network tab)
- [ ] Tasks tab: summary table, 10-row limit, "View all" link, "Review Tasks" button
- [ ] Agendas tab: agenda cards with all fields, Edit button links to `/agendas/{short_id}`
- [ ] Transcripts tab: call date, type, status badge, no action controls
- [ ] Settings tab: pre-filled form, cascade workspace/project, TagInput, Save button, dirty guard
- [ ] History tab: read-only imported records table, Imported badge, empty state
- [ ] Loading, empty, and error states implemented for all five tabs
- [ ] `Badge`, `Card`, `Avatar` stubs fleshed out with full styles
- [ ] `TagInput` component built and validated
- [ ] `formatRelativeTime` and `formatCycleDates` utilities implemented
- [ ] `nx run ui:build` passes
- [ ] `nx run ui:type-check` passes
- [ ] Spec status in `execution/job-queue/index.md` updated to `complete`
