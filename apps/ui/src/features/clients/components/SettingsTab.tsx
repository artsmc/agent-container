'use client'

/**
 * SettingsTab -- Editable client configuration form.
 *
 * Fields: Asana workspace dropdown, project dropdown (cascading),
 * email recipients (TagInput), routing rules textarea.
 * Dirty-state detection exposed to parent via onDirtyChange callback.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Client, UpdateClientRequest } from '@iexcel/shared-types'
import { useAsanaWorkspaces } from '../hooks/useAsanaWorkspaces'
import { useAsanaProjects } from '../hooks/useAsanaProjects'
import { getBrowserApiClient } from '@/lib/api-client-browser'
import { Button } from '@/components/Button'
import { TagInput } from '@/components/TagInput'
import styles from './SettingsTab.module.scss'

interface SettingsTabProps {
  client: Client
  onDirtyChange: (isDirty: boolean) => void
}

interface SettingsFormState {
  workspaceId: string | null
  projectId: string | null
  emailRecipients: string[]
  routingRules: string
}

function buildInitialState(client: Client): SettingsFormState {
  return {
    workspaceId: client.defaultAsanaWorkspaceId,
    projectId: client.defaultAsanaProjectId,
    emailRecipients: client.emailRecipients.map((r) => r.email),
    routingRules: '',
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value: string): string | null {
  if (!EMAIL_REGEX.test(value)) {
    return 'Invalid email address'
  }
  return null
}

export default function SettingsTab({ client, onDirtyChange }: SettingsTabProps) {
  const [savedSettings, setSavedSettings] = useState<SettingsFormState>(() =>
    buildInitialState(client)
  )
  const [formState, setFormState] = useState<SettingsFormState>(() =>
    buildInitialState(client)
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: workspaces, loading: workspacesLoading } = useAsanaWorkspaces()
  const { data: projects, loading: projectsLoading } = useAsanaProjects(
    formState.workspaceId
  )

  // Dirty detection
  const isDirty = JSON.stringify(formState) !== JSON.stringify(savedSettings)

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  // Cleanup success timer
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const handleWorkspaceChange = useCallback((workspaceId: string) => {
    setFormState((prev) => ({
      ...prev,
      workspaceId: workspaceId || null,
      projectId: null, // Reset project when workspace changes
    }))
  }, [])

  const handleProjectChange = useCallback((projectId: string) => {
    setFormState((prev) => ({
      ...prev,
      projectId: projectId || null,
    }))
  }, [])

  const handleRecipientsChange = useCallback((values: string[]) => {
    setFormState((prev) => ({
      ...prev,
      emailRecipients: values,
    }))
  }, [])

  const handleRoutingRulesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setFormState((prev) => ({
        ...prev,
        routingRules: e.target.value,
      }))
    },
    []
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const body: UpdateClientRequest = {}

      if (formState.workspaceId !== savedSettings.workspaceId) {
        body.defaultAsanaWorkspaceId = formState.workspaceId ?? undefined
      }
      if (formState.projectId !== savedSettings.projectId) {
        body.defaultAsanaProjectId = formState.projectId ?? undefined
      }
      if (
        JSON.stringify(formState.emailRecipients) !==
        JSON.stringify(savedSettings.emailRecipients)
      ) {
        body.emailRecipients = formState.emailRecipients.map((email) => ({
          name: '',
          email,
        }))
      }

      const apiClient = getBrowserApiClient()
      await apiClient.updateClient(client.id, body)

      setSavedSettings({ ...formState })
      setSaveSuccess(true)

      // Auto-hide success message after 3 seconds
      successTimerRef.current = setTimeout(() => {
        setSaveSuccess(false)
      }, 3000)
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save settings'
      )
    } finally {
      setSaving(false)
    }
  }, [formState, savedSettings, client.id])

  return (
    <div className={styles.container} data-testid="settings-tab">
      <div className={styles.field}>
        <label htmlFor="settings-workspace" className={styles.label}>
          Default Asana Workspace
        </label>
        <select
          id="settings-workspace"
          className={styles.select}
          value={formState.workspaceId ?? ''}
          onChange={(e) => handleWorkspaceChange(e.target.value)}
          disabled={workspacesLoading}
        >
          <option value="">
            {workspacesLoading ? 'Loading workspaces...' : 'Select workspace'}
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="settings-project" className={styles.label}>
          Default Asana Project
        </label>
        <select
          id="settings-project"
          className={styles.select}
          value={formState.projectId ?? ''}
          onChange={(e) => handleProjectChange(e.target.value)}
          disabled={!formState.workspaceId || projectsLoading}
        >
          <option value="">
            {!formState.workspaceId
              ? 'Select a workspace first'
              : projectsLoading
                ? 'Loading projects...'
                : 'Select project'}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Email Recipients</label>
        <TagInput
          values={formState.emailRecipients}
          onChange={handleRecipientsChange}
          validate={validateEmail}
          placeholder="Add email address and press Enter"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="settings-routing" className={styles.label}>
          Routing Rules
        </label>
        <textarea
          id="settings-routing"
          className={styles.textarea}
          value={formState.routingRules}
          onChange={handleRoutingRulesChange}
          placeholder="Enter routing rules (JSON format)"
          rows={4}
        />
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>

        {saveSuccess && (
          <span className={styles.successMessage} role="status">
            Settings saved successfully.
          </span>
        )}

        {saveError && (
          <span className={styles.errorMessage} role="alert">
            {saveError}
          </span>
        )}
      </div>
    </div>
  )
}
