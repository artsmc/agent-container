/**
 * POST /login — Local email/password login.
 *
 * Two modes:
 * 1. OIDC flow (auth_session cookie present): Authenticate user, issue auth code,
 *    return redirect URL to client app. This completes the /authorize flow.
 * 2. Direct login (no auth_session): Issue access_token + refresh_token directly.
 *    Used by the admin console.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authenticateLocalUser } from '../services/local-auth.js';
import { createSession } from '../services/session.js';
import { createAuthCode } from '../services/auth-codes.js';
import {
  signAccessToken,
  signIdToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../services/token.js';
import { createRefreshToken } from '../db/tokens.js';
import { AuthError } from '../errors.js';
import type { AuthorizationRequestSession, TokenResponse } from '../types.js';

interface LoginBody {
  email?: string;
  password?: string;
}

/** Default token lifetimes for direct local auth */
const ACCESS_TOKEN_LIFETIME = 3600; // 1 hour
const REFRESH_TOKEN_LIFETIME = 2592000; // 30 days

export function registerLoginRoute(
  app: FastifyInstance,
  issuerUrl: string
): void {
  app.post<{ Body: LoginBody }>(
    '/login',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      if (!email || !password) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'email and password are required.',
        });
      }

      try {
        const user = await authenticateLocalUser({ email, password });

        // Create a session for the user
        await createSession({ userId: user.id, idpSessionId: null });

        // Check if this is part of an OIDC authorization flow
        const sessionCookie = request.cookies['auth_session'];
        if (sessionCookie) {
          return await handleOidcFlow(sessionCookie, user, reply);
        }

        // Direct login — issue tokens (for admin console)
        return await handleDirectLogin(user, issuerUrl, reply);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.status(err.statusCode).send(err.toJSON());
        }
        throw err;
      }
    }
  );
}

/**
 * OIDC flow: issue an authorization code and return the redirect URL.
 * The client-side JS will redirect the browser.
 */
async function handleOidcFlow(
  sessionCookie: string,
  user: { id: string; role: string },
  reply: { clearCookie: (name: string, opts: object) => void; status: (code: number) => { send: (data: unknown) => unknown } }
): Promise<unknown> {
  let session: AuthorizationRequestSession;
  try {
    session = JSON.parse(sessionCookie) as AuthorizationRequestSession;
  } catch {
    return reply.status(400).send({
      error: 'invalid_request',
      error_description: 'Invalid authorization session.',
    });
  }

  // Check session TTL (5 minutes)
  if (Date.now() - session.createdAt > 5 * 60 * 1000) {
    return reply.status(400).send({
      error: 'invalid_request',
      error_description: 'Authorization session expired. Please try again.',
    });
  }

  // Include admin scope if user is admin
  const scopes = session.scope.split(' ');
  if (user.role === 'admin' && !scopes.includes('admin')) {
    scopes.push('admin');
  }

  // Issue authorization code
  const authCode = createAuthCode({
    userId: user.id,
    clientId: session.clientId,
    redirectUri: session.redirectUri,
    codeChallenge: session.codeChallenge,
    codeChallengeMethod: session.codeChallengeMethod,
    scope: scopes.join(' '),
    nonce: session.nonce,
  });

  // Build redirect URL
  const redirectUrl = new URL(session.redirectUri);
  redirectUrl.searchParams.set('code', authCode);
  redirectUrl.searchParams.set('state', session.state);

  // Clear the session cookie
  reply.clearCookie('auth_session', { path: '/' });

  return reply.status(200).send({
    redirect_to: redirectUrl.toString(),
  });
}

/**
 * Direct login: issue tokens for the admin console.
 */
async function handleDirectLogin(
  user: { id: string; email: string; name: string; picture: string | null; role: string },
  issuerUrl: string,
  reply: { status: (code: number) => { send: (data: unknown) => unknown } }
): Promise<unknown> {
  const scopes = ['openid', 'profile', 'email'];
  if (user.role === 'admin') {
    scopes.push('admin');
  }
  const scope = scopes.join(' ');

  const jti = randomBytes(16).toString('base64url');
  const accessToken = await signAccessToken(
    { sub: user.id, aud: 'iexcel-api', scope, iss: issuerUrl, jti, email: user.email, name: user.name },
    ACCESS_TOKEN_LIFETIME
  );

  const idToken = await signIdToken(
    {
      sub: user.id,
      aud: 'iexcel-ui',
      iss: issuerUrl,
      email: user.email,
      name: user.name,
      picture: user.picture ?? undefined,
    },
    ACCESS_TOKEN_LIFETIME
  );

  const refreshTokenPlain = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshTokenPlain);
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setSeconds(refreshExpiresAt.getSeconds() + REFRESH_TOKEN_LIFETIME);

  await createRefreshToken({
    userId: user.id,
    clientId: 'iexcel-ui',
    tokenHash: refreshTokenHash,
    expiresAt: refreshExpiresAt,
  });

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_LIFETIME,
    id_token: idToken,
    refresh_token: refreshTokenPlain,
  };

  return reply.status(200).send(response);
}
