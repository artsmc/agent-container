-- Add password_hash and role columns to users table for local authentication
ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';
