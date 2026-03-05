/**
 * POST /device/token
 * Token polling endpoint for device flow.
 * Terminal calls this repeatedly until the user completes authentication.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  lookupByDeviceCode,
  enforcePollingInterval,
  consumeDeviceFlow,
} from '../../services/device.js';
import { lookupClient, assertClientSupportsGrant } from '../../services/client.js';
import {
  signAccessToken,
  signIdToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../../services/token.js';
import { createRefreshToken } from '../../db/tokens.js';
import { getUserById } from '../../db/users.js';
import { assertUserIsActive } from '../../services/user.js';
import {
  AuthError,
  AuthorizationPendingError,
  SlowDownError,
  InvalidRequestError,
} from '../../errors.js';
import type { TokenResponse } from '../../types.js';

interface DeviceTokenBody {
  grant_type?: string;
  device_code?: string;
  client_id?: string;
}

export function registerDeviceTokenRoute(
  app: FastifyInstance,
  issuerUrl: string
): void {
  app.post<{ Body: DeviceTokenBody }>('/device/token', async (request, reply) => {
    const { grant_type, device_code, client_id } = request.body;

    if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
      return reply.status(400).send({
        error: 'unsupported_grant_type',
        error_description: 'Expected grant_type=urn:ietf:params:oauth:grant-type:device_code',
      });
    }

    if (!device_code) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: device_code',
      });
    }

    if (!client_id) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: client_id',
      });
    }

    try {
      // Validate client
      const client = await lookupClient(client_id);
      assertClientSupportsGrant(
        client,
        'urn:ietf:params:oauth:grant-type:device_code'
      );

      // Look up device flow
      const record = lookupByDeviceCode(device_code);
      if (!record) {
        throw new InvalidRequestError('Invalid device_code.');
      }

      // Validate client_id matches
      if (record.clientId !== client_id) {
        throw new InvalidRequestError('client_id does not match the device code.');
      }

      // Enforce polling interval
      const pollingResult = enforcePollingInterval(record);
      if (pollingResult === 'slow_down') {
        throw new SlowDownError();
      }

      // Try to consume (this checks status and throws appropriate errors)
      const completed = consumeDeviceFlow(device_code);

      if (!completed.userId) {
        throw new AuthorizationPendingError();
      }

      // Look up user
      const user = await getUserById(completed.userId);
      if (!user) {
        throw new InvalidRequestError('User not found.');
      }
      assertUserIsActive(user);

      // Issue tokens
      const jti = randomBytes(16).toString('base64url');
      const accessToken = await signAccessToken(
        {
          sub: user.id,
          aud: 'iexcel-api',
          scope: completed.scope,
          iss: issuerUrl,
          jti,
        },
        client.token_lifetime
      );

      // Build ID token
      const scopes = completed.scope.split(' ');
      const idTokenParams: {
        sub: string;
        aud: string;
        iss: string;
        email?: string;
        name?: string;
        picture?: string;
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

      const idToken = await signIdToken(idTokenParams, client.token_lifetime);

      // Generate and store refresh token
      const refreshTokenPlain = generateRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshTokenPlain);
      const refreshExpiresAt = new Date();
      refreshExpiresAt.setSeconds(
        refreshExpiresAt.getSeconds() + client.refresh_token_lifetime
      );

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
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send(err.toJSON());
      }
      console.error('Device token error:', err);
      return reply.status(500).send({
        error: 'server_error',
        error_description: 'An unexpected error occurred.',
      });
    }
  });
}
