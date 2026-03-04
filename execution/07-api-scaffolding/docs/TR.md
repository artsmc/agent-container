# Technical Requirements
# Feature 07: API Scaffolding (`apps/api`)

**Phase:** Phase 2 — Core API & Data Pipeline
**Date:** 2026-03-03

---

## 1. Technology Stack Decisions

### 1.1 Server Framework: Fastify

**Decision: Fastify v5.x**

Rationale:
- Built-in JSON schema validation via Ajv (complemented by Zod for TypeScript types).
- 2–3x higher throughput than Express in benchmarks; better for an API that will serve Mastra agents at high call frequency.
- First-class TypeScript support with typed request/response generics.
- Plugin architecture (`fastify.register`) is cleaner than Express middleware for the route organization needed here.
- Active v5 release (2024) with Node.js 22 support.

If Express is preferred by the team, all patterns in this spec translate directly — the middleware chain order is identical; `fastify.addHook` maps to `app.use`.

### 1.2 ORM: Drizzle ORM

**Decision: Drizzle ORM + `drizzle-kit` + `postgres` driver**

Rationale:
- Feature 04 deferred this decision to Feature 07. Drizzle provides TypeScript schema inference, meaning the types in `packages/database/schema.ts` flow directly into query results without a code generation step.
- `drizzle-kit` generates SQL migrations from the schema; the canonical SQL in Feature 04's TR.md is the source of truth — Drizzle output must match it.
- `postgres` (porsager/postgres) is the chosen driver: zero-dependency, tagged template literal API, connection pool built-in.
- Alternative: if Prisma is chosen, all Drizzle-specific code in this spec maps to Prisma Client equivalents. The schema file location (`packages/database/`) does not change.

### 1.3 Validation: Zod

**Decision: Zod v3.x**

Already used in `packages/shared-types` (Feature 01). Consistent schema library across the monorepo. TypeScript inference from schemas eliminates redundant type declarations.

### 1.4 Logger: Pino

**Decision: pino v9.x + pino-pretty (dev only)**

Fastify's default logger is Pino, making this a zero-config choice. Pino serializes to JSON natively, redacts configured fields, and is the fastest Node.js logger.

### 1.5 Runtime

Node.js 22 LTS (established in Feature 00).

---

## 2. Project Identity

| Property | Value |
|---|---|
| **Nx project name** | `api` |
| **Location** | `apps/api/` |
| **Type** | Nx application (`type:app`) |
| **Tags** | `scope:api`, `type:app` |
| **Listens on** | `PORT` env var (default `3000`) |
| **Dockerfile** | `apps/api/Dockerfile` (stub from Feature 00) |

---

## 3. File Structure

```
apps/api/
├── src/
│   ├── main.ts                        # Entry point — starts server
│   ├── app.ts                         # createApp() factory
│   ├── config/
│   │   └── env.ts                     # Zod env schema + parsed config object
│   ├── middleware/
│   │   ├── authenticate.ts            # OIDC token validation middleware
│   │   ├── load-user.ts               # User profile loader + JIT provisioning
│   │   ├── validate.ts                # validate() middleware factory (Zod)
│   │   ├── rate-limit.ts              # Rate limit stub (pass-through + TODO)
│   │   └── error-handler.ts           # Global error handler
│   ├── errors/
│   │   └── api-errors.ts              # ApiError class hierarchy
│   ├── db/
│   │   ├── client.ts                  # Drizzle client singleton + pool setup
│   │   └── health.ts                  # Database health check query
│   ├── routes/
│   │   ├── health.ts                  # GET /health
│   │   └── me.ts                      # GET /me
│   ├── helpers/
│   │   └── response.ts                # sendSuccess(), sendPaginated()
│   └── types/
│       └── request.d.ts               # Augment FastifyRequest with req.user, req.tokenClaims
├── test/
│   ├── setup.ts                       # Test setup: mock JWKS, test DB, app instance
│   ├── health.test.ts
│   ├── auth.test.ts                   # Token validation scenarios
│   ├── me.test.ts
│   ├── error-handler.test.ts
│   └── validation.test.ts
├── project.json                       # Nx project config
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.spec.json
└── Dockerfile                         # Stub from Feature 00 (filled out here)
```

