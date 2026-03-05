import { loadConfig } from './config/index';
import { createDbClient } from './db/client';
import { checkDatabaseHealth } from './db/health';
import { createTokenValidator } from '@iexcel/auth-client';
import { createApp } from './app';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Load and validate configuration
  // -------------------------------------------------------------------------
  const config = loadConfig();

  // -------------------------------------------------------------------------
  // 2. Initialise database client
  // -------------------------------------------------------------------------
  const db = createDbClient(config.DATABASE_URL);

  // -------------------------------------------------------------------------
  // 3. Verify database connectivity (fail fast on startup)
  // -------------------------------------------------------------------------
  const dbHealth = await checkDatabaseHealth(db);
  if (dbHealth.status !== 'ok') {
    console.error(
      `Database health check failed: ${dbHealth.message ?? 'unknown error'}`
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // 4. Create token validator
  // -------------------------------------------------------------------------
  const tokenValidator = createTokenValidator({
    issuerUrl: config.AUTH_ISSUER_URL,
    audience: config.AUTH_AUDIENCE,
  });

  // -------------------------------------------------------------------------
  // 5. Build and start Fastify app
  // -------------------------------------------------------------------------
  const app = await createApp({ db, tokenValidator, config });

  await app.listen({ port: config.PORT, host: config.HOST });

  app.log.info(
    `API server listening on ${config.HOST}:${config.PORT} [${config.NODE_ENV}]`
  );

  // -------------------------------------------------------------------------
  // 6. Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, starting graceful shutdown...`);

    // Force-exit timer in case graceful shutdown hangs
    const forceExitTimer = setTimeout(() => {
      app.log.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    // Prevent the timer from keeping the process alive if shutdown completes
    forceExitTimer.unref();

    try {
      await app.close();
      app.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
