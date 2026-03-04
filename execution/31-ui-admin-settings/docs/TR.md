# TR — Technical Requirements
## Feature 31: UI Admin / Settings

**Version:** 1.0
**Date:** 2026-03-03
**Next.js Version:** 16.1.6

---

## 1. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.1.6, App Router | Inside `(dashboard)` route group |
| Language | TypeScript | Strict mode |
| Styling | SCSS Modules + `ui-tokens` package | No Tailwind, no shadcn |
| API access | `api-client` package (Feature 22) | All API calls through typed client |
| Tab state | React `useState` + URL query param `?tab=` | Client-side tab switching with optional deep-link support |
| Pagination state | React `useState` | Page index and total count managed locally |
| Filter state | React `useState` | Filter values managed in `AuditLogFilters` component |
| Rendering | Client Components per tab | Each tab is `"use client"` due to interactive state |
| Page shell | Server Component | Role check and initial data pass-through |

---

## 2. File Structure

```
apps/ui/
└── src/
    ├── app/
    │   └── (dashboard)/
    │       └── settings/
    │           └── page.tsx                                  # Server Component shell — role check
    ├── components/
    │   └── AdminSettings/
    │       ├── SettingsTabs/
    │       │   ├── SettingsTabs.tsx                          # "use client" — tab switcher
    │       │   ├── SettingsTabs.module.scss
    │       │   └── index.ts
    │       ├── AsanaWorkspacesTab/
    │       │   ├── AsanaWorkspacesTab.tsx                    # "use client"
    │       │   ├── AsanaWorkspacesTab.module.scss
    │       │   └── index.ts
    │       ├── UsersRolesTab/
    │       │   ├── UsersRolesTab.tsx                         # "use client"
    │       │   ├── UsersRolesTab.module.scss
    │       │   └── index.ts
    │       ├── UserEditPanel/
    │       │   ├── UserEditPanel.tsx                         # "use client" — inline or slide-over
    │       │   ├── UserEditPanel.module.scss
    │       │   └── index.ts
    │       ├── EmailConfigTab/
    │       │   ├── EmailConfigTab.tsx                        # "use client"
    │       │   ├── EmailConfigTab.module.scss
    │       │   └── index.ts
    │       ├── AuditLogTab/
    │       │   ├── AuditLogTab.tsx                           # "use client"
    │       │   ├── AuditLogTab.module.scss
    │       │   └── index.ts
    │       ├── AuditLogFilters/
    │       │   ├── AuditLogFilters.tsx                       # "use client"
    │       │   ├── AuditLogFilters.module.scss
    │       │   └── index.ts
    │       └── ConfirmationDialog/
    │           ├── ConfirmationDialog.tsx                    # "use client" — reusable
    │           ├── ConfirmationDialog.module.scss
    │           └── index.ts
```

---

## 3. API Contracts

### 3.1 Endpoints Used

| Endpoint | Method | Tab | Purpose |
|---|---|---|---|
| `GET /asana/workspaces` | GET | Asana | List configured workspaces |
| `POST /asana/workspaces` | POST | Asana | Add new workspace |
| `POST /asana/workspaces/{id}/test` | POST | Asana | Test connection |
| `DELETE /asana/workspaces/{id}` | DELETE | Asana | Remove workspace |
| `PATCH /asana/workspaces/{id}` | PATCH | Asana | Update workspace token (encrypted storage) |
| `GET /admin/users` | GET | Users | List all users with product roles |
| `PATCH /users/{id}/role` | PATCH | Users | Update user product role |
| `PATCH /users/{id}/clients` | PATCH | Users | Update user client assignments |
| `POST /admin/users/{id}/deactivate` | POST | Users | Deactivate user |
| `GET /email/config` | GET | Email | Get current email config |
| `PUT /email/config` | PUT | Email | Save email config |
| `GET /email/templates` | GET | Email | List email templates |
| `PUT /email/templates/{id}` | PUT | Email | Update email template |
| `GET /audit` | GET | Audit | Query audit log with filters |