---

## 4. Nx Project Configuration

### 4.1 `project.json`

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": "api",
  "projectType": "application",
  "root": "apps/api",
  "sourceRoot": "apps/api/src",
  "tags": ["scope:api", "type:app"],
  "implicitDependencies": ["auth-client", "database"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/api",
        "main": "apps/api/src/main.ts",
        "tsConfig": "apps/api/tsconfig.app.json"
      },
      "configurations": {
        "production": {
          "optimization": true,
          "sourceMap": false
        }
      }
    },
    "serve": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "api:build"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["apps/api/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/apps/api"],
      "options": {
        "passWithNoTests": false,
        "reportsDirectory": "../../coverage/apps/api"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p apps/api/tsconfig.json"
      }
    }
  }
}
```

### 4.2 `package.json`

```json
{
  "name": "@iexcel/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node dist/apps/api/main.js",
    "dev": "tsx watch apps/api/src/main.ts"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^12.0.0",
    "zod": "^3.23.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "pino": "^9.0.0",
    "@iexcel/auth-client": "*",
    "@iexcel/shared-types": "*"
  },
  "devDependencies": {
    "drizzle-kit": "^0.27.0",
    "pino-pretty": "^13.0.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "msw": "^2.0.0"
  }
}
```

---

## 5. TypeScript Configuration

### 5.1 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

### 5.2 `tsconfig.app.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/apps/api",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**", "**/*.spec.ts", "**/*.test.ts"],
  "references": [
    { "path": "../../packages/shared-types/tsconfig.lib.json" },
    { "path": "../../packages/auth-client/tsconfig.lib.json" }
  ]
}
```

---

## 6. Environment Configuration

### 6.1 Zod env schema (`src/config/env.ts`)

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MIN: z.coerce.number().int().positive().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  AUTH_ISSUER_URL: z.string().url(),
  CORS_ORIGINS: z.string().transform(s => s.split(',').map(o => o.trim())),
  MAX_REQUEST_BODY_SIZE: z.string().default('1mb'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(): AppConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    console.error(`[startup] Missing or invalid environment variables: ${missing}`);
    process.exit(1);
  }
  return result.data;
}
```

---

## 7. Application Factory

### 7.1 `src/app.ts`

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { AppConfig } from './config/env.js';
import { buildAuthMiddleware } from './middleware/authenticate.js';
import { buildUserLoader } from './middleware/load-user.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoute } from './routes/health.js';
import { meRoute } from './routes/me.js';
import type { DbClient } from './db/client.js';
import type { TokenValidator } from '@iexcel/auth-client/validation';

export interface AppDeps {
  config: AppConfig;
  db: DbClient;
  tokenValidator: TokenValidator;
}

export async function createApp(deps: AppDeps) {
  const app = Fastify({
    logger: {
      level: deps.config.LOG_LEVEL,
      ...(deps.config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // CORS
  await app.register(cors, {
    origin: deps.config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });

  // Auth hooks (protected routes only — registered per-route via preHandler)
  const authenticate = buildAuthMiddleware(deps.tokenValidator);
  const loadUser = buildUserLoader(deps.db);

  // Public routes
  await app.register(healthRoute, { db: deps.db, config: deps.config });

  // Protected routes
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authenticate);
    protectedApp.addHook('preHandler', loadUser);
    await protectedApp.register(meRoute);
  });

  // Error handler (must be set after all routes)
  app.setErrorHandler(errorHandler(deps.config));

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
    });
  });

  return app;
}
```

---

## 8. ApiError Class Hierarchy

### 8.1 `src/errors/api-errors.ts`

```typescript
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication is required.', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', message, 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have permission to perform this action.', details?: Record<string, unknown>) {
    super('FORBIDDEN', message, 403, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'The requested resource was not found.', details?: Record<string, unknown>) {
    super('NOT_FOUND', message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Request validation failed.', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class InvalidJsonError extends ApiError {
  constructor() {
    super('INVALID_JSON', 'Request body is not valid JSON.', 400);
    this.name = 'InvalidJsonError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class UnprocessableError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 422, details);
    this.name = 'UnprocessableError';
  }
}

export class BadGatewayError extends ApiError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 502, details);
    this.name = 'BadGatewayError';
  }
}
```

---

## 9. Authentication Middleware

### 9.1 `src/middleware/authenticate.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenValidator } from '@iexcel/auth-client/validation';
import { TokenValidationError } from '@iexcel/auth-client/types';
import { UnauthorizedError } from '../errors/api-errors.js';

