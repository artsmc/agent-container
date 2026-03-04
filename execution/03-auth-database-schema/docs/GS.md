# GS — Gherkin Specification
# Feature 03: Auth Database Schema

## Feature: Auth Database Schema Migrations

  As the iExcel authentication system
  I need a correctly structured and seeded identity database
  So that user identities, OIDC clients, refresh tokens, and sessions
  can be persisted and queried reliably

---

## Background

  Given a running PostgreSQL instance (version 13 or higher)
  And the `packages/auth-database/` package exists in the monorepo
  And golang-migrate is available in the execution environment
  And the environment variable `DATABASE_URL` points to an empty auth database

---

## Feature: Users Table

  ### Scenario: Apply the users migration to a clean database
    Given the database has no tables
    When migration 001_create_users.up.sql is applied
    Then a table named `users` exists
    And the table has columns: id, idp_subject, idp_provider, email, name, picture, is_active, created_at, updated_at, last_login_at
    And `id` is of type UUID with a default of gen_random_uuid()
    And `email` has a UNIQUE constraint
    And `is_active` defaults to true
    And `created_at` defaults to NOW()
    And `updated_at` defaults to NOW()
    And `picture` is nullable
    And `last_login_at` is nullable

  ### Scenario: Users migration enforces email uniqueness
    Given the users table exists
    And a user row exists with email "mark@iexcel.com"
    When a second INSERT is attempted with email "mark@iexcel.com"
    Then a unique constraint violation error is raised
    And no second row is inserted

  ### Scenario: Roll back the users migration
    Given migration 001 has been applied
    When migration 001_create_users.down.sql is applied
    Then the `users` table no longer exists
    And the database schema is identical to its state before migration 001

  ### Scenario: Inserting a valid user record
    Given the users table exists
    When a row is inserted with:
      | idp_subject  | "google-oauth2|12345"  |
      | idp_provider | "google"               |
      | email        | "alice@iexcel.com"     |
      | name         | "Alice"                |
      | picture      | NULL                   |
    Then the row is stored successfully
    And `id` is auto-generated as a UUID
    And `is_active` is true
    And `created_at` is approximately NOW()
    And `updated_at` is approximately NOW()
    And `last_login_at` is NULL

  ### Scenario: Deactivating a user does not delete them
    Given a user exists with id "uuid-alice" and is_active = true
    When `UPDATE users SET is_active = false WHERE id = 'uuid-alice'` is executed
    Then the row still exists in the users table
    And is_active is false
    And id remains "uuid-alice"

---

## Feature: OIDC Clients Table

  ### Scenario: Apply the OIDC clients migration
    Given migration 001 (users) has been applied
    When migration 002_create_oidc_clients.up.sql is applied
    Then a table named `oidc_clients` exists
    And the table has columns: id, client_id, client_name, client_secret_hash, client_type, grant_types, redirect_uris, scopes, token_lifetime, refresh_token_lifetime, is_active, created_at, updated_at
    And `client_id` has a UNIQUE constraint
    And `client_secret_hash` is nullable
    And `client_type` only accepts the values 'public' or 'confidential'
    And `token_lifetime` defaults to 3600
    And `refresh_token_lifetime` defaults to 2592000
    And `is_active` defaults to true

  ### Scenario: OIDC client type constraint rejects invalid values
    Given the oidc_clients table exists
    When an INSERT is attempted with client_type = 'internal'
    Then a check constraint violation error is raised
    And no row is inserted

  ### Scenario: Public client has no client_secret_hash
    Given the oidc_clients table exists
    When a public client is inserted with client_secret_hash = NULL
    Then the row is stored successfully
    And client_secret_hash is NULL

  ### Scenario: Confidential client stores a hashed secret
    Given the oidc_clients table exists
    When a confidential client is inserted with client_secret_hash = "bcrypt_hash_string"
    Then the row is stored successfully
    And client_secret_hash equals "bcrypt_hash_string"

  ### Scenario: Roll back the OIDC clients migration
    Given migrations 001 and 002 have been applied
    When migration 002_create_oidc_clients.down.sql is applied
    Then the `oidc_clients` table no longer exists
    And the `users` table still exists

---

## Feature: Refresh Tokens Table

  ### Scenario: Apply the refresh tokens migration
    Given migrations 001 and 002 have been applied
    When migration 003_create_refresh_tokens.up.sql is applied
    Then a table named `refresh_tokens` exists
    And the table has columns: id, user_id, client_id, token_hash, expires_at, revoked_at, created_at
    And `user_id` is a foreign key referencing users(id) with ON DELETE CASCADE
    And `token_hash` has a UNIQUE constraint
    And `revoked_at` is nullable

  ### Scenario: Refresh token foreign key enforces referential integrity
    Given the refresh_tokens table exists
    And no user exists with id "uuid-nonexistent"
    When an INSERT into refresh_tokens is attempted with user_id = "uuid-nonexistent"
    Then a foreign key constraint violation error is raised
    And no row is inserted

  ### Scenario: Cascading delete removes tokens when user is deleted
    Given a user exists with id "uuid-bob"
    And two refresh token rows exist with user_id = "uuid-bob"
    When the user row with id "uuid-bob" is deleted
    Then both refresh token rows are also deleted
    And the refresh_tokens table contains no rows with user_id = "uuid-bob"

  ### Scenario: Soft-revoking a refresh token
    Given a refresh token exists with id "uuid-token-1" and revoked_at = NULL
    When `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = 'uuid-token-1'` is executed
    Then the row still exists
    And revoked_at is not NULL

  ### Scenario: Roll back the refresh tokens migration
    Given migrations 001, 002, and 003 have been applied
    When migration 003_create_refresh_tokens.down.sql is applied
    Then the `refresh_tokens` table no longer exists
    And the `users` and `oidc_clients` tables still exist