**Note on Asana test endpoint:** The test connection endpoint is assumed to be `POST /asana/workspaces/{id}/test`. Confirm the exact endpoint path and response shape with the Feature 12 (output-normalizer-asana) API specification.

### 3.2 Key Response Shapes

#### `GET /asana/workspaces`
```typescript
interface AsanaWorkspace {
  id: string
  name: string
  created_at: string        // ISO datetime
  token_suffix: string      // Last 4 characters of the API token for masked display (e.g., "abcd")
  token_configured: boolean // Whether an API token has been set
  // NOTE: Full API token is NOT returned — it is encrypted at rest and write-only
}
type GetWorkspacesResponse = AsanaWorkspace[]
```

#### `GET /admin/users` (combined with product API)
```typescript
interface ProductUser {
  id: string             // Product user UUID
  auth_user_id: string   // Auth service user ID
  email: string
  name: string
  role: 'admin' | 'account_manager' | 'team_member'
  is_active: boolean
  assigned_clients: Array<{ id: string; name: string }>
}
type GetUsersResponse = ProductUser[]
```

#### `GET /audit`
```typescript
interface AuditEvent {
  id: string
  user_id: string | null       // null for agent actions
  user_name: string | null     // resolved from user_id; null → display "Agent"
  action: string               // e.g. "task.created"
  entity_type: 'task' | 'agenda' | 'transcript' | 'client'
  entity_id: string
  entity_short_id: string | null  // e.g. "TSK-0042" if resolvable
  metadata: Record<string, unknown>
  source: 'agent' | 'ui' | 'terminal'
  created_at: string           // ISO datetime
}

interface GetAuditResponse {
  data: AuditEvent[]
  total: number
  page: number
  limit: number
}
```

#### `GET /audit` query parameters
```
GET /audit
  ?user_id={uuid}
  &entity_type={task|agenda|transcript|client}
  &action={action_string}
  &date_from={ISO date}
  &date_to={ISO date}
  &page={number}
  &limit={number, default 25}
```

---

## 4. Component Specifications

### 4.1 Page Component (`app/(dashboard)/settings/page.tsx`)

```typescript
// Server Component — no "use client"
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session) redirect('/login')
  if (session.user.role === 'team_member') redirect('/')

  return (
    <DashboardLayout>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <SettingsTabs userRole={session.user.role} userId={session.user.id} />
      </div>
    </DashboardLayout>
  )
}
```

**Key decisions:**
- Role is passed to `SettingsTabs` to control tab visibility — avoids client-side role re-fetching
- `userId` is passed to prevent self-deactivation in the Users tab
- No initial data pre-fetching in the server component — each tab fetches its own data on mount

### 4.2 `SettingsTabs` Component

```typescript
'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type TabId = 'asana' | 'users' | 'email' | 'audit'

interface SettingsTabsProps {
  userRole: 'admin' | 'account_manager'
  userId: string
}

const ADMIN_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'asana', label: 'Asana Workspaces' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'email', label: 'Email Config' },
  { id: 'audit', label: 'Audit Log' },
]

const ACCOUNT_MANAGER_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'audit', label: 'Audit Log' },
]

export function SettingsTabs({ userRole, userId }: SettingsTabsProps) {
  const tabs = userRole === 'admin' ? ADMIN_TABS : ACCOUNT_MANAGER_TABS
  const defaultTab = tabs[0].id

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  return (
    <div className={styles.container}>
      <nav className={styles.tabNav} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabContent}>
        {activeTab === 'asana' && userRole === 'admin' && (
          <AsanaWorkspacesTab />
        )}
        {activeTab === 'users' && userRole === 'admin' && (
          <UsersRolesTab currentUserId={userId} />
        )}
        {activeTab === 'email' && userRole === 'admin' && (
          <EmailConfigTab />
        )}
        {activeTab === 'audit' && (
          <AuditLogTab userRole={userRole} />
        )}
      </div>
    </div>
  )
}
```

