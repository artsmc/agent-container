-- Rollback Migration 003: Drop refresh_tokens table.

DROP TABLE IF EXISTS refresh_tokens CASCADE;
