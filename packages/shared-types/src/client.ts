export interface EmailRecipient {
  name: string;
  email: string;
  role?: string;
}

export type EmailRecipients = EmailRecipient[];

export interface Client {
  id: string;
  name: string;
  grainPlaylistId: string | null;
  defaultAsanaWorkspaceId: string | null;
  defaultAsanaProjectId: string | null;
  emailRecipients: EmailRecipients;
  createdAt: string;
  updatedAt: string;
}

export interface AsanaWorkspace {
  id: string;
  asanaWorkspaceId: string;
  name: string;
  /**
   * A reference key for the access token stored in the cloud secret manager.
   * This is NOT the token itself — never log or expose this value to clients.
   */
  accessTokenRef: string;
  createdAt: string;
}

export interface UpdateClientRequest {
  name?: string;
  grainPlaylistId?: string;
  defaultAsanaWorkspaceId?: string;
  defaultAsanaProjectId?: string;
  emailRecipients?: EmailRecipients;
}
