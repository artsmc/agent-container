/**
 * Workspace Router
 *
 * Takes a resolved WorkspaceConfig (workspaceId + projectId) from the
 * task-transitions layer and enriches it with the Asana access token
 * and custom field GID configuration from the database.
 *
 * Throws AdapterError(WORKSPACE_NOT_CONFIGURED) if the workspace record
 * is not found or its custom field configuration is incomplete.
 */

import { eq } from 'drizzle-orm';
import { asanaWorkspaces } from '@iexcel/database/schema';
import { ApiErrorCode } from '@iexcel/shared-types';
import type { DbClient } from '../../db/client';
import type { WorkspaceConfig } from '../../services/task-types';
import { AdapterError } from './errors';

/**
 * Custom field GID configuration per Asana workspace.
 */
export interface CustomFieldGidConfig {
  clientFieldGid: string;
  scrumStageFieldGid: string;
  estimatedTimeFieldGid: string;
  estimatedTimeFormat: 'h_m' | 'hh_mm';
}

/**
 * Fully resolved routing information for an Asana push operation.
 */
export interface ResolvedRouting {
  workspaceGid: string;
  projectGid: string;
  accessToken: string;
  customFieldConfig: CustomFieldGidConfig;
}

const REQUIRED_CONFIG_KEYS: (keyof Omit<CustomFieldGidConfig, 'estimatedTimeFormat'>)[] = [
  'clientFieldGid',
  'scrumStageFieldGid',
  'estimatedTimeFieldGid',
];

/**
 * Returns the list of missing required keys in the custom field configuration.
 */
function getMissingConfigKeys(config: Record<string, unknown>): string[] {
  return REQUIRED_CONFIG_KEYS.filter(
    (key) => !config[key] || typeof config[key] !== 'string',
  );
}

/**
 * Resolves full routing information for an Asana push.
 *
 * The workspace/project GIDs are already resolved by the task-transitions
 * layer. This function fetches the corresponding Asana workspace record
 * to obtain the access token and custom field GID configuration.
 *
 * @throws AdapterError with code WORKSPACE_NOT_CONFIGURED if:
 *   - The workspace GID does not match any record in the database.
 *   - The custom field configuration is incomplete (missing required GIDs).
 */
export async function resolveRouting(
  workspace: WorkspaceConfig,
  db: DbClient,
): Promise<ResolvedRouting> {
  const workspaceGid = workspace.workspaceId;
  const projectGid = workspace.projectId;

  // Fetch the workspace record from the database
  const rows = await db
    .select()
    .from(asanaWorkspaces)
    .where(eq(asanaWorkspaces.asanaWorkspaceId, workspaceGid))
    .limit(1);

  const wsRecord = rows[0];
  if (!wsRecord) {
    throw new AdapterError(
      ApiErrorCode.WorkspaceNotConfigured,
      'Configured Asana workspace GID not found in database.',
      422,
      { workspaceGid },
    );
  }

  // Parse and validate custom field config
  const rawConfig = (wsRecord.customFieldConfig ?? {}) as Record<string, unknown>;
  const missingFields = getMissingConfigKeys(rawConfig);

  if (missingFields.length > 0) {
    throw new AdapterError(
      ApiErrorCode.WorkspaceNotConfigured,
      'Asana workspace custom field GID configuration is incomplete.',
      422,
      { workspaceGid, missingFields },
    );
  }

  const customFieldConfig: CustomFieldGidConfig = {
    clientFieldGid: rawConfig['clientFieldGid'] as string,
    scrumStageFieldGid: rawConfig['scrumStageFieldGid'] as string,
    estimatedTimeFieldGid: rawConfig['estimatedTimeFieldGid'] as string,
    estimatedTimeFormat:
      rawConfig['estimatedTimeFormat'] === 'hh_mm' ? 'hh_mm' : 'h_m',
  };

  return {
    workspaceGid,
    projectGid: projectGid ?? workspaceGid, // fallback to workspace if no project
    accessToken: wsRecord.accessTokenRef,
    customFieldConfig,
  };
}
