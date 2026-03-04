# Task List
## Feature 31: UI Admin / Settings

**Version:** 1.0
**Date:** 2026-03-03

---

## Prerequisites

Before beginning implementation, confirm the following are in place:

- [ ] Feature 23 (ui-scaffolding) is complete — `DashboardLayout.tsx`, `ui-tokens` package, and `(dashboard)` route group exist
- [ ] Feature 24 (ui-auth-flow) is complete — `getServerSession()` or equivalent is available and returns `user.role` and `user.id`
- [ ] Feature 22 (api-client-package) is complete — typed API client covers all settings-related endpoints
- [ ] Resolve open questions from TR.md Section 9.2 before beginning implementation:
  - [ ] Confirm Asana test connection endpoint path with Feature 12
  - [ ] Confirm email provider and config schema with Feature 16
  - [ ] Confirm email template format (plain text vs. HTML)
  - [ ] Confirm user role/client update endpoint(s) with API team
  - [ ] Get the full list of valid audit `action` values for the filter dropdown

---

## Phase 1: Route and Page Shell

### Task 1.1 — Create route directory and page shell
**Complexity:** Small
**References:** TR.md Section 4.1, FRS.md FR-01

Create:
```
apps/ui/src/app/(dashboard)/settings/
```

Create `page.tsx` as an async Server Component:
- Import `getServerSession` from auth utilities
- If no session → `redirect('/login')`
- If role is `team_member` → `redirect('/')`
- Wrap content in `DashboardLayout`
- Render a placeholder heading "Settings" with a TODO note for `SettingsTabs`
- Pass `userRole` and `userId` down for when `SettingsTabs` is wired in

**Verification:** Navigate to `/settings` as admin → page loads with DashboardLayout, placeholder content. Navigate as team member → redirected to `/`. Navigate without session → redirected to `/login`.

---

### Task 1.2 — Create `SettingsTabs` component skeleton
**Complexity:** Small
**References:** TR.md Section 4.2, FRS.md FR-03

Create `apps/ui/src/components/AdminSettings/SettingsTabs/SettingsTabs.tsx`:
- `'use client'`
- Props: `userRole: 'admin' | 'account_manager'`, `userId: string`
- Render tab nav with correct tab list based on role (admin: 4 tabs, account_manager: 1 tab)
- Tab click updates `activeTab` state
- Render placeholder `<div>` for each tab panel with the tab name
- ARIA: `role="tablist"` on nav, `role="tab"` on buttons, `aria-selected`, `aria-controls`
- Create `SettingsTabs.module.scss` with tab nav and active tab styles using `ui-tokens`
- Export via `index.ts`

Wire into `page.tsx`.

**Verification:** Admin sees 4 tabs, account manager sees 1 tab. Clicking tabs switches active styling and shows correct placeholder panel.

---

## Phase 2: Shared Components

### Task 2.1 — Create `ConfirmationDialog` component
**Complexity:** Small
**References:** TR.md Section 4.3, FRS.md FR-17, GS.md Scenario Group 13

Create `apps/ui/src/components/AdminSettings/ConfirmationDialog/ConfirmationDialog.tsx`:
- `'use client'`
- Uses native `<dialog>` element with `ref` and `showModal()` / `close()`
- Props: `isOpen`, `title`, `body`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `isConfirming`
- `autoFocus` on Cancel button
- `role="alertdialog"` on `<dialog>` element
- Calls `onCancel` on Escape key (native `<dialog>` behavior handles this automatically)
- `isConfirming` shows a loading spinner on the Confirm button and disables both buttons
- Create `ConfirmationDialog.module.scss` with modal overlay and dialog box styles
- Export via `index.ts`

**Verification:**
- Renders with correct title, body, and button labels
- Cancel button has autoFocus
- Pressing Escape closes the dialog (fires `onCancel`)
- `isConfirming` disables buttons and shows spinner
- Can Tab between buttons

---

## Phase 3: Asana Workspaces Tab

### Task 3.1 — Create `AsanaWorkspacesTab` component
**Complexity:** Medium
**References:** FRS.md FR-04, FR-05, FR-06, FR-07, TR.md Section 4.6

Create `apps/ui/src/components/AdminSettings/AsanaWorkspacesTab/AsanaWorkspacesTab.tsx`:
- `'use client'`
- On mount: fetch `GET /asana/workspaces` via `apiClient`
- Render workspace list with loading, empty, populated, and error states (FRS.md FR-04)
- Per workspace row: name, test connection button, remove button
- Test connection state per workspace (see TR.md Section 4.6): `idle | testing | success | failed`
- Test connection:
  - `POST /asana/workspaces/{id}/test`
  - Success: show "Connection OK" for 3 seconds then auto-reset
  - Failure: show "Connection Failed"
