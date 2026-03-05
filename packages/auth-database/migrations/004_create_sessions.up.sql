-- Migration 004: Create sessions table
-- Depends on: Migration 001 (users table for FK reference)

CREATE TABLE sessions (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID          NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  idp_session_id  VARCHAR(255)      NULL,
  expires_at      TIMESTAMPTZ   NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id
  ON sessions (user_id);

CREATE INDEX sessions_expires_at
  ON sessions (expires_at);

-- Partial index: only index rows where idp_session_id is set.
-- Avoids indexing device flow / client credentials sessions that have no IdP session.
CREATE INDEX sessions_idp_session_id
  ON sessions (idp_session_id)
  WHERE idp_session_id IS NOT NULL;
