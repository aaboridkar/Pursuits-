import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../state/store'

export class ApiError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error ?? `${res.status} ${res.statusText}`)
  return json as T
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T,>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T,>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
}

/**
 * GETs a path with the current data scope applied, refetching whenever the
 * scope changes or any write has happened elsewhere in the app.
 */
export function useApi<T>(path: string | null) {
  const { state } = useStore()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const url = path ? `${path}${path.includes('?') ? '&' : '?'}scope=${state.scope}` : null

  useEffect(() => {
    if (!url) return
    let live = true
    setLoading(true)
    api
      .get<T>(url)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [url, state.dataVersion])

  return { data, error, loading }
}

/** Runs a write, then tells every view to refetch; reports failures as a toast. */
export function useMutation() {
  const { dispatch } = useStore()
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: { title: string; body?: string; actionLabel?: string; actionTo?: string }) => {
      try {
        const out = await fn()
        dispatch({ type: 'data/changed' })
        if (success) dispatch({ type: 'toast/show', toast: success })
        return out
      } catch (e) {
        dispatch({ type: 'toast/show', toast: { title: 'That didn’t work', body: (e as Error).message } })
        return undefined
      }
    },
    [dispatch],
  )
}
