-- Rollback Migration 005: Remove seeded OIDC clients.
-- Only deletes the four pre-registered clients; any manually added clients are preserved.

DELETE FROM oidc_clients
WHERE client_id IN ('iexcel-ui', 'iexcel-terminal', 'mastra-agent', 'iexcel-api');