export function buildAuthMiddleware(validator: TokenValidator) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header is required.');
    }
    const token = authHeader.slice(7);
    try {
      const claims = await validator.validateToken(token);
      req.tokenClaims = claims;
    } catch (err) {
      if (err instanceof TokenValidationError) {
        throw new UnauthorizedError('Token is invalid or expired.');
      }
      throw err;
    }
  };
}
```

---

## 10. User Profile Loader

### 10.1 `src/middleware/load-user.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { DbClient } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { users } from '@iexcel/database/schema';

export function buildUserLoader(db: DbClient) {
  return async function loadUser(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const { sub, email, name } = req.tokenClaims;

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, sub))
      .limit(1);

    if (existing) {
      // Sync email/name if changed in IdP
      if (existing.email !== email || existing.name !== name) {
        await db
          .update(users)
          .set({ email, name, updatedAt: new Date() })
          .where(eq(users.authUserId, sub));
      }
      req.user = {
        id: existing.id,
        authUserId: existing.authUserId,
        email: existing.email,
        name: existing.name ?? '',
        role: existing.role,
      };
    } else {
      // JIT provision
      const [provisioned] = await db
        .insert(users)
        .values({
          authUserId: sub,
          email,
          name,
          role: 'team_member',
        })
        .returning();
      req.user = {
        id: provisioned.id,
        authUserId: provisioned.authUserId,
        email: provisioned.email,
        name: provisioned.name ?? '',
        role: provisioned.role,
      };
    }
  };
}
```

---

## 11. Database Client

### 11.1 `src/db/client.ts`

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@iexcel/database/schema';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DbClient | null = null;

export function createDbClient(connectionString: string, poolConfig: { min: number; max: number }): DbClient {
  const sql = postgres(connectionString, {
    min: poolConfig.min,
    max: poolConfig.max,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  _db = drizzle(sql, { schema });
  return _db;
}

export function getDb(): DbClient {
  if (!_db) throw new Error('Database client not initialized. Call createDbClient first.');
  return _db;
}
```

Note: The Drizzle schema is imported from `@iexcel/database/schema` — this path requires Feature 04 to have exported the schema file from `packages/database/src/schema.ts` with a corresponding path alias in `tsconfig.base.json`. The path alias `"@iexcel/database/*": ["packages/database/src/*"]` is defined in Feature 00's `tsconfig.base.json`.

---

## 12. Error Handler

### 12.1 `src/middleware/error-handler.ts`

```typescript
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { ApiError } from '../errors/api-errors.js';
import { ZodError } from 'zod';

export function errorHandler(config: AppConfig) {
  return function handleError(
    error: FastifyError | Error,
    req: FastifyRequest,
    reply: FastifyReply
  ): void {
    // Known API errors
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
      return;
    }

    // Zod validation errors (if not already wrapped)
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: { issues: error.issues },
        },
      });
      return;
    }

    // Fastify body parse errors (malformed JSON)
    if ('statusCode' in error && (error as FastifyError).statusCode === 400) {
      reply.code(400).send({
        error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
      });
      return;
    }

    // Unknown / internal errors
    req.log.error({ err: error }, 'Unhandled error');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        ...(config.NODE_ENV === 'development' ? { stack: error.stack } : {}),
      },
    });
  };
}
```

---

## 13. Response Helpers

### 13.1 `src/helpers/response.ts`