**Key decisions:**
- Tab state is local React state — simple and sufficient; URL `?tab=` query param can be added in a follow-up if direct linking is required
- ARIA roles (`tablist`, `tab`, `tabpanel`) for accessibility
- Tab components are conditionally rendered — they mount and fetch data when activated

### 4.3 `ConfirmationDialog` Component

```typescript
'use client'

interface ConfirmationDialogProps {
  isOpen: boolean
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isConfirming?: boolean   // loading state during async confirm action
}
```

**Implementation notes:**
- Uses `<dialog>` element (native HTML) for accessibility — supports `Escape` to close natively
- `autoFocus` on the Cancel button to prevent accidental destructive action on Enter
- `aria-modal="true"` and `role="alertdialog"` on the `<dialog>` element
- `isConfirming` prop shows a loading state on the Confirm button during async actions

### 4.4 `AuditLogTab` — Pagination State

```typescript
interface AuditLogState {
  page: number
  limit: number
  filters: AuditFilters
  data: AuditEvent[]
  total: number
  loading: boolean
  error: string | null
}

interface AuditFilters {
  userId: string | null
  entityType: string | null
  action: string | null
  dateFrom: string | null
  dateTo: string | null
}
```

**Fetch on filter/page change:**
```typescript
useEffect(() => {
  const fetchAuditLog = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.audit.query({
        ...filters,
        page,
        limit,
      })
      setData(result.data)
      setTotal(result.total)
    } catch (err) {
      setError('Failed to load audit log. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  fetchAuditLog()
}, [page, filters])  // Re-fetch when page or filters change
```

**Applying filters resets page:**
```typescript
const handleApplyFilters = (newFilters: AuditFilters) => {
  setFilters(newFilters)
  setPage(1)  // Always reset to page 1 when filters change
}
```

### 4.5 Entity Link Resolution in Audit Log

```typescript
// Utility to resolve entity type + short_id to a route
function getEntityRoute(entityType: string, entityShortId: string | null): string | null {
  if (!entityShortId) return null
  switch (entityType) {
    case 'task':      return `/tasks/${entityShortId}`
    case 'agenda':    return `/agendas/${entityShortId}`
    case 'transcript': return null  // No dedicated transcript detail screen in V1
    case 'client':    return `/clients/${entityShortId}`  // May need UUID instead of short_id
    default:          return null
  }
}
```

### 4.6 `AsanaWorkspacesTab` — Test Connection Flow

```typescript
interface TestConnectionState {
  [workspaceId: string]: 'idle' | 'testing' | 'success' | 'failed'
}

const handleTestConnection = async (workspaceId: string) => {
  setTestStates(prev => ({ ...prev, [workspaceId]: 'testing' }))

  try {
    await apiClient.asana.testConnection(workspaceId)
    setTestStates(prev => ({ ...prev, [workspaceId]: 'success' }))

    // Auto-reset to idle after 3 seconds
    setTimeout(() => {
      setTestStates(prev => ({ ...prev, [workspaceId]: 'idle' }))
    }, 3000)
  } catch (err) {
    setTestStates(prev => ({ ...prev, [workspaceId]: 'failed' }))
  }
}
```

**Key decision:** Test connection state is per-workspace (keyed by workspace ID) so multiple workspaces can be tested independently without interfering with each other.

---

## 5. SCSS Module Architecture

### 5.1 Token Imports

```scss
@use '@iexcel/ui-tokens' as tokens;
```

### 5.2 Tab Navigation Styles

```scss
// SettingsTabs.module.scss
.tabNav {
  display: flex;
  border-bottom: 1px solid tokens.$color-border-default;
  margin-bottom: tokens.$spacing-6;
  gap: tokens.$spacing-1;
}

.tab {
  padding: tokens.$spacing-3 tokens.$spacing-5;
  font-size: tokens.$font-size-sm;
  font-weight: tokens.$font-weight-medium;
  color: tokens.$color-text-secondary;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color tokens.$transition-fast,
              border-color tokens.$transition-fast;

  &:hover {
    color: tokens.$color-text-primary;
  }

  &.active {
    color: tokens.$color-brand-primary;
    border-bottom-color: tokens.$color-brand-primary;
    font-weight: tokens.$font-weight-semibold;
  }
}
```

