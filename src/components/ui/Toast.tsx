import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../state/store'
import { Button } from './Button'
import { UI_ICON } from './icons'

const CheckIcon = UI_ICON.checkCircle
const CloseIcon = UI_ICON.close

/** Renders the store's single toast, bottom-right; auto-dismisses after 8 s. */
export function ToastHost() {
 const { state, dispatch } = useStore()
 const navigate = useNavigate()
 const toast = state.toast

 useEffect(() => {
  if (!toast) return
  const t = window.setTimeout(() => dispatch({ type: 'toast/dismiss' }), 8000)
  return () => window.clearTimeout(t)
 }, [toast, dispatch])

 if (!toast) return null

 return (
  <div className="pointer-events-none fixed bottom-5 right-5 z-40 max-w-[420px]" role="status" aria-live="polite">
   <div key={toast.id} className="fade-in pointer-events-auto flex gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-lg">
    <span className="mt-0.5 shrink-0 text-good">
     <CheckIcon size={18} strokeWidth={2.4} aria-hidden="true" />
    </span>
    <div className="min-w-0 flex-1">
     <div className="text-sm font-bold text-ink">{toast.title}</div>
     {toast.body && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{toast.body}</p>}
     {toast.actionLabel && toast.actionTo && (
      <Button
       variant="primary"
       size="sm"
       className="mt-2.5"
       onClick={() => {
        dispatch({ type: 'toast/dismiss' })
        navigate(toast.actionTo!)
       }}
      >
       {toast.actionLabel}
      </Button>
     )}
    </div>
    <button
     type="button"
     onClick={() => dispatch({ type: 'toast/dismiss' })}
     aria-label="Dismiss"
     className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-surface-sunken hover:text-ink"
    >
     <CloseIcon size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
   </div>
  </div>
 )
}
