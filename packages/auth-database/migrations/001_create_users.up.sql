-- Migration 001: Create users table
-- Prerequisite: PostgreSQL 13+ (for built-in gen_random_uuid())

-- Enable pgcrypto if not already enabled (safety measure for PG < 13).
-- On PG 13+, gen_random_uuid() is built-in; this is a no-op.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger function for auto-updating updated_at columns.
-- Used by: users, oidc_clients.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idp_subject     VARCHAR(255)  NOT NULL,
  idp_provider    VARCHAR(100)  NOT NULL,
  email           VARCHAR(255)  NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  picture         VARCHAR(2048)     NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ       NULL,

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_idp_unique   UNIQUE (idp_subject, idp_provider)
);

CREATE INDEX users_idp_subject_provider
  ON users (idp_subject, idp_provider);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
