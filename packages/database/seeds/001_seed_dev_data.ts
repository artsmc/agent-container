/**
 * Development Seed Data
 *
 * Seeds the product database with minimal data for local development.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 *
 * WARNING: This script is for local development and CI test environments ONLY.
 * Never run against staging or production databases.
 *
 * Usage:
 *   pnpm --filter @iexcel/database seed
 *   # or
 *   tsx seeds/001_seed_dev_data.ts
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// Fixed UUIDs for deterministic seed data (safe for dev only)
const ADMIN_USER_ID = 'a0000000-0000-4000-8000-000000000001';
const ADMIN_AUTH_USER_ID = 'b0000000-0000-4000-8000-000000000001';
const ACCOUNT_MANAGER_USER_ID = 'a0000000-0000-4000-8000-000000000002';
const ACCOUNT_MANAGER_AUTH_USER_ID = 'b0000000-0000-4000-8000-000000000002';
const CLIENT_TOTAL_LIFE_ID = 'c0000000-0000-4000-8000-000000000001';

async function seed(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  // Safety check: refuse to run against production
  const dbUrl = process.env['DATABASE_URL'].toLowerCase();
  if (dbUrl.includes('production') || dbUrl.includes('prod.')) {
    console.error('REFUSING to seed: DATABASE_URL appears to point to a production database.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    max: 1,
  });

  try {
    console.log('Seeding development data...');

    // Seed admin user
    await pool.query(`
      INSERT INTO users (id, auth_user_id, email, name, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      ADMIN_USER_ID,
      ADMIN_AUTH_USER_ID,
      'admin@iexcel.dev',
      'Admin User',
      'admin',
      true,
    ]);
    console.log('  - Admin user created (or already exists)');

    // Seed account manager user
    await pool.query(`
      INSERT INTO users (id, auth_user_id, email, name, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      ACCOUNT_MANAGER_USER_ID,
      ACCOUNT_MANAGER_AUTH_USER_ID,
      'manager@iexcel.dev',
      'Account Manager',
      'account_manager',
      true,
    ]);
    console.log('  - Account manager user created (or already exists)');

    // Seed Total Life client
    await pool.query(`
      INSERT INTO clients (id, name, grain_playlist_id, default_asana_workspace_id, default_asana_project_id, email_recipients)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `, [
      CLIENT_TOTAL_LIFE_ID,
      'Total Life',
      null,
      null,
      null,
      JSON.stringify([]),
    ]);
    console.log('  - Client "Total Life" created (or already exists)');

    // Link admin to Total Life client
    await pool.query(`
      INSERT INTO client_users (client_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT ON CONSTRAINT uq_client_users_client_user DO NOTHING
    `, [
      CLIENT_TOTAL_LIFE_ID,
      ADMIN_USER_ID,
      'lead',
    ]);
    console.log('  - Admin linked to Total Life (or already linked)');

    // Link account manager to Total Life client
    await pool.query(`
      INSERT INTO client_users (client_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT ON CONSTRAINT uq_client_users_client_user DO NOTHING
    `, [
      CLIENT_TOTAL_LIFE_ID,
      ACCOUNT_MANAGER_USER_ID,
      'member',
    ]);
    console.log('  - Account manager linked to Total Life (or already linked)');

    console.log('Seed data applied successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
