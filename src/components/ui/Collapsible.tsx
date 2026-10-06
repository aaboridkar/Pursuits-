import { useId, useState, type ReactNode } from 'react'
import { UI_ICON } from './icons'

const ChevronRight = UI_ICON.chevronRight

interface CollapsibleProps {
 /** Eyebrow-style label, matching SectionHeading. */
 label: string
 icon?: ReactNode
 count?: number
 /** Always-visible summary at the right of the header (a badge, a note). Non-interactive. */
 summary?: ReactNode
 defaultOpen?: boolean
 children: ReactNode
}

/**
 * A section whose whole header toggles its body. The body animates between
 * 0fr and 1fr grid rows, so it opens to its natural height with no measuring;
 * the global reduced-motion rule in index.css collapses the transition.
 */
export function Collapsible({ label, icon, count, summary, defaultOpen = false, children }: CollapsibleProps) {
 const [open, setOpen] = useState(defaultOpen)
 const id = useId()
 const panelId = `${id}-panel`
 const headerId = `${id}-header`

 return (
  <section>
   <div className="flex items-center justify-between gap-3">
    <button
     id={headerId}
     type="button"
     aria-expanded={open}
     aria-controls={panelId}
     onClick={() => setOpen((o) => !o)}
     className="group -ml-1 flex min-h-[28px] flex-1 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-surface-sunken"
    >
     <ChevronRight
      size={14}
      strokeWidth={2.4}
      aria-hidden="true"
      className={`shrink-0 text-ink-faint transition-transform duration-200 ease-out group-hover:text-ink-muted ${open ? 'rotate-90' : ''}`}
     />
     {icon}
     <span className="eyebrow">{label}</span>
     {count !== undefined && (
      <span className="tabular ml-0.5 rounded-full bg-surface-sunken px-2 py-[1px] text-[11px] font-bold text-ink-muted">{count}</span>
     )}
     {!open && <span className="ml-1 text-[11px] font-medium text-ink-faint">Show</span>}
    </button>
    {summary}
   </div>

   <div
    id={panelId}
    role="region"
    aria-labelledby={headerId}
    aria-hidden={!open}
    inert={!open}
    className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
   >
    <div className="min-h-0 overflow-hidden">
     <div className="pt-2">{children}</div>
    </div>
   </div>
  </section>
 )
}
