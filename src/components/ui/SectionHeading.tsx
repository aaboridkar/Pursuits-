import type { ReactNode } from 'react'

interface SectionHeadingProps {
 label: string
 icon?: ReactNode
 count?: number
 actions?: ReactNode
}

/** The label that opens a section or a stat — eyebrow + optional icon/count/actions. */
export function SectionHeading({ label, icon, count, actions }: SectionHeadingProps) {
 return (
  <div className="mb-2 flex items-center justify-between gap-3">
   <div className="flex items-center gap-1.5">
    {icon}
    <span className="eyebrow">{label}</span>
    {count !== undefined && (
     <span className="tabular ml-0.5 rounded-full bg-surface-sunken px-2 py-[1px] text-[11px] font-bold text-ink-muted">
      {count}
     </span>
    )}
   </div>
   {actions}
  </div>
 )
}

