import { z } from 'zod';

/**
 * Zod schema for validating environment variables.
 * All values are read as strings from process.env and coerced
 * to the appropriate types.
 */
const envSchema = z.object({
  /** PostgreSQL connection string. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** OIDC issuer URL for token validation. */
  AUTH_ISSUER_URL: z.string().url('AUTH_ISSUER_URL must be a valid URL'),

  /** Expected JWT audience claim. */
  AUTH_AUDIENCE: z.string().default('iexcel-api'),

  /** HTTP server port. */
  PORT: z.coerce.number().int().positive().default(8080),

  /** HTTP server bind address. */
  HOST: z.string().default('0.0.0.0'),

  /** Runtime environment. */
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  /** Pino log level. */
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  /** Comma-separated CORS origins or '*' for all. */
  CORS_ORIGINS: z.string().default('*'),

  /** Base URL for constructing share links (e.g., "https://app.example.com"). */
  APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL').optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
export function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${formatted}`
    );
  }

  return result.data;
}