### 5.3 Source Badge Styles

```scss
// AuditLogTab.module.scss
.sourceBadge {
  display: inline-flex;
  align-items: center;
  padding: 2px tokens.$spacing-2;
  border-radius: tokens.$radius-sm;
  font-size: tokens.$font-size-xs;
  font-weight: tokens.$font-weight-medium;
  text-transform: lowercase;

  &.agent {
    background-color: tokens.$color-purple-tint;
    color: tokens.$color-purple-dark;
  }

  &.ui {
    background-color: tokens.$color-blue-tint;
    color: tokens.$color-blue-dark;
  }

  &.terminal {
    background-color: tokens.$color-green-tint;
    color: tokens.$color-green-dark;
  }
}
```

---

## 6. Permission Enforcement

### 6.1 Server-Side (Page Component)

The page component enforces the role check server-side:
- `team_member` → redirect to `/`
- Unauthenticated → redirect to `/login`
- `admin` / `account_manager` → render page

### 6.2 Client-Side (Tab Visibility)

`SettingsTabs` receives `userRole` as a prop from the server component and uses it to:
- Render only the appropriate tabs in the tab nav
- Gate conditional rendering of tab content components

This means account managers who somehow inspect the source will see only the Audit Log tab rendered. Attempting to access admin tabs is prevented by the server-side API calls failing with 403 even if the client component were to render them.

### 6.3 API-Level Enforcement

All write operations (POST, PATCH, PUT, DELETE) against admin endpoints are protected by the API layer. The UI cannot circumvent API-level authorization. The UI's role check is a UX convenience, not a security boundary.

---

## 7. Performance Requirements

| Metric | Target | Approach |
|---|---|---|
| Tab switch to content visible | < 500ms (skeleton shown immediately) | Skeleton loader on mount; API call concurrent with render |
| Audit log query response | < 1 second for 25 rows | API-level query optimization; paginated response |
| Workspace list load | < 500ms | Small dataset; single API call |
| User list load | < 500ms | Small dataset; single API call |
| Test connection response | < 5 seconds | Asana API call — show loading state to set expectation |

---

## 8. Security Considerations

### 8.1 API Token Masking and Encrypted Storage

Asana API tokens are encrypted at rest in the database using a credential encryption/decryption utility. The encryption key is managed server-side and is not exposed to the UI.

- The `POST /asana/workspaces` request body contains the raw token; the API encrypts it before storage.
- `GET /asana/workspaces` never returns the raw token. It returns a masked suffix (e.g., `token_suffix: "abcd"`) so the UI can display `••••••••abcd` to confirm a token is configured.
- Token updates via `PATCH /asana/workspaces/{id}` or `PUT /asana/workspaces/{id}/token` accept the new raw token and re-encrypt on storage.
- The UI must use `type="password"` for all token input fields.

### 8.2 Self-Protection Rules

The `SettingsTabs` component receives `userId` and passes it to `UsersRolesTab`. `UsersRolesTab` must:
- Not render a "Deactivate" button on the row matching the current user's ID
- Disable or hide the role selector on the current user's own row (admins cannot demote themselves)

This prevents accidental self-lockout.

### 8.3 Confirmation Before Destructive Actions

All destructive operations (workspace removal, user deactivation) must route through `ConfirmationDialog` before any API call is made. This is a UX safety requirement, not a security one — but it is mandatory.

### 8.4 Audit Log — Account Manager Scoping

When an account manager views the Audit Log, the API must scope results to that user's assigned clients. The UI passes the auth token with every request; the API enforces scoping based on the token's claims. The UI does not need to implement client-side filtering of audit results — the API response will already be scoped.

---

## 9. Dependencies

### 9.1 Internal Dependencies

