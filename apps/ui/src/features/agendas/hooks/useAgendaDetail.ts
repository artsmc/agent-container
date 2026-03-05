'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AgendaDetail } from '../types'
import { fetchAgendaDetail } from '../actions'

interface UseAgendaDetailReturn {
  agenda: AgendaDetail | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Hook to fetch a single agenda by short ID or UUID.
 */
export function useAgendaDetail(agendaId: string): UseAgendaDetailReturn {
  const [agenda, setAgenda] = useState<AgendaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAgenda = useCallback(async () => {
    setLoading(true)
    setError(null)

    const result = await fetchAgendaDetail(agendaId)

    if (result.error) {
      setError(result.error)
    } else {
      setAgenda(result.agenda)
    }

    setLoading(false)
  }, [agendaId])

  useEffect(() => {
    loadAgenda()
  }, [loadAgenda])

  return { agenda, loading, error, retry: loadAgenda }
}
