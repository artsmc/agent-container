/**
 * Environment configuration for the Mastra runtime.
 *
 * Validates all required environment variables at startup and injects the
 * appropriate API key into the process environment so that @mastra/core
 * provider auto-detection works correctly.
 */
import { z } from 'zod';

const envSchema = z.object({
  // External API dependencies
  API_BASE_URL: z.string().url('API_BASE_URL must be a valid URL'),
  AUTH_ISSUER_URL: z.string().url('AUTH_ISSUER_URL must be a valid URL'),

  // Mastra service identity
  MASTRA_CLIENT_ID: z.string().min(1, 'MASTRA_CLIENT_ID is required'),
  MASTRA_CLIENT_SECRET: z.string().min(1, 'MASTRA_CLIENT_SECRET is required'),

  // LLM configuration
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required'),
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('anthropic'),
  LLM_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // Server configuration
  MASTRA_PORT: z.coerce.number().int().positive().default(8081),
  MASTRA_HOST: z.string().default('0.0.0.0'),

  // Runtime
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Observability (optional)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('iexcel-mastra'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Mastra environment validation failed:\n${formatted}\n\nEnsure all required variables are set in your .env file.`
    );
  }

  return result.data;
}

export const env: Env = parseEnv();

/**
 * Inject the resolved API key into the correct provider environment variable.
 * @mastra/core provider auto-detection reads OPENAI_API_KEY or ANTHROPIC_API_KEY
 * from the process environment.
 */
if (env.LLM_PROVIDER === 'openai') {
  process.env['OPENAI_API_KEY'] = env.LLM_API_KEY;
} else {
  process.env['ANTHROPIC_API_KEY'] = env.LLM_API_KEY;
}
