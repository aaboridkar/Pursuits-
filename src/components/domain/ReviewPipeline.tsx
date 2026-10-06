import { Link } from 'react-router-dom'
import type { Review } from '../../data/types'
import { fmtDayMonth } from '../../engine/format'
import { Tile } from '../ui/Tile'
import { Button } from '../ui/Button'
import { UI_ICON } from '../ui/icons'
import { ReviewStatusBadge } from './StatusBadges'

const ArrowRight = UI_ICON.arrowRight

/**
 * The five IBP reviews of the cycle as a left-to-right pipeline. The review
 * in progress is the only tile that carries the brand accent and a primary
 * action — blue means "act here", nowhere else.
 */
export function ReviewPipeline({ reviews }: { reviews: Review[] }) {
 return (
  <ol className="grid gap-2.5 md:grid-cols-5" aria-label="IBP reviews this cycle">
   {reviews.map((r, i) => {
    const active = r.status === 'in-progress'
    return (
     <li key={r.id} className="min-w-0">
      <Tile accent={active ? 'var(--color-brand)' : r.status === 'complete' ? 'var(--color-good)' : 'var(--color-border-strong)'} className="flex h-full flex-col gap-2">
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
         <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">Review {i + 1} of 5</div>
         <div className="truncate text-sm font-extrabold tracking-[-0.01em] text-ink">{r.name}</div>
        </div>
        <ReviewStatusBadge status={r.status} />
       </div>
       <div className="tabular text-[11.5px] text-ink-muted">
        {fmtDayMonth(r.date)} · {r.time}
        <span className="text-ink-faint"> · {r.owner}</span>
       </div>
       <p className="line-clamp-3 text-[11.5px] leading-snug text-ink-muted">{r.outcome ?? r.focus}</p>
       <div className="mt-auto pt-1">
        {active ? (
         <Link to={`/review/${r.id}`}>
          <Button variant="primary" size="sm" className="w-full" icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
           Open {r.name}
          </Button>
         </Link>
        ) : (
         <Link to={`/review/${r.id}`} className="text-[11.5px] font-semibold text-brand hover:underline">
          {r.status === 'complete' ? 'View outcome' : 'View preparation'}
         </Link>
        )}
       </div>
      </Tile>
     </li>
    )
   })}
  </ol>
 )
}