```typescript
import type { FastifyReply } from 'fastify';

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200): void {
  reply.code(statusCode).send({ data });
}

export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
): void {
  reply.code(200).send({
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.pageSize),
    },
  });
}
```

---

## 14. Permission Guard

### 14.1 `src/middleware/require-role.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/api-errors.js';
import type { UserRole } from '@iexcel/shared-types';

export function requireRole(...roles: UserRole[]) {
  return async function checkRole(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!req.user) throw new ForbiddenError();
    if (roles.includes('admin') || !roles.includes(req.user.role)) {
      // Admin always passes; others checked against allowed list
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      throw new ForbiddenError();
    }
  };
}
```

Note: The rule is that `admin` always has access regardless of what roles are listed in `requireRole(...)`. This is verified by GS.md Scenario "Admin role has access to all guarded routes."

---

## 15. Request Type Augmentation

### 15.1 `src/types/request.d.ts`

```typescript
import type { TokenClaims } from '@iexcel/auth-client/types';

declare module 'fastify' {
  interface FastifyRequest {
    tokenClaims: TokenClaims;
    user: {
      id: string;
      authUserId: string;
      email: string;
      name: string;
      role: 'admin' | 'account_manager' | 'team_member';
    };
  }
}
```

---

## 16. Routes

### 16.1 `src/routes/health.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../db/client.js';
import type { AppConfig } from '../config/env.js';
import { checkDatabaseHealth } from '../db/health.js';

export async function healthRoute(
  app: FastifyInstance,
  opts: { db: DbClient; config: AppConfig }
) {
  app.get('/health', async (_req, reply) => {
    const dbHealthy = await checkDatabaseHealth(opts.db);
    const status = dbHealthy ? 'ok' : 'error';
    reply.code(dbHealthy ? 200 : 503).send({
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      checks: { database: dbHealthy ? 'ok' : 'error' },
    });
  });
}
```

### 16.2 `src/routes/me.ts`

```typescript
import type { FastifyInstance } from 'fastify';
import { sendSuccess } from '../helpers/response.js';

export async function meRoute(app: FastifyInstance) {
  app.get('/me', async (req, reply) => {
    sendSuccess(reply, req.user);
  });
}
```

### 16.3 `src/db/health.ts`

```typescript
import type { DbClient } from './client.js';
import { sql } from 'drizzle-orm';

export async function checkDatabaseHealth(db: DbClient): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return true;
  } catch {
    return false;
  }
}
```

---

## 17. Entry Point

### 17.1 `src/main.ts`

```typescript
import { loadConfig } from './config/env.js';
import { createDbClient } from './db/client.js';
import { createApp } from './app.js';
import { createTokenValidator } from '@iexcel/auth-client/validation';