- Remove button: opens `ConfirmationDialog` with workspace name in the body
  - On confirm: `DELETE /asana/workspaces/{id}`, remove from list
  - On cancel: dismiss dialog
- Add workspace form (always visible below list):
  - Name field (text), token field (password)
  - Validation: both required
  - Submit: `POST /asana/workspaces`, on success add to list and clear form
  - On failure: show error below form
- Create `AsanaWorkspacesTab.module.scss`
- Export via `index.ts`

**Verification:**
- Workspace list loads from API
- Empty state shown when no workspaces
- Add form validation catches empty fields
- Successful add updates the list, clears the form
- Test connection shows per-workspace result
- Remove confirmation dialog prevents accidental deletion
- Successful remove updates the list

---

## Phase 4: Users & Roles Tab

### Task 4.1 — Create `UsersRolesTab` component
**Complexity:** Medium
**References:** FRS.md FR-08, FR-09, FR-10

Create `apps/ui/src/components/AdminSettings/UsersRolesTab/UsersRolesTab.tsx`:
- `'use client'`
- Props: `currentUserId: string`
- On mount: fetch `GET /admin/users` via `apiClient`
- Render user list with loading, empty, populated, error states
- Per user row:
  - Name, email, role badge, assigned client count
  - "Edit" button (if user is not the current user's own row for role changes)
  - "Deactivate" button — hidden for `currentUserId` row; hidden for already-deactivated users
- Deactivated users: grayed out row, "Deactivated" badge, disabled Edit/Deactivate buttons
- Deactivate flow: opens `ConfirmationDialog` with user name; on confirm: `POST /admin/users/{id}/deactivate`; on success: update row to deactivated state
- Clicking "Edit": opens `UserEditPanel` (slide-over or inline) for that user
- On `UserEditPanel` save: update the user row in the list
- Create `UsersRolesTab.module.scss`
- Export via `index.ts`

**Verification:**
- All users listed with correct role badges
- Deactivated users appear grayed out
- Current user's row has no Deactivate button
- Deactivation requires confirmation dialog
- Edit button opens the edit panel

---

### Task 4.2 — Create `UserEditPanel` component
**Complexity:** Medium
**References:** FRS.md FR-09, TR.md (component spec)

Create `apps/ui/src/components/AdminSettings/UserEditPanel/UserEditPanel.tsx`:
- `'use client'`
- Props: `user: ProductUser`, `onSave: (updatedUser) => void`, `onClose: () => void`, `isSelf: boolean`
- Renders as a slide-over panel or inline expandable section (decide based on available design system patterns)
- Fields:
  - Role selector (dropdown: Admin / Account Manager / Team Member) — disabled when `isSelf` is true
  - Client assignment multi-select — list of all clients; current assignments pre-checked
- Save action:
  - `PATCH /users/{id}/role` (if role changed)
  - `PATCH /users/{id}/clients` (if client assignments changed)
  - On success: call `onSave` with updated user data, close panel
  - On failure: show inline error, keep panel open
- Cancel/close button calls `onClose`
- Create `UserEditPanel.module.scss`
- Export via `index.ts`

**Verification:**
- Panel opens with current user values pre-populated
- Role selector is disabled for self
- Client multi-select allows checking/unchecking
- Save fires correct API calls and closes panel
- Cancel closes without saving

---

## Phase 5: Email Config Tab

### Task 5.1 — Create `EmailConfigTab` component
**Complexity:** Medium
**References:** FRS.md FR-11, FR-12

Create `apps/ui/src/components/AdminSettings/EmailConfigTab/EmailConfigTab.tsx`:
- `'use client'`
- On mount: fetch `GET /email/config` and `GET /email/templates`
- Config form section:
  - Default sender name (text)
  - Default sender address (email)
  - Reply-to address (email, optional)
  - Provider-specific fields (to be determined per TR.md Section 9.2 — placeholder until resolved)
  - "Save" button: validates email format for address fields, `PUT /email/config`
  - Success: toast/inline "Email configuration saved"
  - Failure: inline error
- Template list section:
  - List of templates with name and last modified date
  - "Edit" button per template → opens inline template editor
  - Template editor: textarea pre-populated with current content, variables reference list, Save/Cancel buttons
  - Save: `PUT /email/templates/{id}`, on success update last modified in list
- Loading/error states for both config and template sections
- Create `EmailConfigTab.module.scss`
- Export via `index.ts`

**Verification:**
- Config form pre-populates with current values from API
- Invalid email format is caught before submission
- Save updates config and shows success notification
- Template list loads and shows templates
- Template editor shows current content and variable reference
- Template save updates the template and shows updated last-modified date

---

## Phase 6: Audit Log Tab

### Task 6.1 — Create `AuditLogFilters` component
**Complexity:** Small
**References:** FRS.md FR-14

Create `apps/ui/src/components/AdminSettings/AuditLogFilters/AuditLogFilters.tsx`:
- `'use client'`
- Props: `users: Array<{id, name}>`, `onApply: (filters) => void`, `onClear: () => void`
- Four filter fields:
  - User: dropdown (all users + "Agent (automated)" option)
  - Entity Type: dropdown (All, task, agenda, transcript, client)
  - Action Type: dropdown with known action values (confirm list from TR.md Section 9.2)
  - Date range: two `<input type="date">` fields (From, To)
- "Apply Filters" button: fires `onApply` with current filter state
- "Clear Filters" button: resets all fields and fires `onClear`
- Active filter count badge when any filter is applied
- Create `AuditLogFilters.module.scss`
- Export via `index.ts`

**Verification:** All filters render. Apply fires callback with current filter state. Clear resets all fields. Badge shows count of active filters.

---

### Task 6.2 — Create `AuditLogTab` component
**Complexity:** Medium
**References:** FRS.md FR-13, FR-14, TR.md Section 4.4, 4.5

Create `apps/ui/src/components/AdminSettings/AuditLogTab/AuditLogTab.tsx`:
- `'use client'`
- Props: `userRole: 'admin' | 'account_manager'`
- State: `filters`, `page`, `data`, `total`, `loading`, `error`
- On mount and on `filters`/`page` change: fetch `GET /audit` with current state (see TR.md Section 4.4)
- Pre-fetch user list (`GET /admin/users`) for the filter dropdown — only for admin (account managers see own actions only)
- Render `AuditLogFilters` with `users` prop and `onApply`/`onClear` callbacks
- Applying filters resets `page` to 1
- Render audit table with columns: Timestamp, User, Action, Entity Type, Entity, Source
- Entity column: use `getEntityRoute()` to create clickable link (or plain text if no route)
- Source column: styled badge per source type
- Pagination: "Previous" / page indicator / "Next" — disabled when at first/last page
- Total count display ("Showing 26–50 of 143 events")
- Loading: skeleton rows (same column count as loaded table)
- Empty: "No audit events match your filters"
- Error: error message + Retry button
- Create `AuditLogTab.module.scss`
- Export via `index.ts`

**Verification:**
- Table loads on tab mount with unfiltered results
- Applying User filter re-fetches with user_id param
- Applying Entity Type filter re-fetches with entity_type param
- Date range filter works
- Pagination navigates correctly and shows current page
- Clearing filters returns to unfiltered results
- Entity links navigate to correct routes
- Source badges are visually distinct

---

## Phase 7: Wire Up Tabs

### Task 7.1 — Replace placeholder tab panels with real components
**Complexity:** Small
**References:** TR.md Section 4.2

In `SettingsTabs.tsx`, replace each placeholder `<div>` with the corresponding tab component:
- `activeTab === 'asana'` → `<AsanaWorkspacesTab />`
- `activeTab === 'users'` → `<UsersRolesTab currentUserId={userId} />`
- `activeTab === 'email'` → `<EmailConfigTab />`
- `activeTab === 'audit'` → `<AuditLogTab userRole={userRole} />`

**Verification:** All four tabs render their real content. Switching tabs correctly shows and hides tab content. No data is fetched for inactive tabs (components are conditionally rendered, not just hidden).

---

## Phase 8: Testing

### Task 8.1 — Unit tests for `ConfirmationDialog`
**Complexity:** Small
**References:** TR.md Section 10.1, GS.md Scenario Group 13

Test cases:
- Renders with correct title, body, confirmLabel, cancelLabel
- Cancel button has autofocus
- Clicking Confirm fires `onConfirm`
- Clicking Cancel fires `onCancel`
- `isConfirming` disables both buttons and shows spinner on Confirm
- Escape key fires `onCancel` (simulate `Escape` keydown on dialog)

---

### Task 8.2 — Unit tests for `SettingsTabs`
**Complexity:** Small
**References:** TR.md Section 10.1

Test cases:
- Admin sees 4 tabs: Asana Workspaces, Users & Roles, Email Config, Audit Log
- Account manager sees 1 tab: Audit Log
- Clicking a tab sets it as active (check `aria-selected`)
- Active tab's panel content is visible; others are not

---

### Task 8.3 — Unit tests for `getEntityRoute`
**Complexity:** Small
**References:** TR.md Section 4.5

Test cases:
- `'task', 'TSK-0042'` → `/tasks/TSK-0042`
- `'agenda', 'AGD-0015'` → `/agendas/AGD-0015`
- `'transcript', 'TRN-0001'` → `null` (no route in V1)
- `'unknown_type', 'X-001'` → `null`
- `'task', null` → `null`

---

### Task 8.4 — Integration tests for `AsanaWorkspacesTab`
**Complexity:** Small
**References:** TR.md Section 10.2

With mock API:
- List loads on mount
- Empty state when API returns `[]`
- Error state when API returns 500
- Add form validation: empty name → error, empty token → error
- Successful add: POST called, workspace added to list, form cleared
- Test connection: testing state → success state → auto-reset after 3s
- Test connection failure: failure state shown
- Remove: confirmation dialog opens, cancel keeps workspace, confirm DELETEs and removes from list

---

### Task 8.5 — Integration tests for `AuditLogTab`
**Complexity:** Small
**References:** TR.md Section 10.2

With mock API:
- Table loads with default results on mount
- Skeleton shown during loading
- Empty state when API returns `[]`
- Error state when API returns 500
- Applying user filter calls API with `user_id` param
- Applying filter resets page to 1
- Pagination: next page increments page state, previous page decrements
- Clearing filters resets all params
- Entity link renders as anchor with correct href

---

### Task 8.6 — Accessibility audit
**Complexity:** Small
**References:** TR.md Section 10.4

Run `axe-core` against each tab:
- Tab navigation ARIA: `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`
- Audit log table: `<th>` with `scope="col"` on all column headers
- Confirmation dialog: `role="alertdialog"`, focus trapping, `aria-modal="true"`
- All form inputs have `<label>` associations
- Error messages linked via `aria-describedby`
- Source badges have sufficient color contrast
- All interactive elements reachable via keyboard

---

## Phase 9: Final Verification

### Task 9.1 — E2E test against staging
**Complexity:** Small

With staging environment running:
- Admin: navigate to `/settings` → 4 tabs visible → add workspace → workspace appears
- Admin: navigate to Users tab → edit role → save → badge updated
- Admin: navigate to Audit Log → apply date filter → results updated
- Account manager: navigate to `/settings` → only Audit Log visible
- Team member: navigate to `/settings` → redirected to `/`

---

### Task 9.2 — Cross-browser smoke test
**Complexity:** Small

Verify tab interaction, confirmation dialog, and audit log table in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)

