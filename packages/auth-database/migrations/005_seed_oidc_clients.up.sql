-- Migration 005: Seed pre-registered OIDC clients
-- Idempotent: ON CONFLICT (client_id) DO NOTHING ensures re-running is safe.

INSERT INTO oidc_clients (
  client_id,
  client_name,
  client_type,
  grant_types,
  redirect_uris,
  scopes,
  token_lifetime,
  refresh_token_lifetime,
  client_secret_hash,
  is_active
)
VALUES
  (
    'iexcel-ui',
    'iExcel Web UI',
    'public',
    '["authorization_code","refresh_token"]',
    '[]',
    '["openid","profile","email"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'iexcel-terminal',
    'iExcel Terminal',
    'public',
    '["device_code","refresh_token"]',
    '[]',
    '["openid","profile","email"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'mastra-agent',
    'Mastra Agent',
    'confidential',
    '["client_credentials"]',
    '[]',
    '["openid"]',
    3600,
    2592000,
    NULL,
    true
  ),
  (
    'iexcel-api',
    'iExcel API',
    'public',
    '[]',
    '[]',
    '["openid"]',
    3600,
    2592000,
    NULL,
    true
  )
ON CONFLICT (client_id) DO NOTHING;
