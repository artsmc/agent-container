# FRS — Functional Requirement Specification
## Feature 31: UI Admin / Settings

**Version:** 1.0
**Date:** 2026-03-03

---

## 1. Page Architecture

### FR-01: Route Definition

The admin settings page must be registered at `app/(dashboard)/settings/page.tsx`. It must be inside the auth-protected `(dashboard)` route group.

**Acceptance Criteria:**
- Navigating to `/settings` resolves to the admin settings page
- Unauthenticated users are redirected to `/login`
- Users with `team_member` role are redirected to `/`
- Users with `account_manager` role see only the Audit Log tab (all others hidden or inaccessible)
- Users with `admin` role see all four tabs

### FR-02: Layout Wrapper

The page uses `DashboardLayout`. The left sidebar navigation must highlight a "Settings" or gear icon nav item when on this route.

### FR-03: Tab Navigation

The page displays four tabs. Tab rendering and access depend on user role:

| Tab | Label | Admin | Account Manager |
|---|---|---|---|
| 1 | Asana Workspaces | Visible and accessible | Hidden or inaccessible |
| 2 | Users & Roles | Visible and accessible | Hidden or inaccessible |
| 3 | Email Config | Visible and accessible | Hidden or inaccessible |
| 4 | Audit Log | Visible and accessible | Visible and accessible |

**Tab behavior:**
- Default tab on page load:
  - Admin: "Asana Workspaces" (first tab)
  - Account Manager: "Audit Log" (only tab)
- Clicking a tab loads its content without full page navigation (client-side tab state)
- Active tab has distinct visual styling
- URL may optionally include a `?tab=` query parameter to support direct linking to a specific tab

**Acceptance Criteria:**
- Tab click switches visible content without page reload
- Each tab maintains its own loading and data state
- Active tab is visually distinct
- Admin sees all four tabs; account manager sees only Audit Log

---

## 2. Asana Workspaces Tab

### FR-04: Workspace List

Fetch and display all configured Asana workspace connections via `GET /asana/workspaces`.

**Each workspace row displays:**
- Workspace name
- Connection status indicator (connected / unknown — determined by test result)
- Date added (if available from API)
- Actions: "Test Connection", "Remove"

**States:**
- Loading: skeleton or spinner while fetching
- Empty: "No Asana workspaces configured. Add one below."
- Populated: list of workspace rows
- Error: "Failed to load workspaces. Please refresh."

**Acceptance Criteria:**
- Workspace list loads on tab mount
- Each workspace shows name and actions
- Empty state is shown when no workspaces exist
- Load error shows error state, not a blank screen

### FR-05: Add Workspace Form

Inline form below the workspace list for adding a new workspace connection.

**Fields:**
- Workspace Name (text input, required)
- Asana API Token (password-type input, required — value is masked and never shown after save)

**Behavior:**
- Form is always visible below the list (or in a collapsible section)
- Submit button: "Add Workspace"
- On success: clears form, adds new workspace to the list
- On failure: shows inline error below the form

**Acceptance Criteria:**
- Both fields are required — submitting with either empty shows a validation error
- API token field is `type="password"` — value is masked
- After successful add, the form is cleared and the new workspace appears in the list
- Failed add shows an inline error message

### FR-06: Test Workspace Connection

Each workspace row has a "Test Connection" button.

**Behavior:**
- On click: show a loading state on the button
- Call the test connection endpoint (implementation detail: `POST /asana/workspaces/{id}/test` or equivalent — confirm with API spec)
- On success: show a success indicator ("Connection OK") next to the workspace name, auto-dismiss after 3 seconds
- On failure: show a failure indicator ("Connection Failed") with a brief error message

**Acceptance Criteria:**
- Button shows loading state during API call
- Success state clearly indicates the connection is valid
- Failure state clearly indicates the connection failed
- Indicators auto-dismiss or have an explicit dismiss action
- Other workspaces in the list are not affected during the test

### FR-06B: Asana Credential Management

The Asana Workspaces tab must include credential management for Asana API tokens.

**Credential storage:**
- Asana API tokens are encrypted in the database. The encryption/decryption is handled server-side by a credential encryption/decryption utility (see infrastructure specs).
- The UI never receives or displays the raw API token after initial submission.

**Credential display and update:**
- Each workspace row must display the API token status: "Configured" (with a masked display, e.g., `••••••••abcd`) or "Not configured".
- An "Update Token" button on each workspace row opens an inline form or modal with a single `type="password"` input field for entering a new API token.
- Submitting the update form calls `PATCH /asana/workspaces/{id}` (or `PUT /asana/workspaces/{id}/token`) with the new token value.
- On success: the token status updates to "Configured" and a success message is shown. The raw token value is cleared from the form.
- On failure: an inline error is shown; the form remains open for retry.

