/**
 * Auth Service Entry Point
 *
 * Startup sequence:
 * 1. Load and validate environment variables
 * 2. Load signing keys
 * 3. Fetch IdP discovery document
 * 4. Open Postgres connection pool
 * 5. Create Fastify app and register plugins/routes
 * 6. Start listening on PORT
 * 7. Start cleanup job
 */
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyFormbody from '@fastify/formbody';
import { loadConfig } from './config.js';
import { createPool, closePool } from './db/index.js';
import { initSigningKeys } from './signing-keys.js';
import { fetchIdpDiscovery, initIdpService } from './services/idp.js';
import { evictExpiredDeviceFlows } from './services/device.js';
import { evictExpiredAuthCodes } from './services/auth-codes.js';
import { deleteExpiredSessions } from './db/sessions.js';
import { deleteExpiredAndRevokedRefreshTokens } from './db/tokens.js';

import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Route registrations
import { registerDiscoveryRoute } from './routes/well-known/discovery.js';
import { registerJwksRoute } from './routes/well-known/jwks.js';
import { registerAuthorizeRoute } from './routes/authorize.js';
import { registerCallbackRoute } from './routes/callback.js';
import { registerTokenRoute } from './routes/token.js';
import { registerDeviceAuthorizeRoute } from './routes/device/authorize.js';
import { registerDeviceVerifyRoute } from './routes/device/verify.js';
import { registerDeviceTokenRoute } from './routes/device/token.js';
import { registerUserinfoRoute } from './routes/userinfo.js';
import { registerHealthRoute } from './routes/health.js';
import { registerAdminClientRoutes } from './routes/admin/clients.js';
import { registerAdminUserRoutes } from './routes/admin/users.js';
import { registerRegisterRoute } from './routes/register.js';
import { registerLoginRoute } from './routes/login.js';

// HTML page routes
import { registerLoginPageRoute } from './routes/pages/login.js';
import { registerRegisterPageRoute } from './routes/pages/register.js';
import { registerAdminPageRoutes } from './routes/pages/admin-clients.js';
import { registerGoogleLoginRoute } from './routes/pages/login-google.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AUDIENCE = 'iexcel-api';

async function main(): Promise<void> {
  // 1. Load and validate config
  console.log('Loading configuration...');
  const config = loadConfig();

  // 2. Load signing keys
  console.log('Loading signing keys...');
  await initSigningKeys(config.signingKeyPrivate, config.signingKeyPrivatePrevious);

  // 3. Initialize IdP service
  console.log('Initializing IdP service...');
  const callbackUrl = `${config.authIssuerUrl.replace(/\/$/, '')}/callback`;
  initIdpService({
    issuerUrl: config.idpIssuerUrl,
    clientId: config.idpClientId,
    clientSecret: config.idpClientSecret,
    callbackUrl,
  });

  // Pre-fetch IdP discovery (fail fast if unreachable)
  console.log('Fetching IdP discovery document...');
  try {
    await fetchIdpDiscovery(config.idpIssuerUrl);
    console.log('IdP discovery document fetched successfully.');
  } catch (err) {
    console.error(
      'WARNING: Could not fetch IdP discovery document:',
      err instanceof Error ? err.message : String(err)
    );
    console.error('The auth service will retry when the first authorization request is made.');
  }

  // 4. Open Postgres connection pool
  console.log('Creating database connection pool...');
  const pool = createPool(config.authDatabaseUrl);

  // Verify database connectivity
  try {
    await pool.query('SELECT 1');
    console.log('Database connection verified.');
  } catch (err) {
    console.error(
      'FATAL: Cannot connect to database:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }

  // 5. Create Fastify app
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            // Intentionally omit Authorization header from logs
          };
        },
      },
    },
    trustProxy: true,
  });

  // Register plugins
  await app.register(fastifyFormbody);

  await app.register(fastifyCookie, {
    secret: config.signingKeyPrivate.slice(0, 32), // Use part of signing key as cookie secret
  });

  await app.register(fastifyCors, {
    origin: config.corsAllowedOrigins.length > 0 ? config.corsAllowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(fastifyRateLimit, {
    global: false,
  });

  // Serve static assets (CSS) from public directory
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/static/',
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.status(error.statusCode ?? 500).send({
      error: 'server_error',
      error_description:
        config.nodeEnv === 'production'
          ? 'An unexpected error occurred.'
          : error.message,
    });
  });

  // 6. Register routes

  // OIDC well-known endpoints
  registerDiscoveryRoute(app, config.authIssuerUrl);
  registerJwksRoute(app);

  // Authorization code flow
  registerAuthorizeRoute(app, config.idpIssuerUrl);
  registerCallbackRoute(app, config.idpIssuerUrl);

  // Token endpoint with rate limiting
  registerTokenRoute(app, config.authIssuerUrl);
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url === '/token' && routeOptions.method === 'POST') {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      };
    }
  });

  // Device flow endpoints
  registerDeviceAuthorizeRoute(app, config.authIssuerUrl);
  registerDeviceVerifyRoute(app, config.idpIssuerUrl, config.authIssuerUrl);

  // Device token endpoint with rate limiting
  registerDeviceTokenRoute(app, config.authIssuerUrl);

  // Userinfo
  registerUserinfoRoute(app, config.authIssuerUrl, AUDIENCE);

  // Health check
  registerHealthRoute(app);

  // Local auth routes
  registerRegisterRoute(app);
  registerLoginRoute(app, config.authIssuerUrl);

  // Root redirect
  app.get('/', async (_request, reply) => {
    return reply.redirect('/login');
  });

  // HTML page routes (registered before admin API routes to avoid conflicts)
  registerLoginPageRoute(app);
  registerRegisterPageRoute(app);
  registerGoogleLoginRoute(app, config.idpIssuerUrl);
  registerAdminPageRoutes(app);

  // Admin endpoints
  registerAdminClientRoutes(app, config.authIssuerUrl, AUDIENCE, config.adminScope);
  registerAdminUserRoutes(app, config.authIssuerUrl, AUDIENCE, config.adminScope);

  // 7. Start cleanup job
  const cleanupInterval = setInterval(async () => {
    try {
      const expiredSessions = await deleteExpiredSessions();
      const expiredTokens = await deleteExpiredAndRevokedRefreshTokens();
      const expiredDeviceFlows = evictExpiredDeviceFlows();
      const expiredAuthCodes = evictExpiredAuthCodes();

      if (expiredSessions > 0 || expiredTokens > 0 || expiredDeviceFlows > 0 || expiredAuthCodes > 0) {
        console.log(
          `Cleanup: removed ${expiredSessions} sessions, ${expiredTokens} tokens, ` +
          `${expiredDeviceFlows} device flows, ${expiredAuthCodes} auth codes`
        );
      }
    } catch (err) {
      console.error(
        'Cleanup job error:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }, CLEANUP_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    clearInterval(cleanupInterval);
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // 8. Start listening
  try {
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Auth service listening on ${address}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
