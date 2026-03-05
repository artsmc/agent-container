/**
 * Admin CRUD endpoints for OIDC clients.
 * All endpoints require admin scope.
 *
 * GET    /admin/clients          - List all clients
 * POST   /admin/clients          - Create a new client
 * GET    /admin/clients/:id      - Get a single client
 * PATCH  /admin/clients/:id      - Update a client
 * DELETE /admin/clients/:id      - Deactivate a client
 * POST   /admin/clients/:id/rotate-secret - Rotate client secret
 */
import type { FastifyInstance } from 'fastify';
import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  setClientActive,
  updateClientSecretHash,
} from '../../db/clients.js';
import { generateAndHashClientSecret } from '../../services/client.js';
import { createAuthHook } from '../../middleware/auth.js';
import { createAdminHook } from '../../middleware/admin.js';
import type {
  ClientResponse,
  CreateClientRequest,
  UpdateClientRequest,
  OidcClient,
} from '../../types.js';

const VALID_GRANT_TYPES = [
  'authorization_code',
  'refresh_token',
  'device_code',
  'client_credentials',
];

const MAX_TOKEN_LIFETIME = 86400; // 24 hours
const MAX_REFRESH_TOKEN_LIFETIME = 7776000; // 90 days

function toClientResponse(client: OidcClient): ClientResponse {
  return {
    id: client.id,
    client_id: client.client_id,
    client_name: client.client_name,
    client_type: client.client_type,
    grant_types: client.grant_types,
    redirect_uris: client.redirect_uris,
    scopes: client.scopes,
    token_lifetime: client.token_lifetime,
    refresh_token_lifetime: client.refresh_token_lifetime,
    is_active: client.is_active,
    created_at: client.created_at instanceof Date ? client.created_at.toISOString() : String(client.created_at),
    updated_at: client.updated_at instanceof Date ? client.updated_at.toISOString() : String(client.updated_at),
  };
}