**Acceptance Criteria:**
- API tokens are never displayed in plain text after initial entry
- The masked display shows only the last 4 characters (e.g., `••••••••abcd`)
- Token update requires only the new token value (no re-entry of workspace name)
- Successful token update clears the input field

### FR-07: Remove Workspace

Each workspace row has a "Remove" button.

**Behavior:**
- On click: show a confirmation prompt ("Remove this workspace? Tasks currently using it may be affected.")
- On confirm: call `DELETE /asana/workspaces/{id}`
- On success: remove the workspace from the list
- On failure: show an inline error

**Acceptance Criteria:**
- Confirmation step is required before deletion — no accidental removals
- Successful delete removes the workspace from the list without page reload
- Failed delete shows an error, does not remove the workspace from the list

---

## 3. Users & Roles Tab

### FR-08: User List

Fetch and display all product users via `GET /admin/users` (auth service) cross-referenced with product-level roles via the product API.

**Each user row displays:**
- User name
- Email address
- Current role (badge: Admin / Account Manager / Team Member)
- Number of assigned clients
- Action: "Edit" (opens edit panel or inline editing)
- Action: "Deactivate" (for non-self users only)

**States:**
- Loading, empty ("No users found"), populated, error

**Acceptance Criteria:**
- All users are listed with name, email, role, and client count
- "Deactivate" is not available on the currently logged-in admin's own row
- Empty and error states are handled

### FR-09: Edit User Role

Clicking "Edit" on a user row opens an edit interface (inline or slide-over panel).

**Fields:**
- Role selector: dropdown with options `Admin`, `Account Manager`, `Team Member`
- Client assignments: multi-select list of clients — search and select
  - For `admin` role: client assignment is optional / not applicable (admins have access to all clients)
  - For `account_manager` role: requires at least one client assigned
  - For `team_member` role: client assignments are read-only access assignments

**Behavior:**
- Changes are saved via a "Save" button (not auto-saved)
- On success: close edit interface, update the user row with new values
- On failure: show inline error

**Acceptance Criteria:**
- Role change is persisted via the product API
- Client assignments update immediately after save
- Admin cannot change their own role (self-editing of role is prevented)
- Account Manager role without any clients assigned shows a warning but is allowed (edge case)

### FR-10: Deactivate User

"Deactivate" triggers user deactivation via `POST /admin/users/{id}/deactivate`.

**Behavior:**
- Confirmation dialog: "Deactivate [User Name]? They will immediately lose access to all iExcel applications."
- On confirm: call deactivate endpoint
- On success: update user row to show deactivated status (grayed out, "Deactivated" badge)
- Deactivated users appear in the list but cannot be interacted with (edit is disabled)
- Admin cannot deactivate themselves

**Acceptance Criteria:**
- Confirmation dialog is shown before deactivation
- Deactivated users appear visually distinct (grayed out or badged)
- Self-deactivation is prevented (button hidden or disabled for own row)
- Deactivated user loses access immediately (auth service handles session revocation)

---

## 4. Email Config Tab

### FR-11: Email Configuration Form

A form for managing email delivery settings.

**Fields:**

| Field | Type | Description |
|---|---|---|
| Default Sender Name | Text | Display name for outgoing emails (e.g., "iExcel Team") |
| Default Sender Address | Email | From address (e.g., team@iexcel.com) |
| Reply-To Address | Email | Optional reply-to address |
| Provider Configuration | Provider-specific | Abstracted behind a common interface (see FR-12) |

**Behavior:**
- Current configuration is loaded on tab mount (`GET /email/config` or equivalent)
- Form is pre-populated with current values
- "Save" button persists changes
- On success: show a success notification ("Email configuration saved")
- On failure: show an inline error

**Acceptance Criteria:**
- Current configuration pre-populates the form on tab load
- All fields are validated before save (valid email format for address fields)
- Success and failure states are clearly communicated

### FR-12: Email Template Management

A secondary section within the Email Config tab for managing email templates used in agenda distribution.

**Display:**
- List of template types (e.g., "Agenda Distribution", "Agenda Reminder")
- For each template: name, last modified date, "Edit" button

**Edit behavior:**
- Clicking "Edit" opens a template editor (textarea or simple rich text editor)
- Template content is pre-populated with current template
- Variables available for use in templates (e.g., `{{client_name}}`, `{{agenda_short_id}}`) are listed as a reference
- "Save" and "Cancel" buttons

**Acceptance Criteria:**
- Template list loads on tab mount
- Editing a template shows current content
- Saving updates the template via the API
- Available template variables are shown as a reference (non-editable list)

---

## 5. Audit Log Tab

### FR-13: Audit Log Table

A paginated, filterable table of all system audit events, fetched from `GET /audit`.

**Columns:**