---

## Feature: Sessions Table

  ### Scenario: Apply the sessions migration
    Given migrations 001, 002, and 003 have been applied
    When migration 004_create_sessions.up.sql is applied
    Then a table named `sessions` exists
    And the table has columns: id, user_id, idp_session_id, expires_at, created_at
    And `user_id` is a foreign key referencing users(id) with ON DELETE CASCADE
    And `idp_session_id` is nullable

  ### Scenario: Session without IdP session ID is valid
    Given the sessions table exists and a user exists
    When a session row is inserted with idp_session_id = NULL
    Then the row is stored successfully

  ### Scenario: Session with IdP session ID is valid
    Given the sessions table exists and a user exists
    When a session row is inserted with idp_session_id = "idp-session-abc123"
    Then the row is stored successfully

  ### Scenario: Cascading delete removes sessions when user is deleted
    Given a user exists with id "uuid-carol"
    And three session rows exist with user_id = "uuid-carol"
    When the user row with id "uuid-carol" is deleted
    Then all three session rows are also deleted

  ### Scenario: Roll back the sessions migration
    Given all four table migrations have been applied
    When migration 004_create_sessions.down.sql is applied
    Then the `sessions` table no longer exists
    And the `users`, `oidc_clients`, and `refresh_tokens` tables still exist

---

## Feature: Seed Data — Pre-Registered OIDC Clients

  ### Scenario: Seed inserts the four required OIDC clients
    Given all four table migrations have been applied
    And the oidc_clients table is empty
    When migration 005_seed_oidc_clients.sql is applied
    Then the oidc_clients table contains exactly 4 rows
    And a row exists with client_id = "iexcel-ui"
    And a row exists with client_id = "iexcel-terminal"
    And a row exists with client_id = "mastra-agent"
    And a row exists with client_id = "iexcel-api"

  ### Scenario: iexcel-ui is a public client with authorization_code and refresh_token grants
    Given the seed has been applied
    When the row with client_id = "iexcel-ui" is queried
    Then client_type = "public"
    And grant_types contains "authorization_code"
    And grant_types contains "refresh_token"
    And client_secret_hash IS NULL

  ### Scenario: iexcel-terminal is a public client with device_code grant
    Given the seed has been applied
    When the row with client_id = "iexcel-terminal" is queried
    Then client_type = "public"
    And grant_types contains "device_code"
    And grant_types contains "refresh_token"
    And client_secret_hash IS NULL

  ### Scenario: mastra-agent is a confidential client with client_credentials grant
    Given the seed has been applied
    When the row with client_id = "mastra-agent" is queried
    Then client_type = "confidential"
    And grant_types contains "client_credentials"

  ### Scenario: iexcel-api is a resource server with no grant types
    Given the seed has been applied
    When the row with client_id = "iexcel-api" is queried
    Then grant_types is an empty JSON array
    And client_secret_hash IS NULL

  ### Scenario: Seed is idempotent — running it twice does not error
    Given all four table migrations have been applied
    And the seed has already been applied once
    When migration 005_seed_oidc_clients.sql is applied a second time
    Then no error is raised
    And the oidc_clients table still contains exactly 4 rows (no duplicates)

---

## Feature: Full Migration Stack

  ### Scenario: Applying all migrations to a clean database succeeds
    Given an empty Postgres database
    When all migrations (001 through 005) are applied in order
    Then all four tables exist: users, oidc_clients, refresh_tokens, sessions
    And the schema_migrations table records 5 applied migrations
    And no errors are raised

  ### Scenario: Full rollback from a clean state
    Given all migrations have been applied
    When all down migrations are applied in reverse order (004, 003, 002, 001)
    Then no tables exist (except schema_migrations)
    And the database schema is equivalent to a clean state

  ### Scenario: Partial rollback and re-apply
    Given all migrations have been applied
    When migration 003 down is applied (rolling back refresh_tokens)
    And migration 003 up is applied again
    Then the refresh_tokens table exists with the correct schema
    And no data loss occurs in users or oidc_clients

---

## Feature: Index Verification

  ### Scenario: Required indexes exist after migration
    Given all migrations have been applied
    Then the following indexes exist:
      | Table          | Index Name                             | Columns               | Unique |
      | users          | users_email_unique                     | email                 | YES    |
      | users          | users_idp_subject_provider             | idp_subject, idp_provider | NO  |
      | oidc_clients   | oidc_clients_client_id_unique          | client_id             | YES    |
      | refresh_tokens | refresh_tokens_user_id                 | user_id               | NO     |
      | refresh_tokens | refresh_tokens_token_hash              | token_hash            | YES    |
      | refresh_tokens | refresh_tokens_expires_at              | expires_at            | NO     |
      | sessions       | sessions_user_id                       | user_id               | NO     |
      | sessions       | sessions_expires_at                    | expires_at            | NO     |
      | sessions       | sessions_idp_session_id                | idp_session_id        | NO     |
