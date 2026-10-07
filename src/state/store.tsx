import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import type { Scope } from '../../shared/types'

export interface ToastSpec {
  id: number
  title: string
  body?: string
  actionLabel?: string
  actionTo?: string
}

export interface AppState {
  /** Which records feed every calculation — persisted per browser. */
  scope: Scope
  /** Bumped after every write so every open view refetches. */
  dataVersion: number
  /** The live-update connection to the server: open, (re)connecting, or given up. */
  live: 'connecting' | 'open' | 'down'
  toast: ToastSpec | null
}

export type AppAction =
  | { type: 'scope/set'; scope: Scope }
  | { type: 'data/changed' }
  | { type: 'live/set'; live: AppState['live'] }
  | { type: 'reset' }
  | { type: 'toast/show'; toast: Omit<ToastSpec, 'id'> }
  | { type: 'toast/dismiss' }

// The scope picker was removed from the top bar, so everyone sees the same full snapshot;
// a 'source' choice saved earlier in a browser must not hide records with no way to undo it.
const readScope = (): Scope => 'all'

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'scope/set':
      try {
        localStorage.setItem('wcd.scope', action.scope)
      } catch {
        /* storage unavailable — scope just won't persist */
      }
      return { ...state, scope: action.scope }
    case 'data/changed':
    case 'reset':
      return { ...state, dataVersion: state.dataVersion + 1 }
    case 'live/set':
      return state.live === action.live ? state : { ...state, live: action.live }
    case 'toast/show':
      return { ...state, toast: { ...action.toast, id: Date.now() } }
    case 'toast/dismiss':
      return { ...state, toast: null }
  }
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ scope: readScope(), dataVersion: 0, live: 'connecting' as const, toast: null }))
  // Live snapshot: when anyone saves, the server says so and every open view here refetches.
  // EventSource reconnects by itself if the server restarts or the network drops.
  // Only a tab on screen holds the stream: browsers allow ~6 connections per server, and a
  // stream per background tab would use them up and leave saves queued forever. A tab coming
  // back on screen reconnects and refetches, so it never shows a stale snapshot.
  useEffect(() => {
    let events: EventSource | null = null
    const connect = () => {
      if (events) return
      events = new EventSource('/api/events')
      dispatch({ type: 'live/set', live: 'connecting' })
      events.addEventListener('changed', () => dispatch({ type: 'data/changed' }))
      let opened = false
      events.onopen = () => {
        dispatch({ type: 'live/set', live: 'open' })
        // Back after a dropped connection: catch up on anything saved meanwhile.
        if (opened) dispatch({ type: 'data/changed' })
        opened = true
      }
      // The browser retries on its own; CLOSED means it has stopped trying.
      events.onerror = () => dispatch({ type: 'live/set', live: events?.readyState === EventSource.CLOSED ? 'down' : 'connecting' })
    }
    const disconnect = () => {
      events?.close()
      events = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return disconnect()
      connect()
      dispatch({ type: 'data/changed' })
    }
    if (document.visibilityState !== 'hidden') connect()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      disconnect()
    }
  }, [])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
