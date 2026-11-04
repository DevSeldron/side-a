import { useCallback, useEffect, useState } from 'react'
import type { AlbumDetail } from '@shared/types'
import { useApp } from '../store/app'
import { errorMessage } from './format'

interface AlbumDetailState {
  detail?: AlbumDetail
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAlbumDetail(key: string | undefined, force = false): AlbumDetailState {
  const cached = useApp((state) => (key ? state.snapshot?.details[key] : undefined))
  const [detail, setDetail] = useState<AlbumDetail | undefined>(cached)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    if (!key) {
      setDetail(undefined)
      return
    }
    if (cached && !force) {
      setDetail(cached)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    window.sideA.library
      .album(key, force || token > 0)
      .then((result) => {
        if (!cancelled) {
          setDetail(result)
          setLoading(false)
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(errorMessage(reason, 'Could not load this release'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, cached, force, token])

  const reload = useCallback(() => setToken((value) => value + 1), [])

  return { detail, loading, error, reload }
}
