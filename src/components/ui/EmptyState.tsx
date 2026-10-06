import type { ReactNode } from 'react'

interface EmptyStateProps {
 icon: ReactNode
 title: string
 body: string
 action?: ReactNode
 compact?: boolean
}

/** A real empty state — never a bare grey sentence, which reads as a rendering failure. */
export function EmptyState({ icon, title, body, action, compact }: EmptyStateProps) {
 return (
  <div
   className={`flex flex-col items-center rounded-md border border-dashed border-border-strong text-center ${
    compact ? 'gap-2 px-5 py-6' : 'gap-3 px-6 py-10'
   }`}
  >
   <span
    className={`flex items-center justify-center rounded-full bg-surface-sunken text-ink-faint ${
     compact ? 'h-8 w-8' : 'h-9 w-9'
    }`}
   >
    {icon}
   </span>
   <div>
    <div className="text-sm font-semibold text-ink">{title}</div>
    <p className="mt-1 max-w-[38ch] text-xs text-ink-faint">{body}</p>
   </div>
   {action}
  </div>
 )
}

