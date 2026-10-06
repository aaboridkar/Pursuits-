import { useEffect, type ReactNode } from 'react'
import { DIALOG_PANEL, DIALOG_SCRIM } from './form'
import { UI_ICON } from './icons'

const CloseIcon = UI_ICON.close

interface DialogProps {
 open: boolean
 onClose: () => void
 title: string
 eyebrow?: string
 children: ReactNode
 footer?: ReactNode
 /** 'panel' slides in from the right (scenario review); 'modal' centres (confirmation). */
 variant?: 'panel' | 'modal'
 wide?: boolean
}

/** Scrim + panel. Escape closes; focus stays inside the app's normal flow. */
export function Dialog({ open, onClose, title, eyebrow, children, footer, variant = 'modal', wide }: DialogProps) {
 useEffect(() => {
  if (!open) return
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
 }, [open, onClose])

 if (!open) return null

 // DIALOG_PANEL fixes the width at 420px; a wide panel swaps that one utility
 // rather than stacking a second width class whose winner depends on CSS order.
 const panelClass =
  variant === 'panel'
   ? `${wide ? DIALOG_PANEL.replace('w-[420px]', 'w-[760px]') : DIALOG_PANEL} flex flex-col`
   : `fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-(--color-border) bg-(--color-surface) shadow-lg ${wide ? 'w-[720px]' : ''}`

 return (
  <>
   <div className={DIALOG_SCRIM} onClick={onClose} aria-hidden="true" />
   <div role="dialog" aria-modal="true" aria-label={title} className={panelClass}>
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
     <div className="min-w-0">
      {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
      <h2 className="text-md font-extrabold tracking-[-0.01em] text-ink">{title}</h2>
     </div>
     <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
     >
      <CloseIcon size={16} strokeWidth={2.2} aria-hidden="true" />
     </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
   </div>
  </>
 )
}
