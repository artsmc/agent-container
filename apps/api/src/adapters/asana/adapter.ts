/**
 * Asana Output Adapter
 *
 * Implements the OutputNormalizerService interface from Feature 11.
 * Orchestrates all sub-modules to push a normalized task to Asana:
 *
 *   1. Resolve workspace routing (access token + custom field config)
 *   2. Validate title
 *   3. Format description
 *   4. Resolve assignee GID
 *   5. Resolve custom field enum values (Client, Scrum Stage, Estimated Time)
 *   6. Build Asana API payload
 *   7. Create task via Asana REST API with retry
 *   8. Return ExternalRefResponse (caller writes to database)
 *
 * This class is stateless per invocation. All mutable state (caches)
 * lives in the resolver modules and is safe for concurrent access.
 */

import { ApiErrorCode } from '@iexcel/shared-types';
import type { DbClient } from '../../db/client';
import type {
  OutputNormalizerService,
} from '../../services/output-normalizer';
import type {
  NormalizedTaskPayload,
  WorkspaceConfig,
  ExternalRefResponse,
} from '../../services/task-types';
import { AdapterError } from './errors';
import { formatDescriptionForAsana } from './description-formatter';
import { formatEstimatedTime } from './estimated-time-formatter';
import { resolveRouting } from './workspace-router';
import { resolveAssigneeGid } from './assignee-resolver';
import { resolveEnumOptionGid } from './custom-field-resolver';
import { createTaskWithRetry } from './asana-client';
import type { AsanaCreateTaskPayload } from './asana-client';
import { logger } from './logger';

export class AsanaOutputAdapter implements OutputNormalizerService {
  constructor(private readonly db: DbClient) {}

  async pushTask(params: {
    task: NormalizedTaskPayload;
    workspace: WorkspaceConfig;
  }): Promise<ExternalRefResponse> {
    const { task, workspace } = params;

    // 1. Validate title
    if (!task.title || task.title.trim().length === 0) {
      throw new AdapterError(
        ApiErrorCode.ValidationError,
        'Task title is required to create an Asana task',
        422,
      );
    }

    // 2. Resolve routing (access token + custom field GID config)
    const routing = await resolveRouting(workspace, this.db);

    logger.info(
      {
        workspaceGid: routing.workspaceGid,
        projectGid: routing.projectGid,
      },
      'Push attempt started',
    );

    // 3. Format description for Asana notes field
    const notes = formatDescriptionForAsana(task.description);

    // 4. Resolve assignee GID
    const assigneeGid = await resolveAssigneeGid(
      task.assignee,
      routing.workspaceGid,
      routing.accessToken,
    );

    // 5. Resolve custom field values
    const customFields: Record<string, string> = {};
    let customFieldCount = 0;

    // 5a. Client enum field
    const clientEnumGid = await resolveEnumOptionGid(
      routing.customFieldConfig.clientFieldGid,
      task.client_name,
      routing.accessToken,
      'Client',
    );
    if (clientEnumGid) {
      customFields[routing.customFieldConfig.clientFieldGid] = clientEnumGid;
      customFieldCount++;
    }

    // 5b. Scrum Stage enum field (defaults to "Backlog" when null)
    const scrumStageValue = task.scrum_stage || 'Backlog';
    const scrumStageEnumGid = await resolveEnumOptionGid(
      routing.customFieldConfig.scrumStageFieldGid,
      scrumStageValue,
      routing.accessToken,
      'Scrum Stage',
    );
    if (scrumStageEnumGid) {
      customFields[routing.customFieldConfig.scrumStageFieldGid] =
        scrumStageEnumGid;
      customFieldCount++;
    }

    // 5c. Estimated Time text field
    if (task.estimated_time) {
      const formattedTime = formatEstimatedTime(
        task.estimated_time,
        routing.customFieldConfig.estimatedTimeFormat,
      );
      if (formattedTime) {
        customFields[routing.customFieldConfig.estimatedTimeFieldGid] =
          formattedTime;
        customFieldCount++;
      }
    }

    // 6. Build Asana API payload
    const payload: AsanaCreateTaskPayload = {
      workspace: routing.workspaceGid,
      projects: [routing.projectGid],
      name: task.title,
      notes,
      custom_fields: customFields,
      ...(assigneeGid ? { assignee: assigneeGid } : {}),
    };

    logger.debug(
      {
        workspaceGid: routing.workspaceGid,
        projectGid: routing.projectGid,
        hasAssignee: !!assigneeGid,
        customFieldCount,
      },
      'Asana API call prepared',
    );

    // 7. Create task in Asana
    const asanaResponse = await createTaskWithRetry(
      payload,
      routing.accessToken,
    );

    logger.info(
      {
        asanaTaskGid: asanaResponse.data.gid,
        permalinkUrl: asanaResponse.data.permalink_url,
      },
      'Task pushed to Asana successfully',
    );

    // 8. Return ExternalRefResponse (caller writes to database)
    return {
      system: 'asana',
      externalId: asanaResponse.data.gid,
      externalUrl: asanaResponse.data.permalink_url,
      workspaceId: routing.workspaceGid,
      projectId: routing.projectGid,
    };
  }
}
