import { Link } from 'react-router-dom'
import type { Action } from '../../data/types'
import { CYCLE_BY_ID, PEOPLE, REVIEW_BY_ID } from '../../data'
import { fmtDate } from '../../engine/format'
import type { DecisionGroup as Group } from '../../state/selectors'
import { Badge } from '../ui/Badge'
import { UI_ICON } from '../ui/icons'
import { ActionStatusBadge, DecisionStatusBadge } from './StatusBadges'

const ArrowRight = UI_ICON.arrowRight

/** One nested action line under its decision. Done actions stay visible but recede. */
export function ActionLine({ action }: { action: Action }) {
 const done = action.status === 'done'
 return (
  <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 ${done ? 'opacity-60' : ''} ${action.isNew ? 'rounded-md bg-warn-soft/60 px-2 -mx-2' : ''}`}>
   <div className="min-w-0 flex-1 basis-[240px]">
    <div className="flex flex-wrap items-center gap-1.5">
     <span className={`text-xs font-semibold ${done ? 'text-ink-muted line-through decoration-border-strong' : 'text-ink'}`}>{action.title}</span>
     {action.isNew && (
      <Badge tone="yellow" solid>
       New
      </Badge>
     )}
    </div>
    <div className="text-[11px] text-ink-faint">
     {action.id}
     {action.carriedFromCycleId && <> · carried from {CYCLE_BY_ID[action.carriedFromCycleId]?.shortLabel}</>}
    </div>
   </div>
   <span className="w-[170px] shrink-0 text-[11.5px] text-ink-muted">{action.owner}</span>
   <span className={`tabular w-[92px] shrink-0 text-[11.5px] ${action.status === 'overdue' ? 'font-semibold text-bad' : 'text-ink-muted'}`}>{fmtDate(action.dueDate)}</span>
   <span className="w-[112px] shrink-0">
    <ActionStatusBadge status={action.status} />
   </span>
  </li>
 )
}

/**
 * A decision with the actions it spawned nested beneath it — the log reads
 * as cause and effect: this was decided, therefore these are being done.
 */
export function DecisionGroup({ group }: { group: Group }) {
 const { decision, actions, openCount } = group
 const review = REVIEW_BY_ID[decision.reviewId]
 const proposer = PEOPLE[decision.proposedBy]
 const confirmer = decision.confirmedBy ? PEOPLE[decision.confirmedBy] : undefined
 const potential = decision.status === 'potential'

 return (
  <article className="py-3 first:pt-0 last:pb-0">
   <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
    <div className="min-w-0 flex-1">
     <div className="flex flex-wrap items-center gap-1.5">
      <DecisionStatusBadge status={decision.status} solid={potential} />
      <Link to={`/decisions/${decision.id}`} className="text-sm font-extrabold tracking-[-0.01em] text-ink hover:text-brand hover:underline">
       {decision.title}
      </Link>
     </div>
     <div className="mt-0.5 text-[11px] text-ink-faint">
      {decision.id} · {review.name} · proposed by {proposer?.name}
      {confirmer && decision.confirmedOn && ` · confirmed ${fmtDate(decision.confirmedOn)} by ${confirmer.name}`}
     </div>
    </div>
    <div className="flex items-center gap-2">
     {actions.length > 0 && (
      <Badge tone={openCount > 0 ? 'blue' : 'success'}>
       {openCount > 0 ? `${openCount} open of ${actions.length} action${actions.length > 1 ? 's' : ''}` : `${actions.length} action${actions.length > 1 ? 's' : ''} done`}
      </Badge>
     )}
     {potential && (
      <Link to={`/decisions/${decision.id}`} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline">
       Open workspace
       <ArrowRight size={12} strokeWidth={2.4} aria-hidden="true" />
      </Link>
     )}
    </div>
   </div>

   <ul className="ml-2.5 mt-1.5 border-l-2 border-border pl-4">
    {actions.map((a) => (
     <ActionLine key={a.id} action={a} />
    ))}
    {actions.length === 0 && (
     <li className="py-1.5 text-[11.5px] text-ink-faint">{potential ? 'No actions yet — generated when the decision is confirmed.' : 'No follow-up actions recorded.'}</li>
    )}
   </ul>
  </article>
 )
}
