-- Rollback Migration 002: Drop oidc_clients table.
-- Drop trigger before table.

DROP TRIGGER IF EXISTS oidc_clients_set_updated_at ON oidc_clients;
DROP TABLE IF EXISTS oidc_clients CASCADE;
