-- Migration 002: Create oidc_clients table
-- Depends on: Migration 001 (set_updated_at() trigger function)

CREATE TABLE oidc_clients (
  id                      UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id               VARCHAR(255)  NOT NULL,
  client_name             VARCHAR(255)  NOT NULL,
  client_secret_hash      VARCHAR(255)      NULL,
  client_type             VARCHAR(20)   NOT NULL
                            CHECK (client_type IN ('public', 'confidential')),
  grant_types             JSONB         NOT NULL DEFAULT '[]',
  redirect_uris           JSONB         NOT NULL DEFAULT '[]',
  scopes                  JSONB         NOT NULL DEFAULT '[]',
  token_lifetime          INTEGER       NOT NULL DEFAULT 3600
                            CHECK (token_lifetime > 0),
  refresh_token_lifetime  INTEGER       NOT NULL DEFAULT 2592000
                            CHECK (refresh_token_lifetime > 0),
  is_active               BOOLEAN       NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT oidc_clients_client_id_unique UNIQUE (client_id)
);

CREATE TRIGGER oidc_clients_set_updated_at
  BEFORE UPDATE ON oidc_clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
