'use client'

import { useState, useCallback } from 'react'
import type { ShareResponse } from '../types'
import {
  finalizeAgenda as finalizeAction,
  shareAgenda as shareAction,
  emailAgenda as emailAction,
  exportAgenda as exportAction,
} from '../actions'

interface MutationState<T = void> {
  loading: boolean
  error: string | null
  result: T | null
}

interface UseAgendaMutationsReturn {
  finalize: (agendaId: string) => Promise<{
    success: boolean
    error?: string
    code?: string
  }>
  finalizeState: MutationState

  share: (agendaId: string) => Promise<{
    urls: ShareResponse | null
    error?: string
  }>
  shareState: MutationState<ShareResponse>

  email: (
    agendaId: string,
    recipients: string[],
    subject: string
  ) => Promise<{ success: boolean; error?: string }>
  emailState: MutationState

  exportAgenda: (
    agendaId: string,
    format: 'google_docs' | 'pdf'
  ) => Promise<{ url?: string; error?: string }>
  exportState: MutationState<string>
}

/**
 * Hook managing all agenda mutation actions (finalize, share, email, export).
 */
export function useAgendaMutations(): UseAgendaMutationsReturn {
  const [finalizeState, setFinalizeState] = useState<MutationState>({
    loading: false,
    error: null,
    result: null,
  })

  const [shareState, setShareState] = useState<MutationState<ShareResponse>>({
    loading: false,
    error: null,
    result: null,
  })

  const [emailState, setEmailState] = useState<MutationState>({
    loading: false,
    error: null,
    result: null,
  })

  const [exportState, setExportState] = useState<MutationState<string>>({
    loading: false,
    error: null,
    result: null,
  })

  const finalize = useCallback(async (agendaId: string) => {
    setFinalizeState({ loading: true, error: null, result: null })
    const result = await finalizeAction(agendaId)
    setFinalizeState({
      loading: false,
      error: result.error ?? null,
      result: null,
    })
    return result
  }, [])

  const share = useCallback(async (agendaId: string) => {
    setShareState({ loading: true, error: null, result: null })
    const result = await shareAction(agendaId)
    setShareState({
      loading: false,
      error: result.error ?? null,
      result: result.urls,
    })
    return result
  }, [])

  const email = useCallback(
    async (agendaId: string, recipients: string[], subject: string) => {
      setEmailState({ loading: true, error: null, result: null })
      const result = await emailAction(agendaId, { recipients, subject })
      setEmailState({
        loading: false,
        error: result.error ?? null,
        result: null,
      })
      return result
    },
    []
  )

  const doExport = useCallback(
    async (agendaId: string, format: 'google_docs' | 'pdf') => {
      setExportState({ loading: true, error: null, result: null })
      const result = await exportAction(agendaId, format)
      setExportState({
        loading: false,
        error: result.error ?? null,
        result: result.url ?? null,
      })
      return result
    },
    []
  )

  return {
    finalize,
    finalizeState,
    share,
    shareState,
    email,
    emailState,
    exportAgenda: doExport,
    exportState,
  }
}
