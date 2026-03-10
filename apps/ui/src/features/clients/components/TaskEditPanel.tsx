'use client'

/**
 * TaskEditPanel -- Modal content for viewing and editing a single task.
 *
 * Provides editable fields for title, description sections,
 * assignee, estimated_time, and scrum_stage.
 * Actions: Approve, Delete (reject), Push, Save.
 */

import { useState, useEffect, useCallback } from 'react'
import type { NormalizedTask, TaskDescription } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import styles from './TaskEditPanel.module.scss'

interface TaskEditPanelProps {
  task: NormalizedTask
  onSaved: () => void
  onClose: () => void
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'default',
  approved: 'success',
  rejected: 'danger',
  pushed: 'info',
  completed: 'primary',
}

function getField<T>(obj: Record<string, unknown>, camel: string, snake: string): T | undefined {
  return (obj[camel] ?? obj[snake]) as T | undefined
}

function isoToHHMM(val: string | null): string {
  if (!val) return ''
  if (/^\d{2,}:\d{2}$/.test(val)) return val
  const m = val.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/)
  if (!m) return val
  const h = m[1] ? parseInt(m[1], 10) : 0
  const min = m[2] ? parseInt(m[2], 10) : 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export default function TaskEditPanel({ task, onSaved, onClose }: TaskEditPanelProps) {
  const raw = task as unknown as Record<string, unknown>
  const status = (task.status ?? getField<string>(raw, 'status', 'status')) as string
  const estimatedTimeRaw = getField<string>(raw, 'estimatedTime', 'estimated_time') ?? null
  const scrumStageRaw = getField<string>(raw, 'scrumStage', 'scrum_stage') ?? ''

  const descRaw = (task.description ?? {}) as Record<string, unknown>
  const descTaskContext = (descRaw.taskContext ?? descRaw.task_context ?? '') as string
  const descAdditionalContext = (descRaw.additionalContext ?? descRaw.additional_context ?? '') as string
  const descRequirements = (descRaw.requirements ?? []) as string[]

  const [title, setTitle] = useState(task.title ?? '')
  const [taskContext, setTaskContext] = useState(descTaskContext)
  const [additionalContext, setAdditionalContext] = useState(descAdditionalContext)
  const [requirements, setRequirements] = useState(descRequirements.join('\n'))
  const [assignee, setAssignee] = useState(task.assignee ?? '')
  const [estimatedTime, setEstimatedTime] = useState(isoToHHMM(estimatedTimeRaw))
  const [scrumStage, setScrumStage] = useState(scrumStageRaw)

  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setTitle(task.title ?? '')
    setTaskContext(descTaskContext)
    setAdditionalContext(descAdditionalContext)
    setRequirements(descRequirements.join('\n'))
    setAssignee(task.assignee ?? '')
    setEstimatedTime(isoToHHMM(estimatedTimeRaw))
    setScrumStage(scrumStageRaw)
    setErrorMsg(null)
  }, [task.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    setSaving(true)
    setErrorMsg(null)
    try {
      const api = getBrowserApiClient()
      const description: Partial<TaskDescription> = {
        taskContext,
        additionalContext,
        requirements: requirements.split('\n').map((r) => r.trim()).filter(Boolean),
      }
      await api.updateTask(task.id, {
        title,
        description,
        assignee: assignee || undefined,
        estimated_time: estimatedTime || undefined,
        scrum_stage: scrumStage || undefined,
      } as any)
      onSaved()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [task.id, title, taskContext, additionalContext, requirements, assignee, estimatedTime, scrumStage, onSaved])

  const handleAction = useCallback(async (action: 'approve' | 'reject' | 'push') => {
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const api = getBrowserApiClient()
      if (action === 'approve') await api.approveTask(task.id)
      else if (action === 'reject') await api.rejectTask(task.id, { reason: 'Deleted from board' })
      else if (action === 'push') await api.pushTask(task.id)
      onSaved()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `Failed to ${action}`)
    } finally {
      setActionLoading(false)
    }
  }, [task.id, onSaved])

  const readonly = status === 'pushed' || status === 'completed'
  const busy = saving || actionLoading

  return (
    <div className={styles.root} data-testid="task-edit-panel">
      {/* Status indicator */}
      <div className={styles.statusRow}>
        <span className={styles.statusLabel}>Status:</span>
        <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>
      </div>

      {/* Editable fields */}
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-context">Task Context</label>
          <textarea
            id="task-context"
            className={styles.textarea}
            value={taskContext}
            onChange={(e) => setTaskContext(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-additional-context">Additional Context</label>
          <textarea
            id="task-additional-context"
            className={styles.textarea}
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-requirements">Requirements (one per line)</label>
          <textarea
            id="task-requirements"
            className={styles.textarea}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-assignee">Assignee</label>
          <input
            id="task-assignee"
            className={styles.input}
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-estimated-time">
            Estimated Time (HH:MM)
          </label>
          <input
            id="task-estimated-time"
            className={styles.input}
            type="text"
            placeholder="02:30"
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
            disabled={busy || readonly}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="task-scrum-stage">Scrum Stage</label>
          <input
            id="task-scrum-stage"
            className={styles.input}
            type="text"
            value={scrumStage}
            onChange={(e) => setScrumStage(e.target.value)}
            disabled={busy || readonly}
          />
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {errorMsg && <p className={styles.errorMessage} data-testid="task-edit-error">{errorMsg}</p>}

        {readonly ? (
          <div className={styles.saveRow}>
            <span className={styles.readonlyHint}>Read-only — this task has been pushed.</span>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className={styles.actionButtons}>
              {status === 'draft' && (
                <Button variant="primary" size="sm" onClick={() => handleAction('approve')} disabled={busy}>
                  Approve
                </Button>
              )}
              {status === 'approved' && (
                <Button variant="primary" size="sm" onClick={() => handleAction('push')} disabled={busy}>
                  Push
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => handleAction('reject')} disabled={busy}>
                Delete
              </Button>
            </div>
            <div className={styles.saveRow}>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={busy}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
