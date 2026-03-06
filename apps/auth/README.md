# Auth Service (`apps/auth`)

OIDC provider service for the iExcel Automation platform. Acts as an identity broker
between external Identity Providers (Google, Okta, Azure AD) and the internal
service mesh.

## Architecture

The auth service is a **standalone Fastify application** that implements the following
OIDC/OAuth 2.0 flows:

- **Authorization Code Flow** (with PKCE) -- for the web UI
- **Device Authorization Flow** -- for the terminal CLI
- **Client Credentials Flow** -- for service-to-service auth (Mastra agent)
- **Refresh Token Rotation** -- for all user flows

The service issues its own JWTs signed with RSA-256. The `sub` claim in all
user tokens is the internal `users.id` UUID from the auth database.

## Tech Stack

| Component         | Choice            |
|-------------------|-------------------|
| Runtime           | Node.js 22 LTS    |
| Framework         | Fastify 4.x       |
| JWT               | jose 5.x          |
| Database          | PostgreSQL (pg)    |
| Secret Hashing    | argon2             |
| Build             | esbuild via Nx     |

## Quick Start

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env with real values

# 2. Generate an RSA key pair for JWT signing
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
# Copy the PEM content into SIGNING_KEY_PRIVATE in .env

# 3. Start the database (from repo root)
cd infra && docker compose up -d

# 4. Apply database migrations
PGPASSWORD=change_me psql -h localhost -p 5433 -U auth_user -d iexcel_auth \
  -f packages/auth-database/migrations/006_add_password_hash.up.sql

# 5. Seed the admin user (password: changeme)
PGPASSWORD=change_me psql -h localhost -p 5433 -U auth_user -d iexcel_auth \
  -f packages/auth-database/seeds/001_seed_admin.sql

# 6. Install dependencies
pnpm install

# 7. Run
cd apps/auth && pnpm exec tsx src/index.ts
```

> **Important:** After first login, change the admin password. The default
> seed password (`changeme`) is for development only.

## Environment Variables

| Variable                      | Required | Default | Description                                     |
|-------------------------------|----------|---------|--------------------------------------------------|
| `AUTH_DATABASE_URL`           | Yes      |         | Postgres connection string for iexcel_auth       |
| `IDP_CLIENT_ID`              | Yes      |         | OAuth client ID at the external IdP              |
| `IDP_CLIENT_SECRET`          | Yes      |         | OAuth client secret at the external IdP          |
| `IDP_ISSUER_URL`             | Yes      |         | External IdP OIDC issuer URL                     |
| `SIGNING_KEY_PRIVATE`        | Yes      |         | PEM-encoded RSA private key for JWT signing      |
| `AUTH_ISSUER_URL`            | Yes      |         | This service's public URL (issuer in tokens)     |
| `SIGNING_KEY_PRIVATE_PREVIOUS` | No     |         | Previous signing key during key rotation         |
| `ADMIN_SCOPE`                | No       | admin   | Scope value that grants admin access             |
| `PORT`                       | No       | 8090    | Listening port                                   |
| `CORS_ALLOWED_ORIGINS`       | No       |         | Comma-separated list of allowed CORS origins     |
| `NODE_ENV`                   | No       | development | Environment (development/production)         |

## Endpoints

### OIDC Standard

| Method | Path                               | Auth     | Description                        |
|--------|-------------------------------------|----------|-------------------------------------|
| GET    | `/.well-known/openid-configuration` | None     | OIDC discovery document             |
| GET    | `/.well-known/jwks.json`            | None     | JSON Web Key Set                    |
| GET    | `/authorize`                        | None     | Start authorization code flow       |
| GET    | `/callback`                         | None     | IdP callback (internal)             |
| POST   | `/token`                            | Varies   | Token exchange (all grant types)    |
| POST   | `/register`                         | None     | Local email/password registration   |
| POST   | `/login`                            | None     | Local email/password login          |
| POST   | `/device/authorize`                 | None     | Start device flow                   |
| GET    | `/device`                           | None     | Device code entry page              |
| POST   | `/device/token`                     | None     | Device flow polling                 |
| GET    | `/userinfo`                         | Bearer   | User identity claims                |
| GET    | `/health`                           | None     | Health check                        |

### Admin (requires `admin` scope)

| Method | Path                                 | Description                  |
|--------|---------------------------------------|-------------------------------|
| GET    | `/admin/clients`                      | List all OIDC clients         |
| POST   | `/admin/clients`                      | Register new client           |
| GET    | `/admin/clients/:id`                  | Get client detail             |
| PATCH  | `/admin/clients/:id`                  | Update client                 |
| DELETE | `/admin/clients/:id`                  | Deactivate client             |
| POST   | `/admin/clients/:id/rotate-secret`    | Rotate client secret          |
| GET    | `/admin/users`                        | List users                    |
| GET    | `/admin/users/:id`                    | Get user detail               |
| POST   | `/admin/users/:id/deactivate`         | Deactivate user               |
| DELETE | `/admin/users/:id/sessions`           | Revoke all sessions for user  |

### Built-in UI Pages

The auth service serves its own HTML UI — no external frontend needed.

| Path                       | Description                                      |
|----------------------------|--------------------------------------------------|
| `/login`                   | Login page (email/password + Google SSO)         |
| `/register`                | User registration page                           |
| `/login/google`            | Redirects to Google OAuth (requires auth_session) |
| `/console/clients`         | Admin: list all OIDC clients                     |
| `/console/clients/new`     | Admin: create a new client                       |
| `/console/clients/:id`     | Admin: view/manage a client (rotate secret, deactivate) |

Admin console pages require a valid access token with admin scope (stored in
`sessionStorage` after login).

## Local Authentication

Users can register and log in with email/password. Passwords are hashed with
Argon2id. The `POST /login` endpoint handles two modes:

1. **OIDC flow** (when `auth_session` cookie exists from `/authorize`): authenticates
   the user, issues an authorization code, and returns a `redirect_to` URL back to
   the client application.
2. **Direct login** (no `auth_session`): returns `access_token`, `id_token`, and
   `refresh_token` directly. Used by the admin console.

Admin users (role = `admin`) receive the `admin` scope in their tokens, which
grants access to the admin API and console.

### Seeded Admin User

| Field    | Value              |
|----------|--------------------|
| Email    | `admin@iexcel.com` |
| Password | `changeme`         |
| Role     | `admin`            |

## Token Structure

### Access Token (JWT)

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "<thumbprint of signing key>"
}
```

