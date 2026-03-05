import { describe, it, expect, vi } from 'vitest';

// Mock env before importing anything that uses it
vi.mock('../config/env.js', () => ({
  env: {
    API_BASE_URL: 'http://localhost:3000',
    AUTH_ISSUER_URL: 'http://localhost:4000',
    MASTRA_CLIENT_ID: 'test-client',
    MASTRA_CLIENT_SECRET: 'test-secret',
    LLM_API_KEY: 'test-key',
    LLM_PROVIDER: 'anthropic',
    LLM_MODEL: 'claude-sonnet-4-20250514',
    MASTRA_PORT: 8081,
    MASTRA_HOST: '0.0.0.0',
    NODE_ENV: 'test',
    OTEL_SERVICE_NAME: 'iexcel-mastra',
  },
}));

// Mock api-client
vi.mock('../api-client.js', () => ({
  getApiClient: vi.fn(),
}));

import { intakeOutputSchema, intakeAgent } from './intake-agent.js';

describe('intakeAgent', () => {
  it('has the correct id', () => {
    expect(intakeAgent.id).toBe('intake-agent');
  });

  it('has the correct name', () => {
    expect(intakeAgent.name).toBe('Intake Agent');
  });
});

describe('intakeOutputSchema', () => {
  it('accepts valid LLM output with tasks', () => {
    const valid = {
      tasks: [
        {
          title: 'Update proposal with Q2 pricing',
          description: {
            taskContext: 'During the intake call on February 15, 2026...',
            additionalContext: 'Q2 pricing changes were discussed...',
            requirements: ['Update pricing table', 'Send for review'],
          },
          assignee: 'Mark',
          estimatedTime: 'PT2H',
          scrumStage: 'Backlog' as const,
          tags: ['pricing'],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts valid output with empty tasks and explanation', () => {
    const valid = {
      tasks: [],
      explanation: 'No action items found.',
    };

    const result = intakeOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts null assignee', () => {
    const valid = {
      tasks: [
        {
          title: 'Check analytics dashboard',
          description: {
            taskContext: 'Context text',
            additionalContext: 'Additional context',
            requirements: ['Check dashboard access'],
          },
          assignee: null,
          estimatedTime: 'PT1H',
          scrumStage: 'Backlog' as const,
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts null estimatedTime', () => {
    const valid = {
      tasks: [
        {
          title: 'Quick check',
          description: {
            taskContext: 'Context',
            additionalContext: 'Additional',
            requirements: ['Step 1'],
          },
          assignee: null,
          estimatedTime: null,
          scrumStage: 'Backlog' as const,
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects missing description sections', () => {
    const invalid = {
      tasks: [
        {
          title: 'Test task',
          description: {
            taskContext: 'Context',
            // missing additionalContext and requirements
          },
          assignee: null,
          estimatedTime: null,
          scrumStage: 'Backlog',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects empty description fields', () => {
    const invalid = {
      tasks: [
        {
          title: 'Test task',
          description: {
            taskContext: '',
            additionalContext: 'Additional',
            requirements: ['Req'],
          },
          assignee: null,
          estimatedTime: null,
          scrumStage: 'Backlog',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid estimatedTime format', () => {
    const invalid = {
      tasks: [
        {
          title: 'Test task',
          description: {
            taskContext: 'Context',
            additionalContext: 'Additional',
            requirements: ['Req'],
          },
          assignee: null,
          estimatedTime: '2:30', // Wrong format
          scrumStage: 'Backlog',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects scrumStage other than Backlog', () => {
    const invalid = {
      tasks: [
        {
          title: 'Test task',
          description: {
            taskContext: 'Context',
            additionalContext: 'Additional',
            requirements: ['Req'],
          },
          assignee: null,
          estimatedTime: 'PT1H',
          scrumStage: 'In Progress',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 255 characters', () => {
    const invalid = {
      tasks: [
        {
          title: 'x'.repeat(256),
          description: {
            taskContext: 'Context',
            additionalContext: 'Additional',
            requirements: ['Req'],
          },
          assignee: null,
          estimatedTime: 'PT1H',
          scrumStage: 'Backlog',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects empty requirements array', () => {
    const invalid = {
      tasks: [
        {
          title: 'Test task',
          description: {
            taskContext: 'Context',
            additionalContext: 'Additional',
            requirements: [],
          },
          assignee: null,
          estimatedTime: 'PT1H',
          scrumStage: 'Backlog',
          tags: [],
        },
      ],
    };

    const result = intakeOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
