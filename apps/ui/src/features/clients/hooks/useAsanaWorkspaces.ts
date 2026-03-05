'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AsanaWorkspace } from '@iexcel/shared-types'
import { getBrowserApiClient } from '@/lib/api-client-browser'

/**
 * Fetches configured Asana workspaces.
 *
 * Fires on mount and returns workspace options for the Settings dropdown.
 */
export function useAsanaWorkspaces() {
  const [data, setData] = useState<AsanaWorkspace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const apiClient = getBrowserApiClient()
      const response = await apiClient.listAsanaWorkspaces()
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load workspaces'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  return { data, loading, error, retry: fetchWorkspaces }
}