| Dependency | Feature | What is needed |
|---|---|---|
| `DashboardLayout` | Feature 23 (ui-scaffolding) | Page layout |
| `ui-tokens` package | Feature 23 (ui-scaffolding) | All SCSS design tokens |
| `api-client` package | Feature 22 (api-client-package) | All API calls |
| Auth middleware / session | Feature 24 (ui-auth-flow) | Role check in page component |
| `GET /asana/workspaces` | Feature 12 (output-normalizer-asana) | Workspace list |
| `POST /asana/workspaces` | Feature 12 | Add workspace |
| `DELETE /asana/workspaces/{id}` | Feature 12 | Remove workspace |
| `GET /admin/users` | Feature 05 (auth-service) + product API | User list |
| `POST /admin/users/{id}/deactivate` | Feature 05 (auth-service) | User deactivation |
| `GET /audit` | API layer (audit logging) | Audit log queries |
| `GET /email/config`, `PUT /email/config` | Feature 16 (email-adapter) | Email config |
| `GET /email/templates`, `PUT /email/templates/{id}` | Feature 16 | Template management |

### 9.2 Open Questions (Must Resolve Before Implementation)

1. **Asana connection test endpoint:** Confirm the exact path and method for testing a workspace connection. Assumed: `POST /asana/workspaces/{id}/test`. Coordinate with Feature 12.
2. **Email provider:** The email config form design depends on which provider is used (SendGrid, Resend, Google Workspace). Coordinate with Feature 16 to understand the config schema.
3. **Email template format:** Are templates stored as plain text with `{{variable}}` substitution, or as HTML? This affects the template editor component.
4. **User role update endpoint:** Confirm whether role and client assignment are updated in a single `PATCH /users/{id}` call or via separate endpoints.
5. **Audit log action types:** Confirm the complete list of valid `action` values for the filter dropdown. Coordinate with the API and database teams.

### 9.3 External/NPM Dependencies

No new npm dependencies required beyond those already in the project.

---

## 10. Testing Requirements

### 10.1 Unit Tests

- `ConfirmationDialog`: renders with correct title/body, Confirm button fires callback, Cancel button fires callback, Escape key fires cancel callback, default focus is on Cancel
- `SettingsTabs`: admin sees 4 tabs, account manager sees 1 tab, tab click updates active state, non-active tab content is not rendered
- `getEntityRoute()`: correct routes for each entity type, null for unknown types
- `validateEmailConfig()`: valid email passes, invalid format fails
- `validateWorkspaceForm()`: name required, token required

### 10.2 Integration Tests

- `AsanaWorkspacesTab` with mock API: list loads, add form submits and updates list, remove with confirmation deletes and updates list, test connection updates per-workspace state
- `UsersRolesTab` with mock API: user list loads, edit panel opens with current values, save updates the list, deactivate requires confirmation, self-row has no deactivate button
- `AuditLogTab` with mock API: table loads with default results, applying user filter updates results, page change fetches next page, clearing filters resets results
- `EmailConfigTab` with mock API: form pre-populates with current config, save sends correct payload, template list loads, template edit saves correctly

### 10.3 E2E Tests

- Navigate to `/settings` as admin → all 4 tabs visible, default tab is Asana Workspaces
- Navigate to `/settings` as account manager → only Audit Log visible
- Navigate to `/settings` as team member → redirected to `/`
- Full workspace add flow: fill form → submit → workspace appears in list
- Workspace remove: click Remove → confirmation dialog → Confirm → workspace removed from list
- Role change: edit user → change role → save → badge updated in list
- Audit log filter: apply user filter → results update → clear filter → full results

### 10.4 Accessibility Tests

- Tab navigation uses correct ARIA roles (`tablist`, `tab`, `tabpanel`, `aria-selected`)
- Confirmation dialog uses `role="alertdialog"` and traps focus
- Audit log table has proper `<th>` headers with `scope` attributes
- All form inputs have associated `<label>` elements
- Error messages linked to fields via `aria-describedby`
- Keyboard navigation reaches all interactive elements in all tabs
