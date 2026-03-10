'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Client } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'
import { Badge } from '@/components/Badge'
import type { BadgeProps } from '@/components/Badge'
import { Button } from '@/components/Button'
import styles from './transcriptDetail.module.scss'

interface TranscriptDetailClientProps {
  transcript: Record<string, unknown>
  clients: Client[]
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(iso))
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(iso))
}

function formatCallType(ct: string): string { return ct.replace(/_/g, ' ') }

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface NormalizedSegments {
  source?: string; sourceId?: string; meetingDate?: string
  clientId?: string; meetingType?: string; participants?: string[]
  durationSeconds?: number
  segments?: Array<{ speaker: string; timestamp: number; text: string }>
  summary?: string | null; highlights?: string[] | null
}

function g<T>(obj: Record<string, unknown>, camel: string, snake: string): T | undefined {
  return (obj[camel] ?? obj[snake]) as T | undefined
}

// Unwrap API envelope: { success, data: T } → T
function unwrap<T>(res: unknown): T {
  const r = res as Record<string, unknown>
  if (r && typeof r === 'object' && 'data' in r) return r.data as T
  return res as T
}

type WfStatus = 'pending' | 'running' | 'completed' | 'failed'

interface WorkflowRun {
  workflow_run_id: string
  status: WfStatus
  error?: { code?: string; message?: string } | null
  result?: { tasks_created?: number; tasks_attempted?: number; explanation?: string } | null
  started_at?: string
  updated_at?: string
  completed_at?: string | null
}

const WF_BADGE: Record<string, BadgeProps['variant']> = {
  pending: 'warning', running: 'info', completed: 'success', failed: 'danger',
}

