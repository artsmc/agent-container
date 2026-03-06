/**
 * POST /token
 * Token endpoint. Handles authorization_code, refresh_token, and client_credentials grants.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { consumeAuthCode } from '../services/auth-codes.js';
import {
  lookupClient,
  assertClientSupportsGrant,
  verifyClientSecret,
} from '../services/client.js';
import {
  signAccessToken,
  signIdToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../services/token.js';
import {
  createRefreshToken,
  getRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllRefreshTokensForUserAndClient,
} from '../db/tokens.js';
import { getUserById } from '../db/users.js';
import { getUserRoleById } from '../db/local-auth.js';
import { assertUserIsActive } from '../services/user.js';
import {
  AuthError,
  InvalidRequestError,
  InvalidGrantError,
  UnsupportedGrantTypeError,
} from '../errors.js';
import type { TokenResponse } from '../types.js';
import { randomBytes } from 'node:crypto';

interface TokenBody {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

export function registerTokenRoute(
  app: FastifyInstance,
  issuerUrl: string
): void {
  app.post<{ Body: TokenBody }>('/token', async (request, reply) => {
    const body = request.body;
    const grantType = body.grant_type;

    if (!grantType) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: grant_type',
      });
    }

    try {
      switch (grantType) {
        case 'authorization_code':
          return await handleAuthorizationCode(body, issuerUrl, reply);
        case 'refresh_token':
          return await handleRefreshToken(body, issuerUrl, reply);
        case 'client_credentials':
          return await handleClientCredentials(body, issuerUrl, reply);
        default:
          throw new UnsupportedGrantTypeError(`Unsupported grant_type: ${grantType}`);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send(err.toJSON());
      }
      console.error('Token endpoint error:', err);
      return reply.status(500).send({
        error: 'server_error',
        error_description: 'An unexpected error occurred.',
      });
    }
  });
}

async function handleAuthorizationCode(
  body: TokenBody,
  issuerUrl: string,
  reply: { status: (code: number) => { send: (data: unknown) => unknown } }
): Promise<unknown> {
  const { code, redirect_uri, client_id, code_verifier } = body;

  if (!code) throw new InvalidRequestError('Missing required parameter: code');
  if (!redirect_uri) throw new InvalidRequestError('Missing required parameter: redirect_uri');
  if (!client_id) throw new InvalidRequestError('Missing required parameter: client_id');

  // Look up client
  const client = await lookupClient(client_id);
  assertClientSupportsGrant(client, 'authorization_code');

  // Consume the auth code (marks it as used)
  const authCodeRecord = consumeAuthCode(code);

  // Validate client_id matches
  if (authCodeRecord.clientId !== client_id) {
    throw new InvalidGrantError('client_id does not match the authorization code.');
  }

  // Validate redirect_uri matches
  if (authCodeRecord.redirectUri !== redirect_uri) {
    throw new InvalidGrantError('redirect_uri does not match the authorization code.');
  }

  // Validate PKCE code_verifier
  if (authCodeRecord.codeChallenge) {
    if (!code_verifier) {
      throw new InvalidRequestError('Missing required parameter: code_verifier');
    }

    const computedChallenge = createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (computedChallenge !== authCodeRecord.codeChallenge) {
      throw new InvalidGrantError('Invalid code_verifier.');
    }
  }

  // Look up user
  const user = await getUserById(authCodeRecord.userId);
  if (!user) {
    throw new InvalidGrantError('User not found.');
  }
  assertUserIsActive(user);

  // Issue tokens
  const scopes = authCodeRecord.scope.split(' ');
  const jti = randomBytes(16).toString('base64url');
  const accessToken = await signAccessToken(
    {
      sub: user.id,
      aud: 'iexcel-api',
      scope: authCodeRecord.scope,
      iss: issuerUrl,
      jti,
      email: user.email,
      name: user.name,
    },
    client.token_lifetime
  );

  // Build ID token claims based on scope
  const idTokenParams: {
    sub: string;
    aud: string;
    iss: string;
    email?: string;
    name?: string;
    picture?: string;
    nonce?: string;
  } = {
    sub: user.id,
    aud: client_id,
    iss: issuerUrl,
  };

  if (scopes.includes('email')) {
    idTokenParams.email = user.email;
  }
  if (scopes.includes('profile')) {
    idTokenParams.name = user.name;
    if (user.picture) {
      idTokenParams.picture = user.picture;
    }
  }
  if (authCodeRecord.nonce) {
    idTokenParams.nonce = authCodeRecord.nonce;
  }

  const idToken = await signIdToken(idTokenParams, client.token_lifetime);

  // Generate and store refresh token
  const refreshTokenPlain = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshTokenPlain);
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setSeconds(refreshExpiresAt.getSeconds() + client.refresh_token_lifetime);

  await createRefreshToken({
    userId: user.id,
    clientId: client_id,
    tokenHash: refreshTokenHash,
    expiresAt: refreshExpiresAt,
  });

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: client.token_lifetime,
    id_token: idToken,
    refresh_token: refreshTokenPlain,
  };

  return reply.status(200).send(response);
}

async function handleRefreshToken(
  body: TokenBody,
  issuerUrl: string,
  reply: { status: (code: number) => { send: (data: unknown) => unknown } }
): Promise<unknown> {
  const { refresh_token, client_id } = body;

  if (!refresh_token) throw new InvalidRequestError('Missing required parameter: refresh_token');
  if (!client_id) throw new InvalidRequestError('Missing required parameter: client_id');

  const client = await lookupClient(client_id);
  assertClientSupportsGrant(client, 'refresh_token');

  // Hash and look up
  const tokenHash = hashRefreshToken(refresh_token);
  const storedToken = await getRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw new InvalidGrantError('Invalid refresh token.');
  }

  // Check if already revoked (potential token theft)
  if (storedToken.revoked_at) {
    // Revoke ALL tokens for this user+client as a security measure
    console.warn(
      `SECURITY: Refresh token reuse detected for user ${storedToken.user_id}, client ${storedToken.client_id}`
    );
    await revokeAllRefreshTokensForUserAndClient(storedToken.user_id, storedToken.client_id);
    throw new InvalidGrantError('Refresh token has been revoked. All tokens for this session have been invalidated.');
  }

  // Check expiration
  if (storedToken.expires_at.getTime() < Date.now()) {
    throw new InvalidGrantError('Refresh token has expired.');
  }

  // Validate client_id matches
  if (storedToken.client_id !== client_id) {
    throw new InvalidGrantError('client_id does not match the refresh token.');
  }

  // Revoke old refresh token (rotation)
  await revokeRefreshToken(storedToken.id);

  // Look up user
  const user = await getUserById(storedToken.user_id);
  if (!user) {
    throw new InvalidGrantError('User not found.');
  }
  assertUserIsActive(user);

  // Preserve admin scope on refresh
  const role = await getUserRoleById(user.id);
  const scopes = ['openid', 'profile', 'email'];
  if (role === 'admin') {
    scopes.push('admin');
  }
  const scope = scopes.join(' ');

  // Issue new tokens
  const jti = randomBytes(16).toString('base64url');
  const accessToken = await signAccessToken(
    {
      sub: user.id,
      aud: 'iexcel-api',
      scope,
      iss: issuerUrl,
      jti,
      email: user.email,
      name: user.name,
    },
    client.token_lifetime
  );

  // Generate new refresh token
  const newRefreshTokenPlain = generateRefreshToken();
  const newRefreshTokenHash = hashRefreshToken(newRefreshTokenPlain);
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setSeconds(refreshExpiresAt.getSeconds() + client.refresh_token_lifetime);

  await createRefreshToken({
    userId: user.id,
    clientId: client_id,
    tokenHash: newRefreshTokenHash,
    expiresAt: refreshExpiresAt,
  });

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: client.token_lifetime,
    refresh_token: newRefreshTokenPlain,
  };

  return reply.status(200).send(response);
}

async function handleClientCredentials(
  body: TokenBody,
  issuerUrl: string,
  reply: { status: (code: number) => { send: (data: unknown) => unknown } }
): Promise<unknown> {
  const { client_id, client_secret, scope } = body;

  if (!client_id) throw new InvalidRequestError('Missing required parameter: client_id');
  if (!client_secret) throw new InvalidRequestError('Missing required parameter: client_secret');

  const client = await lookupClient(client_id);
  assertClientSupportsGrant(client, 'client_credentials');

  // Client must be confidential
  if (client.client_type !== 'confidential') {
    throw new InvalidRequestError('client_credentials grant requires a confidential client.');
  }

  // Verify secret
  await verifyClientSecret(client, client_secret);

  // Validate scope if provided
  if (scope) {
    const requestedScopes = scope.split(' ');
    for (const s of requestedScopes) {
      if (!client.scopes.includes(s)) {
        throw new InvalidRequestError(`Scope '${s}' is not allowed for this client.`);
      }
    }
  }

  const tokenScope = scope ?? client.scopes.join(' ');

  // Issue access token with client identity (no user sub)
  const accessToken = await signAccessToken(
    {
      sub: client_id,
      aud: 'iexcel-api',
      scope: tokenScope,
      iss: issuerUrl,
      clientId: client_id,
    },
    client.token_lifetime
  );

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: client.token_lifetime,
  };

  return reply.status(200).send(response);
}
