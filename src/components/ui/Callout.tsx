import type { ReactNode } from 'react'
import { UI_ICON } from './icons'

type Tone = 'danger' | 'warn' | 'success' | 'info'

const TONE: Record<Tone, { box: string; icon: string; Icon: typeof UI_ICON.alert }> = {
 danger: { box: 'border-bad-border bg-bad-soft', icon: 'text-bad', Icon: UI_ICON.alert },
 warn: { box: 'border-warn-border bg-warn-soft', icon: 'text-warn', Icon: UI_ICON.alert },
 success: { box: 'border-good-border bg-good-soft', icon: 'text-good', Icon: UI_ICON.checkCircle },
 info: { box: 'border-brand bg-brand-soft', icon: 'text-brand-active', Icon: UI_ICON.info },
}

interface CalloutProps {
 tone: Tone
 title: string
 children?: ReactNode
 actions?: ReactNode
}

/** A bordered notice: a data conflict, a resolved conflict, a facilitator recommendation. */
export function Callout({ tone, title, children, actions }: CalloutProps) {
 const t = TONE[tone]
 const Icon = t.Icon
 return (
  <div className={`flex gap-3 rounded-md border-l-[3px] border px-3.5 py-3 ${t.box}`} role={tone === 'danger' ? 'alert' : undefined}>
   <span className={`mt-0.5 shrink-0 ${t.icon}`}>
    <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
   </span>
   <div className="min-w-0 flex-1">
    <div className="text-sm font-bold text-ink">{title}</div>
    {children && <div className="mt-1 text-xs leading-relaxed text-ink-muted">{children}</div>}
    {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
   </div>
  </div>
 )
}
