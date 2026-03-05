import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../db/client';
import { checkDatabaseHealth } from '../db/health';

interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string | undefined;
  checks: {
    database: 'ok' | 'error';
  };
}

/**
 * Registers the health-check route.
 *
 * GET /health — unauthenticated. Returns overall system status and
 * individual subsystem checks.
 *
 * - 200 when all checks pass
 * - 503 when any check fails
 */
export async function healthRoutes(
  fastify: FastifyInstance,
  opts: { db: DbClient }
): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    const dbResult = await checkDatabaseHealth(opts.db);
    const allHealthy = dbResult.status === 'ok';

    const body: HealthCheckResponse = {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'],
      checks: {
        database: dbResult.status,
      },
    };

    const statusCode = allHealthy ? 200 : 503;
    void reply.status(statusCode).send(body);
  });
}