async function main(): Promise<void> {
  const config = loadConfig();

  const db = createDbClient(config.DATABASE_URL, {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
  });

  const tokenValidator = createTokenValidator({
    issuerUrl: config.AUTH_ISSUER_URL,
    audience: 'iexcel-api',
  });

  const app = await createApp({ config, db, tokenValidator });

  // Verify database connectivity before accepting traffic
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    app.log.error({ err }, '[startup] Database connection failed');
    process.exit(1);
  }

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`API listening on port ${config.PORT} [${config.NODE_ENV}]`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    const forceExitTimer = setTimeout(() => {
      app.log.error('Force exit: shutdown timed out after 10s');
      process.exit(1);
    }, 10_000);
    try {
      await app.close();
      clearTimeout(forceExitTimer);
      app.log.info('Shutdown complete.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
```

---

## 18. Testing Strategy

### 18.1 Test Setup

All tests MUST run without a live database or auth service.

**Database mock:** Use a test-specific in-memory or Docker-based PostgreSQL. The preferred approach for unit/integration tests in this feature is a lightweight mock using `vitest` `vi.mock` for the db module, not a real database. E2E tests (separate concern, not in this feature) use a real database.

**JWKS mock:** Use `msw` (Mock Service Worker) at the fetch level to intercept JWKS requests and return a test key set. Generate a test RSA or EC key pair in `test/setup.ts`.

### 18.2 Test File Coverage

| Test File | What It Tests |
|---|---|
| `health.test.ts` | `200 ok`, `503 db-error`, no-auth access |
| `auth.test.ts` | Missing header, expired token, wrong audience, wrong issuer, wrong key, valid token |
| `me.test.ts` | Returns req.user, existing user lookup, JIT provisioning, email sync |
| `error-handler.test.ts` | ApiError mapping, ZodError mapping, unknown error 500, no stack trace in prod |
| `validation.test.ts` | Body validation pass, body fail with details, query validation, params validation |

### 18.3 Coverage Target

Minimum 85% line/branch coverage enforced via Vitest coverage.

---

## 19. Dockerfile

### 19.1 `apps/api/Dockerfile`

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/auth-client/package.json ./packages/auth-client/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --filter @iexcel/api...

# Build
FROM deps AS build
COPY . .
RUN pnpm exec nx build api --configuration=production

# Production image
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/apps/api ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

---

## 20. Performance Requirements

| Concern | Requirement |
|---|---|
| Health check latency | < 50ms at p99 (database reachable) |
| Token validation per request | < 5ms (JWKS cache hit; `jose` crypto is sub-ms) |
| User profile lookup per request | < 10ms (indexed `auth_user_id` lookup) |
| Connection pool exhaustion | Pool min=2, max=10. Requests queue (not fail) when pool is full. Queue timeout: 30s. |
| Startup time | < 3 seconds from process start to first `200 /health` |

---

## 21. Security Requirements

| Concern | Requirement |
|---|---|
| Authorization header logging | MUST NOT be logged at any log level |
| Request body logging | MUST NOT be logged by default (configurable only for DEBUG in development) |
| Stack traces in responses | MUST NOT appear in `NODE_ENV=production` |
| Token audience enforcement | `aud` claim MUST equal `"iexcel-api"` exactly |
| Algorithm confusion | Allowed algorithms: RS256, ES256 only. `none` algorithm is never permitted. |
| HTTPS enforcement | TLS termination is at the load balancer (Terraform Feature 02/36). The API trusts `X-Forwarded-Proto` for redirect decisions but does not terminate TLS itself. |
| Helmet headers | `@fastify/helmet` MUST be registered to set security headers (CSP, HSTS, X-Frame-Options, etc.) |

---

## 22. Dependencies and Integration Points

| Feature | Relationship | Contract |
|---|---|---|
| Feature 00 | Provides `apps/api/` project scaffold | `project.json` exists; `tsconfig.base.json` path aliases set |
| Feature 01 | `@iexcel/shared-types` | `UserRole` type, shared request/response types |
| Feature 04 | `@iexcel/database/schema` | Drizzle schema for `users` table; migration tooling |
| Feature 06 | `@iexcel/auth-client/validation` | `createTokenValidator`, `validateToken`, `TokenValidationError` |
| Feature 08+ | Add routes to `apps/api` | Register Fastify plugins in `app.ts`; inherit middleware chain |
| Feature 22 | `@iexcel/api-client` | Will be generated from this API's endpoint contracts |

---

## 23. Open Technical Questions

| Question | Recommendation | Who Decides |
|---|---|---|
| Express vs Fastify? | This spec chooses Fastify v5. If team prefers Express, all patterns translate. | Tech lead |
| Drizzle vs Prisma? | This spec chooses Drizzle. If Prisma preferred, `db/client.ts` and query code changes; schema location does not. | Tech lead |
| Should the database path alias `@iexcel/database/schema` be established in Feature 04 or Feature 07? | Feature 04 owns the schema file and the export. Feature 07 should confirm with Feature 04 team that `packages/database/src/schema.ts` is exported. | Feature 04 team |
| Should `@fastify/helmet` CSP be configured now or deferred? | Configure with permissive defaults now; tighten in Feature 34/35 (CI/CD/container builds). | Security |
| Should JIT user provisioning happen in a transaction? | Yes — wrap the select-then-insert in a single transaction to prevent race conditions on simultaneous first logins. | Feature 07 team |