**User flow payload:**
```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "<users.id UUID>",
  "aud": "iexcel-api",
  "iat": 1709136000,
  "exp": 1709139600,
  "scope": "openid profile email",
  "jti": "<unique token ID>",
  "email": "user@example.com",
  "name": "User Name"
}
```

**Client credentials payload:**
```json
{
  "iss": "https://auth.iexcel.com",
  "sub": "mastra-agent",
  "aud": "iexcel-api",
  "scope": "openid",
  "client_id": "mastra-agent"
}
```

### Key Rotation

Set `SIGNING_KEY_PRIVATE_PREVIOUS` to the old key during rotation. Both keys
will be published in the JWKS endpoint. Remove the old key after all tokens
signed by it have expired (max 1 hour).

## Implementation Notes

- Device flow and authorization code state are stored **in-memory**. This is
  acceptable for single-instance deployments. For horizontal scaling, these
  stores should be migrated to PostgreSQL.
- Refresh tokens use SHA-256 hashing (high-entropy random values).
- Client secrets use Argon2id hashing.
- All database queries use parameterized SQL (no string interpolation).
- A cleanup job runs every hour to evict expired sessions, tokens, and
  in-memory state.

## Database Migrations

Migrations live in `packages/auth-database/migrations/` and are numbered
sequentially. Apply them in order with `psql` or `golang-migrate`:

| Migration | Description                          |
|-----------|--------------------------------------|
| 001       | Create `users` table                 |
| 002       | Create `oidc_clients` table          |
| 003       | Create `refresh_tokens` table        |
| 004       | Create `sessions` table              |
| 005       | Seed pre-registered OIDC clients     |
| 006       | Add `password_hash` and `role` columns to users |

Seed files in `packages/auth-database/seeds/`:

| Seed | Description                                |
|------|--------------------------------------------|
| 001  | Insert admin user (admin@iexcel.com)       |

## Service Map (Development)

| Service          | Port | URL                        |
|------------------|------|----------------------------|
| Auth Service     | 8190 | `http://localhost:8190`    |
| Auth Admin UI    | 8190 | `http://localhost:8190/console/clients` |
| Product API      | 8080 | `http://localhost:8080`    |
| UI App (Next.js) | 3050 | `http://localhost:3050`    |
| Mastra Engine    | 3000 | `http://localhost:3000`    |
| Mastra Studio    | 4111 | `http://localhost:4111`    |
| PostgreSQL       | 5433 | `localhost:5433`           |

### Starting All Services

```bash
# From repo root:

# 1. Infrastructure (PostgreSQL)
cd infra && docker compose up -d && cd ..

# 2. Apply migrations + seed (first time only)
PGPASSWORD=change_me psql -h localhost -p 5433 -U auth_user -d iexcel_auth \
  -f packages/auth-database/migrations/006_add_password_hash.up.sql
PGPASSWORD=change_me psql -h localhost -p 5433 -U auth_user -d iexcel_auth \
  -f packages/auth-database/seeds/001_seed_admin.sql

# 3. Auth service (port 8190)
cd apps/auth && pnpm exec tsx src/index.ts &

# 4. Product API (port 8080)
cd apps/api && pnpm exec tsx --env-file=.env src/main.ts &

# 5. UI app (port 3050)
cd apps/ui && npx next dev -p 3050 &

# 6. Mastra engine (port 3000) — requires auth service running
cd apps/mastra && npx mastra dev &

# 7. Mastra Studio (port 4111) — requires Mastra engine running
cd apps/mastra && npx mastra studio --port 4111 &
```

## Deployment Considerations

1. **Change the admin password** after first deployment. The seed uses a
   development-only password.
2. **CORS origins**: Set `CORS_ALLOWED_ORIGINS` to include your UI app domain
   (e.g., `http://localhost:3050` for development).
3. **OIDC client redirect URIs**: Register redirect URIs for each client via
   the admin console or database. The `iexcel-ui` client needs the UI app's
   callback URL (e.g., `http://localhost:3050/auth/callback`).
4. **Google OAuth**: Configure `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`, and
   `IDP_ISSUER_URL` (https://accounts.google.com) for Google SSO support.
5. **JWKS endpoint**: The `/.well-known/jwks.json` endpoint only exposes public
   key components. Consumer services (API, Mastra) use this to verify tokens.
6. **Static assets**: CSS is served at `/static/styles.css` via `@fastify/static`.
   In production, consider a CDN or reverse proxy for caching.
7. **Mastra client credentials**: The `mastra-agent` OIDC client must have a
   secret generated via the admin console. Set `MASTRA_CLIENT_ID` and
   `MASTRA_CLIENT_SECRET` in `apps/mastra/.env`.
