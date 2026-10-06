import { CYCLES } from '../../data'
import { fmtDayMonth } from '../../engine/format'
import { Badge } from '../ui/Badge'
import { Tile } from '../ui/Tile'
import { UI_ICON } from '../ui/icons'

const LockIcon = UI_ICON.lock
const HistoryIcon = UI_ICON.history

/**
 * Closed cycles, read-only. Proves the platform keeps governance memory
 * (decisions, actions, outcomes, what was left unresolved) while the
 * disabled CycleSelector says navigating into them is a roadmap capability.
 */
export function CycleHistoryStrip() {
 const closed = CYCLES.filter((c) => c.status === 'closed')
 return (
  <div className="grid gap-2.5 md:grid-cols-3" aria-label="Previous IBP cycles">
   {closed.map((c) => (
    <Tile key={c.id} className="flex flex-col gap-2 opacity-90" aria-disabled="true">
     <div className="flex items-start justify-between gap-2">
      <div>
       <div className="flex items-center gap-1.5 text-sm font-extrabold tracking-[-0.01em] text-ink">
        <HistoryIcon size={14} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />
        {c.label}
       </div>
       <div className="tabular text-[11px] text-ink-faint">
        {fmtDayMonth(c.start)} – {fmtDayMonth(c.end)} · Closed
       </div>
      </div>
      <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-faint" title="Opening a historical cycle is a roadmap capability">
       <LockIcon size={11} strokeWidth={2.4} aria-hidden="true" />
       Read-only
      </span>
     </div>

     <dl className="tabular grid grid-cols-3 gap-2 text-center">
      {[
       ['Decisions', c.summary.decisions],
       ['Actions closed', `${c.summary.closedActions}/${c.summary.actions}`],
       ['Issues resolved', `${c.summary.resolvedIssues}/${c.summary.issues}`],
      ].map(([label, value]) => (
       <div key={label} className="rounded-md bg-surface-sunken px-1.5 py-1.5">
        <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
        <dd className="figure text-base text-ink">{value}</dd>
       </div>
      ))}
     </dl>

     <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">Meeting outcomes</div>
      <ul className="mt-1 space-y-0.5 text-[11.5px] leading-snug text-ink-muted">
       {c.summary.outcomes.slice(0, 3).map((o) => (
        <li key={o} className="flex gap-1.5">
         <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
         {o}
        </li>
       ))}
      </ul>
     </div>

     <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
      {c.summary.unresolved.length > 0 ? (
       <>
        <Badge tone="yellow" dot>
         {c.summary.unresolved.length} unresolved → carried forward
        </Badge>
        <span className="text-[11px] text-ink-faint">{c.summary.unresolved.join(' · ')}</span>
       </>
      ) : (
       <Badge tone="success" dot>
        Closed clean
       </Badge>
      )}
     </div>
    </Tile>
   ))}
  </div>
 )
}
