-- Rollback Migration 001: Drop users table and supporting objects.
-- Order matters: drop trigger before table, drop function last.

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
