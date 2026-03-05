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

# 3. Apply database migrations (from repo root)
cd packages/auth-database && bash scripts/migrate.sh

# 4. Install dependencies
pnpm install

# 5. Run
npx nx serve auth
```

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
  "jti": "<unique token ID>"
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
