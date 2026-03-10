/**
 * Migration Runner
 *
 * Applies or rolls back Drizzle ORM migrations against the product database.
 * Also applies the raw SQL triggers file after schema migrations.
 *
 * Usage:
 *   tsx src/migrate.ts          # Apply all pending migrations (up)
 *   tsx src/migrate.ts --down   # Not supported by Drizzle migrate — see README
 *   tsx src/migrate.ts --status # Show migration status
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--down')) {
    console.error(
      'Drizzle ORM does not support down migrations natively.\n' +
      'To roll back, restore from a database backup or write a manual\n' +
      'rollback SQL script. See packages/database/README.md for guidance.'
    );
    process.exit(1);
  }

  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
    max: 1,
  });

  const db = drizzle(pool);

  try {
    if (args.includes('--status')) {
      console.log('Checking migration status...');
      // Drizzle tracks migrations in __drizzle_migrations table
      const result = await pool.query(
        `SELECT * FROM __drizzle_migrations ORDER BY created_at`
      ).catch(() => {
        console.log('No migrations have been applied yet (migrations table does not exist).');
        return null;
      });

      if (result && result.rows.length > 0) {
        console.log(`Applied migrations (${result.rows.length}):`);
        for (const row of result.rows) {
          console.log(`  - ${row.hash} (applied at: ${row.created_at})`);
        }
      } else if (result) {
        console.log('No migrations have been applied yet.');
      }
    } else {
      // Run Drizzle schema migrations
      const migrationsFolder = path.resolve(__dirname, '../migrations');
      console.log(`Running migrations from: ${migrationsFolder}`);
      await migrate(db, { migrationsFolder });
      console.log('Schema migrations applied successfully.');

      // Apply raw SQL triggers
      const triggersPath = path.resolve(__dirname, 'triggers.sql');
      if (fs.existsSync(triggersPath)) {
        console.log('Applying triggers...');
        const triggersSql = fs.readFileSync(triggersPath, 'utf-8');
        await pool.query(triggersSql);
        console.log('Triggers applied successfully.');
      }

      console.log('All migrations complete.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
