-- Seed the default admin user for local authentication.
-- Password: changeme (argon2id hash)
-- This seed is idempotent — it will not overwrite an existing user with the same email.
INSERT INTO users (
  idp_subject,
  idp_provider,
  email,
  name,
  password_hash,
  role,
  is_active
) VALUES (
  gen_random_uuid()::text,
  'local',
  'admin@iexcel.com',
  'Admin',
  '$argon2id$v=19$m=65536,t=3,p=4$DfrerOkr30BUWmPCkEcALg$9s2aU0i/XA+5K21iceYn+B2m03BV7UWzaUwihPe0l6s',
  'admin',
  true
) ON CONFLICT (email) DO NOTHING;
