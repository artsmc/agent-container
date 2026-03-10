'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PaginatedResponse, GetTranscriptResponse } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'

/**
 * Fetches transcripts for a client.
 *
 * Only fires when `enabled` is true -- designed for lazy tab loading.
 */
export function useClientTranscripts(clientId: string, enabled: boolean) {
  const [data, setData] = useState<PaginatedResponse<GetTranscriptResponse> | null>(null)
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
        const response = await apiClient.listTranscripts(clientId)
        if (!cancelled) setData(response)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load transcripts'))
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

  return { data, loading, error, retry }
}
