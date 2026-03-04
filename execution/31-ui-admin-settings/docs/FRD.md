# FRD — Feature Requirement Document
## Feature 31: UI Admin / Settings

**Version:** 1.0
**Date:** 2026-03-03
**Phase:** Phase 3 — Consumers (UI, Terminal, Integration)
**Route:** `/settings`

---

## 1. Business Objectives

### 1.1 Primary Objective

Provide system administrators with a centralized configuration screen to manage all iExcel system-level settings: Asana workspace connections, user roles and client assignments, email configuration, and a comprehensive audit log — all from a single, organized interface.

### 1.2 Business Value

| Value Driver | Description |
|---|---|
| Operational control | Admins can manage the full system configuration without requiring developer involvement or direct database access |
| User governance | Roles and client assignments are managed in one place, ensuring account managers only see their assigned clients |
| Integration health | Asana workspace connections can be added, tested, and removed without deployment — configuration lives in the application |
| Accountability | The audit log provides a complete record of all system actions across agents, UI, and terminal interfaces — critical for diagnosing issues and meeting compliance requirements |
| Email system control | Template and delivery configuration can be adjusted without code changes |

### 1.3 Strategic Context

The Admin/Settings screen is the operational backbone of the iExcel system. It enables the initial setup (adding Asana workspaces, creating user assignments) that all other features depend on. Without workspace configuration, tasks cannot be pushed to Asana. Without user role assignments, account managers cannot be scoped to their clients.

This screen also provides post-incident investigation capability via the Audit Log — the ability to trace any system action back to its source (agent, UI, or terminal) and actor (user or automated process) is essential as the system scales.

---

## 2. Target Users

### 2.1 Primary User: Admin

| Attribute | Detail |
|---|---|
| Who | System administrator — likely a technical lead or iExcel operations manager |
| Access level | Full access to all four tabs with read and write permissions |
| Primary actions | Add/remove Asana workspaces, manage user roles, configure email, query audit log |
| Device | Desktop browser |
| Frequency | Regular but not daily — configuration changes, onboarding new users, investigating incidents |

### 2.2 Secondary User: Account Manager (Limited Read Access)

Account managers may have read-only access to the Audit Log tab to review actions relevant to their clients. They cannot access the other three tabs (Asana Workspaces, Users & Roles, Email Config).

**Access summary:**

| Tab | Admin | Account Manager | Team Member |
|---|---|---|---|
| Asana Workspaces | Full CRUD | No access | No access |
| Users & Roles | Full CRUD | No access | No access |
| Email Config | Full CRUD | No access | No access |
| Audit Log | Full read | Read (filtered to their clients) | No access |

---

## 3. Use Cases

### UC-01: Add Asana Workspace Connection

**Actor:** Admin
**Trigger:** iExcel begins working with a new Asana workspace or the credentials for an existing workspace expire
**Outcome:** New workspace is connected, tested, and available for task routing

### UC-02: Test Existing Asana Connection

**Actor:** Admin
**Trigger:** Account manager reports tasks failing to push to Asana — admin wants to verify the connection
**Outcome:** Test result confirms whether the stored credentials have valid Asana API access

### UC-03: Remove Asana Workspace

**Actor:** Admin
**Trigger:** A client moves to a different Asana workspace or terminates service
**Outcome:** Workspace connection is removed from the system

### UC-04: Assign User Role

**Actor:** Admin
**Trigger:** New team member logs in for the first time — their product role must be set
**Outcome:** User's role is set to `account_manager` or `team_member` and they can access appropriate features

### UC-05: Assign Client Access to Account Manager

**Actor:** Admin
**Trigger:** Account manager is assigned a new client
**Outcome:** Account manager's client assignments are updated; they can now see and manage that client

### UC-06: Deactivate User

**Actor:** Admin
**Trigger:** Team member leaves the company or access needs to be revoked
**Outcome:** User is deactivated and can no longer access the system

### UC-07: Configure Email Settings

**Actor:** Admin
**Trigger:** Email delivery provider changes or default sender needs updating
**Outcome:** Email configuration is saved and new settings take effect for future sends

### UC-08: Query Audit Log

**Actor:** Admin (or Account Manager)
**Trigger:** Investigating why a specific action occurred, or preparing a compliance report
**Outcome:** Filtered, paginated list of audit events matching the search criteria

---

## 4. Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Workspace connection test speed | < 5 seconds response | Asana API call timing |
| Audit log query performance | < 1 second for filtered results (up to 1000 records) | API response time monitoring |
| Role assignment accuracy | Zero reported access control errors post-assignment | Support ticket review |
| Email config save reliability | 100% of valid saves persist | Database record verification |

---

## 5. Business Constraints

### 5.1 Admin-Only Write Access

All create, update, and delete operations across all tabs are restricted to the **Admin** role. Account Managers may have read access to the Audit Log only. Team Members have no access to the settings page.

### 5.2 Product-Level vs. Auth-Level User Management

The Users & Roles tab manages **product-level** attributes only:
- Product role (`admin`, `account_manager`, `team_member`)
- Client assignments

It does not manage auth-service attributes (passwords, IdP connections, session management). Users are created in the auth system when they first log in via SSO. The settings page assigns their product role after their first login.

### 5.3 Email Provider Abstraction

The Email Config tab must present a provider-agnostic interface. The underlying email provider (SendGrid, Resend, or Google Workspace — open question in PRD) should not be exposed in the UI design. The configuration form abstracts provider-specific settings behind general fields (sender address, template management, delivery settings).

### 5.4 Asana Workspace Credentials Security

Asana workspace credentials (API tokens) must not be displayed in the UI after initial entry. The stored credential is opaque — the admin can only test it, replace it, or delete it. Never display it.

### 5.5 Audit Log is Read-Only

The Audit Log tab is a read-only view. No editing, deletion, or modification of audit records is permitted from the UI.

### 5.6 Dependencies

- Feature 23 (ui-scaffolding): `DashboardLayout.tsx` and `ui-tokens` package must exist
- Feature 24 (ui-auth-flow): Auth session and role available to enforce access control
- Feature 22 (api-client-package): All API calls go through typed `api-client`

---

## 6. Integration with Product Roadmap

This is a **Wave 6** feature. It depends on Features 25 (ui-dashboard) and 22 (api-client-package).

It is a leaf node — nothing downstream depends on it — but it is an operational prerequisite for the system to function. Asana workspace configuration (UC-01) must be completed before any task push workflow can succeed. User role assignment (UC-04) must be completed before account managers can use the system effectively.

---

## 7. Out of Scope (V1)

- Auth service administration (OIDC client management, session management) — Feature 05
- Asana adapter implementation — Feature 12
- Email adapter implementation — Feature 16
- System monitoring or infrastructure health dashboards
- Billing or subscription management
- User invitation flow (users are created via SSO on first login)
- Bulk user management (bulk role assignment, bulk deactivation)
- Audit log export (CSV, PDF)
- Workspace-level permission overrides
