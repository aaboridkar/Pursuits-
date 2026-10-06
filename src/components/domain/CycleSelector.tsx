import { CYCLES } from '../../data'
import { Badge } from '../ui/Badge'
import { UI_ICON } from '../ui/icons'

const LockIcon = UI_ICON.lock
const ChevronDown = UI_ICON.chevronDown
const CalendarIcon = UI_ICON.calendar

/**
 * The IBP cycle filter. Rendered as a real select so it is obviously a
 * control, but disabled: navigating into historical cycles is a roadmap
 * capability. The history itself is still visible read-only elsewhere
 * (CycleHistoryStrip) — the point is that the platform remembers.
 */
export function CycleSelector() {
 const selectable = CYCLES.filter((c) => c.status !== 'draft')
 const current = selectable.find((c) => c.status === 'current')!
 const title = 'Historical cycle navigation is a roadmap capability — the selector is shown to indicate that every cycle is retained.'

 return (
  <div className="flex flex-wrap items-center gap-2" title={title}>
   <label className="relative inline-flex items-center">
    <span className="sr-only">IBP cycle</span>
    <span className="pointer-events-none absolute left-2.5 text-ink-faint">
     <CalendarIcon size={13} strokeWidth={2.2} aria-hidden="true" />
    </span>
    <select
     disabled
     value={current.id}
     onChange={() => undefined}
     aria-describedby="cycle-selector-note"
     className="min-h-[32px] cursor-not-allowed appearance-none rounded-md border border-border-strong bg-surface-sunken py-1 pl-8 pr-14 text-xs font-semibold text-ink-muted opacity-80"
    >
     {selectable.map((c) => (
      <option key={c.id} value={c.id}>
       {c.label}
       {c.status === 'current' ? ' — Current' : ''}
      </option>
     ))}
    </select>
    <span className="pointer-events-none absolute right-2.5 flex items-center gap-1 text-ink-faint">
     <LockIcon size={12} strokeWidth={2.2} aria-hidden="true" />
     <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />
    </span>
   </label>
   <Badge tone="neutral" dot>
    <span id="cycle-selector-note">Cycle history · roadmap</span>
   </Badge>
  </div>
 )
}
