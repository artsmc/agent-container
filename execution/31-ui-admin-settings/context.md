# Feature 31: UI Admin / Settings

## Summary
Build Screen 9 (Admin/Settings) at route `/settings`. Includes tabs for: Asana Workspaces (add/remove/test connections), Users & Roles (manage team, assign roles, assign clients), Email Config (sender, templates, delivery settings), and Audit Log (searchable, filterable by user/entity/action/date).

## Phase
Phase 3 — Consumers (UI, Terminal, Integration)

## Dependencies
- **Blocked by**: 23 (UI scaffolding), 24 (UI auth flow), 22 (api-client)
- **Blocks**: None (leaf feature)

## Source PRDs
- `ui-prd.md` — Screen 9: Admin/Settings

## Relevant PRD Extracts

### Screen 9: Admin / Settings (ui-prd.md)

**Route:** `/settings`

System-level configuration. Admin and account manager access.

**Tabs:**
- **Asana Workspaces** — Add, remove, test connections to Asana workspaces.
- **Users & Roles** — Manage team members, assign roles, assign client access.
- **Email Config** — Default sender, email templates, delivery settings.
- **Audit Log** — Searchable log of all system actions. Filterable by user, entity, action type, date range.

### Permission Model (api-prd.md)

| Role | Capabilities |
|---|---|
| **Admin** | Everything. Manage workspaces, users, and system config. |
| **Account Manager** | Full CRUD on assigned clients. Cannot manage system config. |
| **Team Member** | Read access to assigned clients. Cannot access admin settings. |

### Asana Workspace Endpoints (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/asana/workspaces` | GET | List configured Asana workspaces |
| `/asana/workspaces` | POST | Add a new Asana workspace connection |
| `/asana/workspaces/{id}` | DELETE | Remove a workspace connection |

### Audit Log Endpoint (api-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/audit` | GET | Query audit log (filterable by `entity_type`, `entity_id`, `user_id`, `date_range`) |

### Audit Log Schema (from database)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to Users (nullable for agent actions) |
| `action` | VARCHAR | e.g., `task.created`, `task.approved`, `agenda.shared` |
| `entity_type` | VARCHAR | `task`, `agenda`, `transcript`, `client` |
| `entity_id` | UUID | FK to the relevant entity |
| `metadata` | JSONB | Additional context |
| `source` | ENUM | `agent`, `ui`, `terminal` |
| `created_at` | TIMESTAMP | |

### User Management (auth-prd.md)

The auth service handles user identity. The product API handles product-level roles and client assignments:

| Auth Service Knows | Product API Knows |
|---|---|
| User identity (email, name, picture) | Product role (admin, account_manager, team_member) |
| IdP provider | Assigned clients |
| Active/inactive status | Business permissions |

### Product User Schema

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `auth_user_id` | UUID | FK to Auth service's user `sub` claim |
| `email` | VARCHAR | Denormalized from auth |
| `name` | VARCHAR | Denormalized from auth |
| `role` | ENUM | `admin`, `account_manager`, `team_member` |

### Auth Admin Endpoints (auth-prd.md)

| Endpoint | Method | Description |
|---|---|---|
| `/admin/users` | GET | List all users |
| `/admin/users/{id}` | GET | Get user details |
| `/admin/users/{id}/deactivate` | POST | Deactivate a user across all apps |
| `/admin/users/{id}/sessions` | DELETE | Revoke all active sessions |

## Scope

### In Scope
- Admin/settings page at route `/settings` within DashboardLayout
- Access restricted to Admin role (and partially to Account Manager for read-only views)
- Tab navigation with four tabs:
  - **Asana Workspaces tab:**
    - List configured workspaces (`GET /asana/workspaces`)
    - Add new workspace form (name, credentials) via `POST /asana/workspaces`
    - Remove workspace button via `DELETE /asana/workspaces/{id}`
    - Test connection button (verify Asana API access)
  - **Users & Roles tab:**
    - List team members with current role and assigned clients
    - Edit role assignment (dropdown: admin, account_manager, team_member)
    - Assign/unassign clients to users
    - Deactivate user
  - **Email Config tab:**
    - Default sender address configuration
    - Email template management (view/edit templates for agenda distribution)
    - Delivery settings (provider config)
  - **Audit Log tab:**
    - Searchable, paginated audit log table
    - Filters:
      - User (dropdown)
      - Entity type (task, agenda, transcript, client)
      - Action type (e.g., task.approved, agenda.shared)
      - Date range picker
    - Each row shows: timestamp, user, action, entity type, entity reference, source (agent/ui/terminal)
- Loading, empty, and error states per tab

### Out of Scope
- Auth service administration (OIDC client management, session management) — that is the auth admin interface in feature 05
- Asana adapter implementation (feature 12)
- Email adapter implementation (feature 16)
- System monitoring / infrastructure health
- Billing or subscription management

## Key Decisions
- The Admin/Settings screen is restricted to the **Admin** role for write operations. Account Managers may have read access to certain tabs (e.g., Audit Log) but cannot modify system configuration.
- User management in this screen handles **product-level** roles and client assignments. It does not manage auth-level identity (that is the auth service's domain). Users are created in the auth system when they first log in via IdP; the admin screen assigns their product role and client access.
- The Audit Log tab provides a filterable, searchable view of the same audit data that feeds the dashboard's recent activity feed. The admin view adds more filter options (by user, entity type, action type, date range).
- The "test connection" feature for Asana Workspaces verifies that the stored credentials can access the Asana API. This is a convenience feature for the admin to validate configuration.
- Email config management depends on which email provider is chosen (SendGrid, Resend, or Google Workspace — open question in PRD). The UI should abstract the provider-specific settings behind a general configuration interface.