export default function TranscriptDetailClient({ transcript: raw, clients }: TranscriptDetailClientProps) {
  const router = useRouter()

  const id = raw.id as string
  const clientId = g<string>(raw, 'clientId', 'client_id') ?? ''
  const callType = g<string>(raw, 'callType', 'call_type') ?? ''
  const callDate = g<string>(raw, 'callDate', 'call_date') ?? ''
  const rawTranscript = g<string>(raw, 'rawTranscript', 'raw_transcript') ?? ''
  const processedAt = g<string>(raw, 'processedAt', 'processed_at') ?? null
  const createdAt = g<string>(raw, 'createdAt', 'created_at') ?? ''
  const grainCallId = g<string>(raw, 'grainCallId', 'grain_call_id') ?? null
  const normalized = g<NormalizedSegments>(raw, 'normalizedSegments', 'normalized_segments') ?? null

  const segments = normalized?.segments ?? []
  const highlights = normalized?.highlights ?? []
  const summary = normalized?.summary ?? null
  const participants = normalized?.participants ?? []
  const durationSeconds = normalized?.durationSeconds ?? null

  const [selectedClientId, setSelectedClientId] = useState(clientId)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [wf, setWf] = useState<WorkflowRun | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  const statusBadge = processedAt
    ? { label: 'Processed', variant: 'success' as BadgeProps['variant'] }
    : { label: 'Pending', variant: 'warning' as BadgeProps['variant'] }
  const clientChanged = selectedClientId !== clientId
  const canProcess = !!selectedClientId && !processedAt
  const wfActive = wf && (wf.status === 'pending' || wf.status === 'running')

  // Poll workflow status
  useEffect(() => {
    if (!wf || !wfActive) return
    pollCountRef.current = 0

    const poll = async () => {
      pollCountRef.current++
      try {
        const api = getBrowserApiClient()
        const res = await api.getWorkflowStatus(wf.workflow_run_id)
        const data = unwrap<WorkflowRun>(res)
        setWf(data)

        if (data.status === 'completed' || data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          if (data.status === 'completed') {
            router.refresh()
          }
        }
      } catch {
        // Continue polling
      }
    }

    // Poll immediately, then every 2s
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [wf?.workflow_run_id, wfActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAssignClient = useCallback(async () => {
    if (!selectedClientId) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const api = getBrowserApiClient()
      await api.updateTranscript(id, { client_id: selectedClientId })
      setSuccess('Client assigned successfully')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign client')
    } finally { setSaving(false) }
  }, [id, selectedClientId, router])

  const handleProcess = useCallback(async () => {
    const cid = selectedClientId || clientId
    if (!cid) { setError('Please assign a client before processing'); return }
    setProcessing(true); setError(null); setSuccess(null); setWf(null)
    try {
      const api = getBrowserApiClient()
      if (clientChanged && selectedClientId) {
        await api.updateTranscript(id, { client_id: selectedClientId })
      }
      const res = await api.triggerIntakeWorkflow({ client_id: cid, transcript_id: id } as any)
      const data = unwrap<WorkflowRun>(res)
      setWf(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start processing')
    } finally { setProcessing(false) }
  }, [id, selectedClientId, clientId, clientChanged])

  const busy = saving || processing

  // Elapsed time display
  const elapsed = wf?.started_at
    ? Math.round((Date.now() - new Date(wf.started_at).getTime()) / 1000)
    : 0

  return (
    <div className={styles.page} data-testid="transcript-detail">
      <div className={styles.header}>
        <Link href="/transcripts" className={styles.backLink}>&larr; Back to transcripts</Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{formatCallType(callType)} &mdash; {formatDate(callDate)}</h1>
        </div>
        <div className={styles.meta}>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          {clientId && <Link href={`/clients/${clientId}`} className={styles.metaItem}>View Client</Link>}
          {grainCallId && <span className={styles.metaItem}>Grain: {grainCallId}</span>}
          {durationSeconds !== null && <span className={styles.metaItem}>Duration: {formatTimestamp(durationSeconds)}</span>}
          {participants.length > 0 && <span className={styles.metaItem}>Participants: {participants.join(', ')}</span>}
          {processedAt && <span className={styles.metaItem}>Processed: {formatDateTime(processedAt)}</span>}
          <span className={styles.metaItem}>Created: {formatDateTime(createdAt)}</span>
        </div>
      </div>

      <div className={styles.columns}>
        {/* ── Left column: actions, progress, summary, highlights, segments ── */}
        <div className={styles.leftCol}>
          {/* Client Assignment + Process */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Client Assignment</h2>
            <div className={styles.assignRow}>
              <select
                className={styles.clientSelect}
                value={selectedClientId}
                onChange={(e) => { setSelectedClientId(e.target.value); setError(null); setSuccess(null) }}
                disabled={busy || !!wfActive}
              >
                <option value="">-- Select a client --</option>
                {clients.map((c) => {
                  const cr = c as unknown as Record<string, unknown>
                  return <option key={cr.id as string} value={cr.id as string}>{cr.name as string}</option>
                })}
              </select>
              {clientChanged && selectedClientId && (
                <Button variant="secondary" size="sm" onClick={handleAssignClient} disabled={busy || !!wfActive}>
                  {saving ? 'Saving...' : 'Assign Client'}
                </Button>
              )}
              {canProcess && !wfActive && (
                <Button variant="primary" size="sm" onClick={handleProcess} disabled={busy}>
                  {processing ? 'Starting...' : 'Process Transcript'}
                </Button>
              )}
            </div>
            {error && <p className={styles.errorMessage}>{error}</p>}
            {success && !wf && <p className={styles.successMessage}>{success}</p>}
          </div>

          {/* Workflow Progress Tracker */}
          {wf && (
            <div className={styles.progressCard} data-testid="workflow-progress">
              <div className={styles.progressHeader}>
                <h2 className={styles.sectionTitle}>Processing Status</h2>
                <Badge variant={WF_BADGE[wf.status] ?? 'default'}>{wf.status}</Badge>
              </div>

              <div className={styles.steps}>
                <Step
                  label="Triggered"
                  status={wf.status === 'pending' ? 'active' : 'done'}
                  detail={wf.started_at ? `Started ${formatDateTime(wf.started_at)}` : undefined}
                />
                <Step
                  label="Processing transcript"
                  status={
                    wf.status === 'running' ? 'active'
                      : wf.status === 'completed' || wf.status === 'failed' ? (wf.status === 'completed' ? 'done' : 'error')
                        : 'waiting'
                  }
                  detail={wfActive ? `${elapsed}s elapsed...` : undefined}
                />
                <Step
                  label="Extracting tasks"
                  status={
                    wf.status === 'completed' ? 'done'
                      : wf.status === 'failed' ? 'error'
                        : 'waiting'
                  }
                  detail={
                    wf.status === 'completed' && wf.result
                      ? `${wf.result.tasks_created ?? 0} tasks created`
                      : undefined
                  }
                />
              </div>

              {wf.status === 'completed' && wf.result && (
                <div className={styles.progressResult}>
                  {wf.result.tasks_created === 0
                    ? <p className={styles.progressNote}>{wf.result.explanation || 'No tasks found in this transcript.'}</p>
                    : <p className={styles.progressNote}>{wf.result.tasks_created} task(s) extracted. <Link href={`/clients/${clientId}?tab=tasks`}>View tasks</Link></p>
                  }
                </div>
              )}

              {wf.status === 'failed' && wf.error && (
                <div className={styles.progressError}>
                  <strong>{wf.error.code || 'Error'}:</strong> {wf.error.message || 'Processing failed'}
                </div>
              )}
            </div>
          )}

          {summary && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Summary</h2>
              <p className={styles.sectionBody}>{summary}</p>
            </div>
          )}

          {highlights.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Highlights</h2>
              <ul className={styles.highlightList}>
                {highlights.map((h, i) => <li key={i} className={styles.highlightItem}>{h}</li>)}
              </ul>
            </div>
          )}

          {segments.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Transcript Segments</h2>
              <div className={styles.segmentList}>
                {segments.map((seg, i) => (
                  <div key={i} className={styles.segment}>
                    <span className={styles.segmentTime}>{formatTimestamp(seg.timestamp)}</span>
                    <span className={styles.segmentSpeaker}>{seg.speaker}</span>
                    <span className={styles.segmentText}>{seg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: raw transcript ── */}
        {rawTranscript && (
          <div className={styles.rightCol}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Raw Transcript</h2>
              <p className={styles.sectionBody}>{rawTranscript}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Step component =====

type StepStatus = 'waiting' | 'active' | 'done' | 'error'

function Step({ label, status, detail }: { label: string; status: StepStatus; detail?: string }) {
  return (
    <div className={`${styles.step} ${styles[`step_${status}`]}`}>
      <div className={styles.stepIcon}>
        {status === 'active' && <span className={styles.spinner} />}
        {status === 'done' && <span className={styles.checkmark}>&#10003;</span>}
        {status === 'error' && <span className={styles.crossmark}>&#10007;</span>}
        {status === 'waiting' && <span className={styles.dot} />}
      </div>
      <div className={styles.stepContent}>
        <span className={styles.stepLabel}>{label}</span>
        {detail && <span className={styles.stepDetail}>{detail}</span>}
      </div>
    </div>
  )
}
