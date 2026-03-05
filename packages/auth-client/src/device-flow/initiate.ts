import type {
  DeviceFlowConfig,
  DeviceAuthorizationResponse,
} from '../types/index.js';
import { DeviceFlowError } from '../types/index.js';
import { getDiscoveryDocument } from '../discovery/index.js';

interface DeviceAuthEndpointResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | undefined;
  expires_in: number;
  interval?: number | undefined;
}

function isDeviceAuthResponse(
  body: unknown
): body is DeviceAuthEndpointResponse {
  if (typeof body !== 'object' || body === null) return false;
  const r = body as Record<string, unknown>;
  return (
    typeof r['device_code'] === 'string' &&
    typeof r['user_code'] === 'string' &&
    typeof r['verification_uri'] === 'string' &&
    typeof r['expires_in'] === 'number'
  );
}

/**
 * Initiates a Device Authorization flow (RFC 8628 §3.1).
 * Posts to the device_authorization_endpoint and returns the response
 * containing user_code, verification_uri, and device_code for polling.
 *
 * @throws {DeviceFlowError} when the request fails or the server returns an error.
 */
export async function initiateDeviceFlow(
  config: DeviceFlowConfig
): Promise<DeviceAuthorizationResponse> {
  const {
    issuerUrl,
    clientId,
    scope = 'openid profile email',
    fetchImpl = fetch,
  } = config;

  let deviceAuthEndpoint: string;
  try {
    const discovery = await getDiscoveryDocument(issuerUrl, { fetchImpl });
    if (
      discovery.device_authorization_endpoint === undefined ||
      discovery.device_authorization_endpoint.length === 0
    ) {
      throw new DeviceFlowError(
        `Issuer ${issuerUrl} does not support device authorization flow (missing device_authorization_endpoint)`,
        'access_denied'
      );
    }
    deviceAuthEndpoint = discovery.device_authorization_endpoint;
  } catch (cause) {
    if (cause instanceof DeviceFlowError) throw cause;
    throw new DeviceFlowError(
      `Failed to resolve device authorization endpoint for issuer ${issuerUrl}`,
      'access_denied',
      cause
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope,
  });

  let response: Response;
  try {
    response = await fetchImpl(deviceAuthEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
  } catch (cause) {
    throw new DeviceFlowError(
      `Network error posting to device authorization endpoint ${deviceAuthEndpoint}`,
      'access_denied',
      cause
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new DeviceFlowError(
      'Failed to parse device authorization endpoint response as JSON',
      'access_denied',
      cause
    );
  }

  if (!response.ok) {
    const errMsg =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as Record<string, unknown>)['error'] === 'string'
        ? String((body as Record<string, unknown>)['error'])
        : `HTTP ${response.status}`;
    throw new DeviceFlowError(
      `Device authorization request failed: ${errMsg}`,
      'access_denied'
    );
  }

  if (!isDeviceAuthResponse(body)) {
    throw new DeviceFlowError(
      'Device authorization endpoint returned an unexpected response shape',
      'access_denied'
    );
  }

  return {
    device_code: body.device_code,
    user_code: body.user_code,
    verification_uri: body.verification_uri,
    verification_uri_complete: body.verification_uri_complete,
    expires_in: body.expires_in,
    interval: body.interval,
  };
}
