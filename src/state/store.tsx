import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
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
  toast: ToastSpec | null
}

export type AppAction =
  | { type: 'scope/set'; scope: Scope }
  | { type: 'data/changed' }
  | { type: 'reset' }
  | { type: 'toast/show'; toast: Omit<ToastSpec, 'id'> }
  | { type: 'toast/dismiss' }

const readScope = (): Scope => {
  try {
    return localStorage.getItem('wcd.scope') === 'source' ? 'source' : 'all'
  } catch {
    return 'all'
  }
}

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
    case 'toast/show':
      return { ...state, toast: { ...action.toast, id: Date.now() } }
    case 'toast/dismiss':
      return { ...state, toast: null }
  }
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ scope: readScope(), dataVersion: 0, toast: null }))
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
