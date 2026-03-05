import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import type { TokenValidator } from '@iexcel/auth-client';
import type { EnvConfig } from './config/env';
import type { DbClient } from './db/client';
import { buildAuthMiddleware } from './middleware/authenticate';
import { buildUserLoader } from './middleware/load-user';
import { errorHandler } from './middleware/error-handler';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { clientRoutes } from './routes/clients';
import { transcriptRoutes } from './routes/transcripts/index';
import { taskRoutes } from './routes/tasks';
import { importRoutes } from './routes/import';
import { NotFoundError } from './errors/api-errors';
import { AsanaOutputAdapter } from './adapters/asana';
import { setOutputNormalizer } from './services/output-normalizer';

export interface AppDependencies {
  db: DbClient;
  tokenValidator: TokenValidator;
  config: EnvConfig;
}

/**
 * Creates and configures the Fastify application.
 *
 * This factory is the central composition root. It wires together:
 * - Global plugins (CORS, Helmet)
 * - Public routes (health check)
 * - Protected route scope with auth + user-loading hooks
 * - Global error handler and 404 fallback
 *
 * Downstream features (08-16) register additional route plugins
 * on the returned instance.
 */
export async function createApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { db, tokenValidator, config } = deps;

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    // Disable Fastify's built-in request id header for cleaner logs
    disableRequestLogging: false,
  });

  // ---------------------------------------------------------------------------
  // Global plugins
  // ---------------------------------------------------------------------------

  const corsOrigins =
    config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((o) => o.trim());

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  await app.register(helmet, {
    // Allow JSON content to be returned in all contexts
    contentSecurityPolicy: false,
  });

  // Multipart support for file uploads (transcript .txt files, max 5 MB)
  await app.register(multipart, {
    limits: {
      fileSize: 5_242_880, // 5 MB
      files: 1,
    },
  });

  // ---------------------------------------------------------------------------
  // Global error handler
  // ---------------------------------------------------------------------------

  app.setErrorHandler(errorHandler);

  // ---------------------------------------------------------------------------
  // Output Normalizer — Asana adapter (Feature 12)
  // ---------------------------------------------------------------------------

  const asanaAdapter = new AsanaOutputAdapter(db);
  setOutputNormalizer(asanaAdapter);

  // ---------------------------------------------------------------------------
  // Public routes
  // ---------------------------------------------------------------------------

  await app.register(healthRoutes, { db });

  // ---------------------------------------------------------------------------
  // Protected route scope
  // ---------------------------------------------------------------------------

  const authenticate = buildAuthMiddleware(tokenValidator);
  const loadUser = buildUserLoader(db);

  await app.register(
    async function protectedRoutes(scope) {
      // Add auth hooks to every route in this scope
      scope.addHook('preHandler', authenticate);
      scope.addHook('preHandler', loadUser);

      // Register protected routes
      await scope.register(meRoutes);
      await scope.register(clientRoutes, { db });
      await scope.register(transcriptRoutes, { db });
      await scope.register(taskRoutes, { db });
      await scope.register(importRoutes, { db });

      // -----------------------------------------------------------------------
      // Downstream features will register additional route plugins
      // within this protected scope. Example:
      //
      //   await scope.register(agendaRoutes, { db });
      // -----------------------------------------------------------------------
    }
  );

  // ---------------------------------------------------------------------------
  // 404 fallback
  // ---------------------------------------------------------------------------

  app.setNotFoundHandler((_request, reply) => {
    const error = new NotFoundError('Route not found');
    void reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  });

  return app;
}
