/**
 * POST /device/authorize
 * Initiates the device authorization flow.
 * Issues a user_code and device_code for display on the terminal.
 */
import type { FastifyInstance } from 'fastify';
import { lookupClient, assertClientSupportsGrant } from '../../services/client.js';
import {
  createDeviceFlow,
  getDeviceFlowTtlSeconds,
  getPollingIntervalSeconds,
} from '../../services/device.js';
import { AuthError } from '../../errors.js';
import type { DeviceAuthorizeResponse } from '../../types.js';

interface DeviceAuthorizeBody {
  client_id?: string;
  scope?: string;
}

export function registerDeviceAuthorizeRoute(
  app: FastifyInstance,
  issuerUrl: string
): void {
  app.post<{ Body: DeviceAuthorizeBody }>('/device/authorize', async (request, reply) => {
    const { client_id, scope } = request.body;

    if (!client_id) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameter: client_id',
      });
    }

    try {
      const client = await lookupClient(client_id);
      assertClientSupportsGrant(
        client,
        'urn:ietf:params:oauth:grant-type:device_code'
      );

      const requestedScope = scope ?? 'openid profile email';

      // Validate scopes
      const scopes = requestedScope.split(' ');
      for (const s of scopes) {
        if (!client.scopes.includes(s)) {
          return reply.status(400).send({
            error: 'invalid_scope',
            error_description: `Scope '${s}' is not allowed for this client.`,
          });
        }
      }

      const record = createDeviceFlow(client_id, requestedScope);

      const baseUrl = issuerUrl.replace(/\/$/, '');
      const response: DeviceAuthorizeResponse = {
        device_code: record.deviceCode,
        user_code: record.userCode,
        verification_uri: `${baseUrl}/device`,
        verification_uri_complete: `${baseUrl}/device?user_code=${record.userCode}`,
        expires_in: getDeviceFlowTtlSeconds(),
        interval: getPollingIntervalSeconds(),
      };

      return reply.status(200).send(response);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send(err.toJSON());
      }
      console.error('Device authorize error:', err);
      return reply.status(500).send({
        error: 'server_error',
        error_description: 'An unexpected error occurred.',
      });
    }
  });
}
