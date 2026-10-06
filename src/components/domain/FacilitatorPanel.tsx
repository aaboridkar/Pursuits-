import { Link } from 'react-router-dom'
import type { Decision } from '../../data/types'
import type { DetectedItem, Insights } from '../../engine/facilitator'
import { fmtClock } from '../../engine/format'
import { AiBadge } from '../ui/AiBadge'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { SectionHeading } from '../ui/SectionHeading'
import { SIGNAL_ICON, UI_ICON } from '../ui/icons'
import { DecisionStatusBadge } from './StatusBadges'

const ArrowRight = UI_ICON.arrowRight
const AlertIcon = UI_ICON.alert

interface FacilitatorPanelProps {
 insights: Insights
 decisions: Decision[]
 started: boolean
}

function jumpTo(lineId: string) {
 document.getElementById(`transcript-${lineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function Item({ item, tone }: { item: DetectedItem; tone: 'danger' | 'yellow' | 'blue' | 'neutral' }) {
 const Icon = SIGNAL_ICON[item.kind]
 return (
  <li className="fade-in flex gap-2.5 py-2 first:pt-0 last:pb-0">
   <span className={`mt-0.5 shrink-0 ${tone === 'danger' ? 'text-bad' : tone === 'yellow' ? 'text-warn' : tone === 'blue' ? 'text-brand' : 'text-ink-faint'}`}>
    <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
   </span>
   <div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center gap-1.5">
     <Badge tone={tone}>{item.label}</Badge>
     <button type="button" onClick={() => jumpTo(item.lineId)} className="tabular text-[11px] text-ink-faint hover:text-brand hover:underline" title="Show in transcript">
      {fmtClock(item.offsetSec)}
     </button>
    </div>
    <p className="mt-0.5 text-xs leading-snug text-ink">{item.detail}</p>
   </div>
  </li>
 )
}

function Quiet({ text }: { text: string }) {
 return <p className="text-[11.5px] text-ink-faint">{text}</p>
}

/** What the facilitator has understood so far — updated as each transcript line lands. */
export function FacilitatorPanel({ insights, decisions, started }: FacilitatorPanelProps) {
 const decisionFor = (refId?: string) => decisions.find((d) => d.id === refId)

 return (
  <div className="flex flex-col gap-4">
   <div className="flex items-center justify-between">
    <AiBadge label="Facilitator insights" detail={started ? 'live' : 'waiting for the meeting to start'} />
   </div>

   <section>
    <SectionHeading label="Potential decisions" count={insights.decisions.length} />
    {insights.decisions.length === 0 ? (
     <Quiet text={started ? 'No decision language detected yet.' : 'Decision candidates appear here as they are spoken.'} />
    ) : (
     <ul className="space-y-2">
      {insights.decisions.map((item) => {
       const decision = decisionFor(item.refId)
       const conflict = insights.hasConflict && decision?.status === 'potential'
       return (
        <li key={item.lineId} className="fade-in rounded-md border border-warn-border bg-warn-soft/60 p-3">
         <div className="flex flex-wrap items-center gap-1.5">
          <DecisionStatusBadge status={decision?.status ?? 'potential'} solid={decision?.status === 'potential'} />
          <button type="button" onClick={() => jumpTo(item.lineId)} className="tabular text-[11px] text-ink-faint hover:text-brand hover:underline">
           {fmtClock(item.offsetSec)}
          </button>
         </div>
         <div className="mt-1.5 text-sm font-extrabold leading-snug tracking-[-0.01em] text-ink">{decision?.title ?? item.detail}</div>
         <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">Evidence pulled from SAP IBP / SAP ECC. Confirmation stays with the chair — nothing is recorded automatically.</p>
         {conflict && (
          <div className="mt-2 flex items-start gap-1.5 text-[11.5px] font-semibold text-bad">
           <AlertIcon size={13} strokeWidth={2.4} className="mt-[1px] shrink-0" aria-hidden="true" />
           Data conflict: proposed transfer exceeds Plant 2 available capacity by 4,000 units
          </div>
         )}
         {decision && (
          <Link to={`/decisions/${decision.id}`}>
           <Button variant={decision.status === 'potential' ? 'primary' : 'secondary'} size="sm" className="mt-2.5 w-full" icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
            {decision.status === 'potential' ? 'Open decision workspace' : 'View confirmed decision'}
           </Button>
          </Link>
         )}
        </li>
       )
      })}
     </ul>
    )}
   </section>

   <section>
    <SectionHeading label="Detected issues" count={insights.issues.length} />
    {insights.issues.length === 0 ? (
     <Quiet text={started ? 'Nothing flagged yet.' : 'Issues, recurrences and at-risk actions are flagged here.'} />
    ) : (
     <ul className="divide-y divide-border">
      {insights.issues.map((item) => (
       <Item key={item.lineId} item={item} tone={item.kind === 'action-risk' ? 'yellow' : 'danger'} />
      ))}
     </ul>
    )}
   </section>

   <section>
    <SectionHeading label="Business evidence" count={insights.evidence.length} />
    {insights.evidence.length === 0 ? (
     <Quiet text={started ? 'Figures spoken in the room are matched to the planning snapshot as they arrive.' : 'Spoken figures are checked against SAP IBP / SAP ECC.'} />
    ) : (
     <ul className="divide-y divide-border">
      {insights.evidence.map((item) => (
       <Item key={item.lineId} item={item} tone={item.kind === 'conflict' ? 'danger' : 'blue'} />
      ))}
     </ul>
    )}
   </section>

   <section>
    <SectionHeading label="Parking lot" count={insights.parkingLot.length} />
    {insights.parkingLot.length === 0 ? (
     <Quiet text="Unresolved topics are parked with an owner and a review to return to." />
    ) : (
     <ul className="divide-y divide-border">
      {insights.parkingLot.map((item) => (
       <Item key={item.lineId} item={item} tone="neutral" />
      ))}
     </ul>
    )}
   </section>
  </div>
 )
}
