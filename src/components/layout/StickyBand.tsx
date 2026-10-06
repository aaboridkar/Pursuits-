import type { ReactNode } from 'react'

/**
 * Cancels <main>'s px-4 py-3.5 gutter, pins under the top bar, and restores
 * the gutter on an inner container — the KPI-band treatment.
 */
export function StickyBand({ children }: { children: ReactNode }) {
 return (
  <div className="sticky top-0 z-20 -mx-4 -mt-3.5 mb-3 border-b border-border bg-surface/95 backdrop-blur-sm">
   <div className="px-4">{children}</div>
  </div>
 )
}

