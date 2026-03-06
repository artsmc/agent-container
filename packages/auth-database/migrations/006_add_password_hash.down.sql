-- Remove password_hash and role columns from users table
ALTER TABLE users
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS password_hash;
