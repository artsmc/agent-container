'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  const hasFetched = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (hasFetched.current && fetchCount === 0) return

    let cancelled = false
    hasFetched.current = true

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
    hasFetched.current = false
    setFetchCount((c) => c + 1)
  }, [])

  return { data, loading, error, retry }
}