Pay specific attention to native `<dialog>` element behavior in each browser.

---

### Task 9.3 — Resolve open questions and update specs if needed
**Complexity:** Small
**References:** TR.md Section 9.2

Before marking feature complete, verify each open question has been resolved:
- Asana test endpoint confirmed and implemented
- Email config schema confirmed and form updated
- Email template format confirmed and editor approach implemented
- User role/client update endpoints confirmed
- Audit log action values confirmed and filter populated

Update TR.md and FRS.md if any of the above required changes from the assumptions documented here.

---

## Summary

| Phase | Tasks | Complexity |
|---|---|---|
| 1: Route and Page Shell | 1.1, 1.2 | Small, Small |
| 2: Shared Components | 2.1 | Small |
| 3: Asana Workspaces Tab | 3.1 | Medium |
| 4: Users & Roles Tab | 4.1, 4.2 | Medium, Medium |
| 5: Email Config Tab | 5.1 | Medium |
| 6: Audit Log Tab | 6.1, 6.2 | Small, Medium |
| 7: Wire Up Tabs | 7.1 | Small |
| 8: Testing | 8.1–8.6 | Small mix |
| 9: Final Verification | 9.1, 9.2, 9.3 | Small, Small, Small |

**Total estimated complexity:** 4 Medium tasks, remainder Small. No single Large task — the feature's complexity is distributed across four independent tabs.

**Critical path:** Task 1.1 → 1.2 → 2.1 → then each tab in parallel (3.1, 4.1+4.2, 5.1, 6.1+6.2) → 7.1. The tabs can be built in parallel by different developers since they share only `ConfirmationDialog` and the page shell.

**Highest risk area:** Email Config Tab (Task 5.1) — depends on resolving the open questions in TR.md Section 9.2 about provider and template format. This tab should not be started until those questions are answered. All other tabs can proceed.
