-- Migration 003: Create refresh_tokens table
-- Depends on: Migration 001 (users table for FK reference)

CREATE TABLE refresh_tokens (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID          NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
  client_id   VARCHAR(255)  NOT NULL,
  token_hash  VARCHAR(255)  NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL,
  revoked_at  TIMESTAMPTZ       NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_expires_at ON refresh_tokens (expires_at);
