import { Link } from 'react-router-dom'
import { fmtDate } from '../../engine/format'
import { useStore } from '../../state/store'
import { useInbox, type InboxItem } from '../../state/selectors'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SectionHeading } from '../ui/SectionHeading'
import { NAV_ICON, UI_ICON } from '../ui/icons'

const InboxIcon = UI_ICON.list
const ArrowRight = UI_ICON.arrowRight
const CheckIcon = UI_ICON.checkCircle
const ShieldIcon = UI_ICON.flag
const MailIcon = UI_ICON.mail
const DecisionIcon = NAV_ICON.decisions
const ClockIcon = UI_ICON.clock
const AlertIcon = UI_ICON.alert

const KIND: Record<InboxItem['kind'], { label: string; tone: 'yellow' | 'danger' | 'blue'; Icon: typeof AlertIcon; accent: string }> = {
 decision: { label: 'Decision', tone: 'yellow', Icon: DecisionIcon, accent: 'var(--color-accent)' },
 action: { label: 'Overdue', tone: 'danger', Icon: ClockIcon, accent: 'var(--color-bad)' },
 issue: { label: 'Escalation', tone: 'danger', Icon: ShieldIcon, accent: 'var(--color-bad)' },
}

/**
 * Everything that needs the signed-in human to act, in one place at the top
 * of the Control Tower: decisions awaiting confirmation, overdue actions,
 * recurring issues that must be escalated. Items disappear as they are dealt
 * with, so the list is the presenter's running to-do.
 */
export function PriorityInbox() {
 const { dispatch } = useStore()
 const items = useInbox()

 return (
  <Card className="flex h-full flex-col">
   <SectionHeading
    label="Priority inbox"
    icon={<InboxIcon size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
    count={items.length}
    actions={<span className="text-[11px] text-ink-faint">Needs your explicit intervention</span>}
   />
   {items.length === 0 ? (
    <EmptyState compact icon={<CheckIcon size={16} aria-hidden="true" />} title="Nothing waiting on you" body="Decisions to confirm, overdue actions and escalations appear here as the cycle runs." />
   ) : (
    <ul className="divide-y divide-border">
     {items.map((item) => {
      const k = KIND[item.kind]
      return (
       <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0" style={{ boxShadow: `inset 3px 0 0 ${k.accent}` }}>
        <span className={`ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.kind === 'decision' ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad'}`} aria-hidden="true">
         <k.Icon size={15} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1 basis-[260px]">
         <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={k.tone}>{k.label}</Badge>
          <span className="text-sm font-bold leading-snug text-ink">{item.title}</span>
         </div>
         <div className="mt-0.5 text-[11.5px] text-ink-muted">{item.detail}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
         {item.kind === 'decision' && (
          <Link to={`/decisions/${item.decision.id}`}>
           <Button variant="primary" size="sm" icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
            Open workspace
           </Button>
          </Link>
         )}
         {item.kind === 'action' &&
          (item.action.nudgedOn ? (
           <Badge tone="neutral" icon={<CheckIcon size={11} strokeWidth={2.4} aria-hidden="true" />}>
            Reminder sent {fmtDate(item.action.nudgedOn)}
           </Badge>
          ) : (
           <Button size="sm" onClick={() => dispatch({ type: 'action/nudge', id: item.action.id })} icon={<MailIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
            Nudge owner
           </Button>
          ))}
         {item.kind === 'action' && (
          <Link to="/decisions#actions" className="text-[11.5px] font-semibold text-brand hover:underline">
           View
          </Link>
         )}
         {item.kind === 'issue' && (
          <Button variant="accent" size="sm" onClick={() => dispatch({ type: 'issue/escalate', id: item.issue.id })} icon={<ShieldIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
           Escalate to Executive IBP
          </Button>
         )}
        </div>
       </li>
      )
     })}
    </ul>
   )}
  </Card>
 )
}
