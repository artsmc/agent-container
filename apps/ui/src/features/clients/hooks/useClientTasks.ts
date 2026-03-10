'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GetTasksResponse } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'

/** Map from transcript_id -> call_date ISO string */
export type TranscriptDateMap = Record<string, string>

/**
 * Fetches the 10 most recent tasks for a client, plus a transcript date
 * lookup so the UI can show which meeting each task came from.
 *
 * Only fires when `enabled` is true -- designed for lazy tab loading.
 */
export function useClientTasks(clientId: string, enabled: boolean) {
  const [data, setData] = useState<GetTasksResponse | null>(null)
  const [transcriptDates, setTranscriptDates] = useState<TranscriptDateMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fetchCount, setFetchCount] = useState(0)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    async function doFetch() {
      setLoading(true)
      setError(null)
      try {
        const apiClient = getBrowserApiClient()
        const [tasksResponse, transcriptsResponse] = await Promise.all([
          apiClient.listTasks(clientId, { limit: 10 }),
          apiClient.listTranscripts(clientId).catch(() => null),
        ])
        if (!cancelled) {
          setData(tasksResponse)
          // Build transcript_id -> call_date map
          if (transcriptsResponse) {
            const dateMap: TranscriptDateMap = {}
            const items = (transcriptsResponse as any)?.data ?? []
            for (const t of items) {
              const id = t.id as string
              const callDate = (t.callDate ?? t.call_date ?? '') as string
              if (id && callDate) dateMap[id] = callDate
            }
            setTranscriptDates(dateMap)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load tasks'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [clientId, enabled, fetchCount])

  const retry = useCallback(() => {
    setFetchCount((c) => c + 1)
  }, [])

  return { data, transcriptDates, loading, error, retry }
}
