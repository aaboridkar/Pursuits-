import type { ReactNode } from 'react'
import { UI_ICON } from './icons'

interface PageHeaderProps {
 breadcrumbs?: string[]
 /** Compact single-line context — replaces the old title/subtitle masthead. */
 meta?: ReactNode
 actions?: ReactNode
}

const ChevronRight = UI_ICON.chevronRight

/**
 * The compact header panel every routed screen opens with — breadcrumbs,
 * an optional single-line meta strip, and actions. No standalone page
 * title/subtitle: what a screen is showing is named inline in meta so the
 * panel stays low enough to never cost the page a scroll.
 */
export function PageHeader({ breadcrumbs, meta, actions }: PageHeaderProps) {
 return (
  <header className="mb-3">
   {breadcrumbs && breadcrumbs.length > 0 && (
    <nav className="mb-1 flex items-center gap-1 text-2xs text-ink-faint" aria-label="Breadcrumb">
     {breadcrumbs.map((crumb, i) => (
      <span key={crumb} className="flex items-center gap-1">
       {i > 0 && <ChevronRight size={12} strokeWidth={2.2} aria-hidden="true" />}
       <span>{crumb}</span>
      </span>
     ))}
    </nav>
   )}
   <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
    {meta && <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">{meta}</div>}
    {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
   </div>
  </header>
 )
}

