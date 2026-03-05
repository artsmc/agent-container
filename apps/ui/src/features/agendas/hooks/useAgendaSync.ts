'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { AgendaDetail } from '../types'
import { pollAgendaUpdates } from '../actions'

const POLL_INTERVAL = 5000

/**
 * Hook for polling-based collaborative sync.
 *
 * Polls `GET /agendas/{id}` every 5 seconds to detect updates
 * from other users. Calls `onRemoteUpdate` when a newer version
 * is detected. The hook is disabled for finalized/shared agendas.
 *
 * Designed to be swappable for a WebSocket implementation in V2.
 */
export function useAgendaSync(
  agendaId: string,
  currentVersion: number,
  onRemoteUpdate: (agenda: AgendaDetail) => void,
  enabled: boolean
): void {
  const onRemoteUpdateRef = useRef(onRemoteUpdate)
  const versionRef = useRef(currentVersion)

  useEffect(() => {
    onRemoteUpdateRef.current = onRemoteUpdate
  }, [onRemoteUpdate])

  useEffect(() => {
    versionRef.current = currentVersion
  }, [currentVersion])

  const poll = useCallback(async () => {
    const result = await pollAgendaUpdates(agendaId, versionRef.current)
    if (!result.notModified && result.agenda) {
      onRemoteUpdateRef.current(result.agenda)
    }
  }, [agendaId])

  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [enabled, poll])
}
