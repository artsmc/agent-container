import type { IntegrationPlatform } from '@iexcel/shared-types';
import type { PlatformConnector } from './types';
import { firefliesConnector } from './fireflies';
import { grainConnector } from './grain';

export type { PlatformConnector, FetchTranscriptResult, PlatformMeta, PlatformRecording } from './types';

/**
 * Registry mapping platform names to their connector implementations.
 */
const connectorRegistry: Record<IntegrationPlatform, PlatformConnector> = {
  fireflies: firefliesConnector,
  grain: grainConnector,
};

/**
 * Returns the platform connector for the given platform.
 * Throws if the platform is not supported.
 */
export function getConnector(platform: IntegrationPlatform): PlatformConnector {
  const connector = connectorRegistry[platform];
  if (!connector) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return connector;
}