| Column | Data Field | Format |
|---|---|---|
| Timestamp | `created_at` | Human-readable (e.g., "Mar 1, 2026 at 2:34 PM") |
| User | `user_id` → resolved to `name` | "Agent" if `user_id` is null |
| Action | `action` | e.g., `task.created`, `agenda.shared` |
| Entity Type | `entity_type` | `task`, `agenda`, `transcript`, `client` |
| Entity | `entity_id` → short ID | Clickable link to the relevant entity (e.g., `TSK-0042` → `/tasks/TSK-0042`) |
| Source | `source` | Badge: `agent`, `ui`, `terminal` |

**Pagination:**
- Default page size: 25 rows per page
- Next/previous page controls
- Total record count displayed

**States:**
- Loading (spinner or skeleton rows)
- Empty ("No audit events match your filters")
- Populated
- Error

**Acceptance Criteria:**
- Table loads on tab mount with default (no filter) results
- Pagination controls navigate correctly
- Entity links navigate to the correct entity detail screen
- "Agent" is shown for automated actions (null user_id)
- Source is shown as a badge with distinct styling per source type

### FR-14: Audit Log Filters

A filter panel or filter bar above the audit log table.

**Filter fields:**

| Filter | Type | Values |
|---|---|---|
| User | Dropdown | All users in the system + "Agent (automated)" |
| Entity Type | Dropdown | All, task, agenda, transcript, client |
| Action Type | Dropdown/Multiselect | All, specific actions (e.g., task.created, task.approved, agenda.shared) |
| Date Range | Date range picker | Start date, End date |

**Behavior:**
- Filters are applied when user clicks "Apply Filters" or in real time (debounced)
- "Clear Filters" button resets all filters to defaults
- Applied filters are visually indicated (e.g., active filter count badge)
- Filters and pagination interact: applying a new filter resets to page 1

**API query:**
`GET /audit?user_id={id}&entity_type={type}&action={action}&date_from={iso}&date_to={iso}&page={n}&limit=25`

**Acceptance Criteria:**
- Each filter narrows the result set correctly
- Multiple filters can be applied simultaneously
- "Clear Filters" resets results to unfiltered state
- Applying a filter resets to page 1
- Account Managers see only audit events related to their assigned clients (filtering is enforced server-side)

---

## 6. Shared Behaviors

### FR-15: Loading States

Every tab must show a loading state while its data is fetching. Use skeleton loaders or a centered spinner appropriate to the content type:
- Table data: skeleton rows (same column structure as the loaded table)
- Form data: skeleton inputs
- Simple list: skeleton list items

### FR-16: Error States

Every tab must handle API failures gracefully:
- Show a clear, non-technical error message
- Provide a "Retry" button where appropriate
- Do not show a blank, empty tab on error

### FR-17: Confirmation Dialogs

Destructive actions (Remove Workspace, Deactivate User) must require a confirmation dialog before the API call is made. The dialog must:
- Clearly describe the action being taken
- Name the specific entity being affected
- Provide "Confirm" and "Cancel" buttons
- Default focus on "Cancel" (to prevent accidental confirmation on Enter key)

---

## 7. Component Breakdown

### FR-18: New Components Required

| Component | Location | Type | Purpose |
|---|---|---|---|
| `SettingsPage` | `app/(dashboard)/settings/page.tsx` | Server Component (shell) | Route entry, role check, tab routing |
| `SettingsTabs` | `components/AdminSettings/SettingsTabs.tsx` | Client Component | Tab navigation and content switching |
| `AsanaWorkspacesTab` | `components/AdminSettings/AsanaWorkspacesTab.tsx` | Client Component | Workspace list, add form, test, remove |
| `UsersRolesTab` | `components/AdminSettings/UsersRolesTab.tsx` | Client Component | User list, edit role/clients, deactivate |
| `UserEditPanel` | `components/AdminSettings/UserEditPanel.tsx` | Client Component | Inline or slide-over user edit form |
| `EmailConfigTab` | `components/AdminSettings/EmailConfigTab.tsx` | Client Component | Email settings form + template list |
| `AuditLogTab` | `components/AdminSettings/AuditLogTab.tsx` | Client Component | Audit table with filters and pagination |
| `AuditLogFilters` | `components/AdminSettings/AuditLogFilters.tsx` | Client Component | Filter bar for the audit log |
| `ConfirmationDialog` | `components/AdminSettings/ConfirmationDialog.tsx` | Client Component | Reusable destructive action confirmation |

### FR-19: Existing Components to Reuse

| Asset | Source Feature | Usage |
|---|---|---|
| `DashboardLayout.tsx` | Feature 23 (ui-scaffolding) | Page layout |
| `ui-tokens` package | Feature 23 (ui-scaffolding) | All SCSS design tokens |
| `api-client` package | Feature 22 (api-client-package) | All API calls |