export function registerAdminClientRoutes(
  app: FastifyInstance,
  issuerUrl: string,
  audience: string,
  adminScope: string
): void {
  const authHook = createAuthHook(issuerUrl, audience);
  const adminHook = createAdminHook(adminScope);

  // GET /admin/clients
  app.get(
    '/admin/clients',
    { onRequest: [authHook, adminHook] },
    async (_request, reply) => {
      const clients = await listClients();
      return reply.status(200).send({
        clients: clients.map(toClientResponse),
      });
    }
  );

  // POST /admin/clients
  app.post<{ Body: CreateClientRequest }>(
    '/admin/clients',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const body = request.body;

      // Validate required fields
      if (!body.client_id || !body.client_name || !body.client_type) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_id, client_name, and client_type are required.',
        });
      }

      if (!['public', 'confidential'].includes(body.client_type)) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'client_type must be "public" or "confidential".',
        });
      }

      // Validate grant_types
      if (body.grant_types) {
        for (const gt of body.grant_types) {
          if (!VALID_GRANT_TYPES.includes(gt)) {
            return reply.status(400).send({
              error: 'invalid_request',
              error_description: `Invalid grant_type: ${gt}`,
            });
          }
        }
      }

      // Validate lifetimes
      const tokenLifetime = body.token_lifetime ?? 3600;
      const refreshTokenLifetime = body.refresh_token_lifetime ?? 2592000;

      if (tokenLifetime <= 0 || tokenLifetime > MAX_TOKEN_LIFETIME) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: `token_lifetime must be between 1 and ${MAX_TOKEN_LIFETIME}.`,
        });
      }

      if (refreshTokenLifetime <= 0 || refreshTokenLifetime > MAX_REFRESH_TOKEN_LIFETIME) {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: `refresh_token_lifetime must be between 1 and ${MAX_REFRESH_TOKEN_LIFETIME}.`,
        });
      }

      // For confidential clients, generate a secret
      let clientSecretHash: string | null = null;
      let plaintextSecret: string | undefined;

      if (body.client_type === 'confidential') {
        const { plaintext, hash } = await generateAndHashClientSecret();
        clientSecretHash = hash;
        plaintextSecret = plaintext;
      }

      try {
        const client = await createClient({
          clientId: body.client_id,
          clientName: body.client_name,
          clientSecretHash,
          clientType: body.client_type,
          grantTypes: body.grant_types ?? [],
          redirectUris: body.redirect_uris ?? [],
          scopes: body.scopes ?? [],
          tokenLifetime,
          refreshTokenLifetime,
        });

        const response = toClientResponse(client);

        // Include plaintext secret for confidential clients (shown once)
        if (plaintextSecret) {
          return reply.status(201).send({
            ...response,
            client_secret: plaintextSecret,
          });
        }

        return reply.status(201).send(response);
      } catch (err) {
        // Check for unique constraint violation
        if (
          err instanceof Error &&
          err.message.includes('oidc_clients_client_id_unique')
        ) {
          return reply.status(409).send({
            error: 'conflict',
            error_description: `A client with client_id '${body.client_id}' already exists.`,
          });
        }
        throw err;
      }
    }
  );

  // GET /admin/clients/:id
  app.get<{ Params: { id: string } }>(
    '/admin/clients/:id',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const client = await getClientById(request.params.id);
      if (!client) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'Client not found.',
        });
      }
      return reply.status(200).send(toClientResponse(client));
    }
  );

  // PATCH /admin/clients/:id
  app.patch<{ Params: { id: string }; Body: UpdateClientRequest }>(
    '/admin/clients/:id',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const body = request.body;

      // Validate grant_types if provided
      if (body.grant_types) {
        for (const gt of body.grant_types) {
          if (!VALID_GRANT_TYPES.includes(gt)) {
            return reply.status(400).send({
              error: 'invalid_request',
              error_description: `Invalid grant_type: ${gt}`,
            });
          }
        }
      }

      // Validate lifetimes if provided
      if (body.token_lifetime !== undefined) {
        if (body.token_lifetime <= 0 || body.token_lifetime > MAX_TOKEN_LIFETIME) {
          return reply.status(400).send({
            error: 'invalid_request',
            error_description: `token_lifetime must be between 1 and ${MAX_TOKEN_LIFETIME}.`,
          });
        }
      }

      if (body.refresh_token_lifetime !== undefined) {
        if (
          body.refresh_token_lifetime <= 0 ||
          body.refresh_token_lifetime > MAX_REFRESH_TOKEN_LIFETIME
        ) {
          return reply.status(400).send({
            error: 'invalid_request',
            error_description: `refresh_token_lifetime must be between 1 and ${MAX_REFRESH_TOKEN_LIFETIME}.`,
          });
        }
      }

      const updated = await updateClient(request.params.id, {
        clientName: body.client_name,
        grantTypes: body.grant_types,
        redirectUris: body.redirect_uris,
        scopes: body.scopes,
        tokenLifetime: body.token_lifetime,
        refreshTokenLifetime: body.refresh_token_lifetime,
        isActive: body.is_active,
      });

      if (!updated) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'Client not found.',
        });
      }

      return reply.status(200).send(toClientResponse(updated));
    }
  );

  // DELETE /admin/clients/:id (deactivate, not delete)
  app.delete<{ Params: { id: string } }>(
    '/admin/clients/:id',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const client = await getClientById(request.params.id);
      if (!client) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'Client not found.',
        });
      }

      await setClientActive(request.params.id, false);
      return reply.status(200).send({
        deactivated: true,
        client_id: client.client_id,
      });
    }
  );

  // POST /admin/clients/:id/rotate-secret
  app.post<{ Params: { id: string } }>(
    '/admin/clients/:id/rotate-secret',
    { onRequest: [authHook, adminHook] },
    async (request, reply) => {
      const client = await getClientById(request.params.id);
      if (!client) {
        return reply.status(404).send({
          error: 'not_found',
          error_description: 'Client not found.',
        });
      }

      if (client.client_type !== 'confidential') {
        return reply.status(400).send({
          error: 'invalid_request',
          error_description: 'Only confidential clients have secrets to rotate.',
        });
      }

      const { plaintext, hash } = await generateAndHashClientSecret();
      await updateClientSecretHash(request.params.id, hash);

      return reply.status(200).send({
        client_id: client.client_id,
        client_secret: plaintext,
      });
    }
  );
}
