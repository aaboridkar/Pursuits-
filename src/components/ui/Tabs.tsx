import type { ReactNode } from 'react'

export interface TabSpec<T extends string> {
 id: T
 label: string
 count?: number
 icon?: ReactNode
}

interface TabsProps<T extends string> {
 tabs: TabSpec<T>[]
 value: T
 onChange: (id: T) => void
 /** Rendered at the right end of the tab bar (a filter, a link). */
 actions?: ReactNode
 ariaLabel: string
}

/**
 * A tab bar for progressive disclosure: one list visible at a time, counts on
 * the tab so nothing is hidden without a trace. Blue marks the current tab only.
 */
export function Tabs<T extends string>({ tabs, value, onChange, actions, ariaLabel }: TabsProps<T>) {
 return (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border">
   <div role="tablist" aria-label={ariaLabel} className="-mb-px flex flex-wrap gap-1">
    {tabs.map((t) => {
     const selected = t.id === value
     return (
      <button
       key={t.id}
       type="button"
       role="tab"
       aria-selected={selected}
       onClick={() => onChange(t.id)}
       className={`inline-flex min-h-[36px] items-center gap-1.5 border-b-2 px-3 text-xs font-bold transition-colors ${
        selected ? 'border-brand text-brand-active' : 'border-transparent text-ink-faint hover:border-border-strong hover:text-ink-muted'
       }`}
      >
       {t.icon}
       {t.label}
       {t.count !== undefined && (
        <span className={`tabular rounded-full px-1.5 py-[1px] text-[10.5px] ${selected ? 'bg-brand-soft text-brand-active' : 'bg-surface-sunken text-ink-muted'}`}>{t.count}</span>
       )}
      </button>
     )
    })}
   </div>
   {actions && <div className="flex items-center gap-2 pb-1.5">{actions}</div>}
  </div>
 )
}
