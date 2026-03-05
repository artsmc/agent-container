import type {
  DeviceFlowConfig,
  DeviceFlowPollOptions,
  TokenSet,
} from '../types/index.js';
import { DeviceFlowError } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';

const SLOW_DOWN_INCREMENT_SECONDS = 5;
const DEFAULT_INTERVAL_SECONDS = 5;

interface TokenEndpointSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  id_token?: string | undefined;
  scope?: string | undefined;
}

interface TokenEndpointErrorResponse {
  error: string;
  error_description?: string | undefined;
}

function isSuccess(body: unknown): body is TokenEndpointSuccessResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'access_token' in body &&
    typeof (body as Record<string, unknown>)['access_token'] === 'string'
  );
}

function isError(body: unknown): body is TokenEndpointErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>)['error'] === 'string'
  );
}

/**
 * Polls the token endpoint for a device authorization grant (RFC 8628 §3.4).
 *
 * Implements the full RFC 8628 error handling:
 * - authorization_pending: continue polling
 * - slow_down: add 5 seconds to interval and continue
 * - expired_token: throw DeviceFlowError(reason: 'expired')
 * - access_denied: throw DeviceFlowError(reason: 'access_denied')
 * - timeout exceeded: throw DeviceFlowError(reason: 'timeout')
 *
 * @param config - Device flow configuration (for issuerUrl and clientId).
 * @param deviceCode - The device_code from initiateDeviceFlow().
 * @param intervalSeconds - Initial polling interval in seconds (from server response).
 * @param expiresIn - Lifetime of the device_code in seconds (from server response).
 * @param options - Optional poll options including onPrompt callback and timeoutMs.
 * @returns TokenSet on successful authorization.
 */
export async function pollDeviceToken(
  config: DeviceFlowConfig,
  deviceCode: string,
  intervalSeconds: number,
  expiresIn: number,
  options?: DeviceFlowPollOptions
): Promise<TokenSet> {
  const { issuerUrl, clientId, fetchImpl = fetch } = config;
  const { onPrompt, timeoutMs } = options ?? {};

  let tokenEndpoint: string;
  try {
    const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
    tokenEndpoint = discovery.token_endpoint;
  } catch (cause) {
    throw new DeviceFlowError(
      `Failed to resolve token endpoint for issuer ${issuerUrl}`,
      'access_denied',
      cause
    );
  }

  const pollDeadlineMs =
    Date.now() + (timeoutMs ?? expiresIn * 1000);

  let currentIntervalSeconds =
    intervalSeconds > 0 ? intervalSeconds : DEFAULT_INTERVAL_SECONDS;

  while (Date.now() < pollDeadlineMs) {
    // Wait the required interval before polling
    await sleep(currentIntervalSeconds * 1000);

    if (Date.now() >= pollDeadlineMs) {
      throw new DeviceFlowError(
        'Device authorization polling timed out',
        'timeout'
      );
    }

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: clientId,
    });

    let response: Response;
    try {
      response = await fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });
    } catch (cause) {
      throw new DeviceFlowError(
        `Network error polling token endpoint ${tokenEndpoint}`,
        'access_denied',
        cause
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new DeviceFlowError(
        'Failed to parse token endpoint poll response as JSON',
        'access_denied',
        cause
      );
    }

    // Successful token issuance
    if (response.ok && isSuccess(body)) {
      const now = Math.floor(Date.now() / 1000);
      return {
        accessToken: body.access_token,
        tokenType: body.token_type,
        expiresIn: body.expires_in,
        expiresAt:
          body.expires_in !== undefined ? now + body.expires_in : undefined,
        refreshToken: body.refresh_token,
        idToken: body.id_token,
        scope: body.scope,
      };
    }

    if (!isError(body)) {
      throw new DeviceFlowError(
        `Device flow token endpoint returned unexpected response (HTTP ${response.status})`,
        'access_denied'
      );
    }

    const errorCode = body.error;

    switch (errorCode) {
      case 'authorization_pending':
        onPrompt?.('Waiting for user authorization...');
        break;

      case 'slow_down':
        currentIntervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
        onPrompt?.(
          `Server requested slower polling. New interval: ${currentIntervalSeconds}s`
        );
        break;

      case 'expired_token':
        throw new DeviceFlowError(
          'Device code has expired. Please restart the authorization flow.',
          'expired'
        );

      case 'access_denied':
        throw new DeviceFlowError(
          'User denied the device authorization request.',
          'access_denied'
        );

      default:
        throw new DeviceFlowError(
          body.error_description ?? `Device flow failed: ${errorCode}`,
          'access_denied'
        );
    }
  }

  throw new DeviceFlowError(
    'Device authorization polling timed out',
    'timeout'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
