export interface IntegrationInfo {
  id: string;
  userId: string;
  platform: 'fireflies' | 'grain';
  status: 'connected' | 'expired' | 'disconnected';
  label: string | null;
  webhookUrl: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConfig {
  platform: 'fireflies' | 'grain';
  name: string;
  description: string;
  authType: 'api_key' | 'oauth2';
}

export const PLATFORMS: PlatformConfig[] = [
  {
    platform: 'fireflies',
    name: 'Fireflies.ai',
    description: 'AI meeting assistant. Automatically transcribes and summarizes meetings.',
    authType: 'api_key',
  },
  {
    platform: 'grain',
    name: 'Grain',
    description: 'Video meeting recorder with AI-powered highlights and notes.',
    authType: 'oauth2',
  },
];
