import { AlertTriangle, CheckCircle2, Clock, Eye, Gavel, History, Lightbulb, Loader, ShieldAlert, XCircle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { ActionStatus, CommitmentStatus, DecisionStatus, IssueStatus, ReviewStatus, Severity, WriteBackStatus } from '../../data/types'

type Tone = 'neutral' | 'blue' | 'yellow' | 'success' | 'danger'
type Spec = { label: string; tone: Tone; icon: typeof AlertTriangle }

const badge = (s: Spec, solid?: boolean) => {
 const Icon = s.icon
 return (
  <Badge tone={s.tone} solid={solid} icon={<Icon size={11} strokeWidth={2.4} aria-hidden="true" />}>
   {s.label}
  </Badge>
 )
}

const SEVERITY: Record<Severity, Spec> = {
 critical: { label: 'Critical', tone: 'danger', icon: AlertTriangle },
 high: { label: 'High', tone: 'yellow', icon: AlertTriangle },
 watch: { label: 'Watch', tone: 'neutral', icon: Eye },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
 return badge(SEVERITY[severity])
}

const WRITE_BACK: Record<WriteBackStatus, Spec> = {
 written: { label: 'Written', tone: 'success', icon: CheckCircle2 },
 pending: { label: 'Awaiting buyer release', tone: 'yellow', icon: Clock },
 failed: { label: 'Failed', tone: 'danger', icon: XCircle },
}

export function WriteBackBadge({ status }: { status: WriteBackStatus }) {
 return badge(WRITE_BACK[status])
}

const COMMITMENT: Record<CommitmentStatus, Spec> = {
 'on-track': { label: 'On track', tone: 'success', icon: CheckCircle2 },
 'at-risk': { label: 'At risk', tone: 'yellow', icon: AlertTriangle },
 scheduled: { label: 'Scheduled', tone: 'neutral', icon: Clock },
 done: { label: 'Done', tone: 'success', icon: CheckCircle2 },
}

export function CommitmentBadge({ status }: { status: CommitmentStatus }) {
 return badge(COMMITMENT[status])
}

// --- IBP statuses ----------------------------------------------------------

const ACTION: Record<ActionStatus, Spec> = {
 open: { label: 'Open', tone: 'blue', icon: Clock },
 'in-progress': { label: 'In progress', tone: 'yellow', icon: Loader },
 done: { label: 'Done', tone: 'success', icon: CheckCircle2 },
 overdue: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
 return badge(ACTION[status])
}

const REVIEW: Record<ReviewStatus, Spec> = {
 complete: { label: 'Complete', tone: 'success', icon: CheckCircle2 },
 'in-progress': { label: 'In progress', tone: 'blue', icon: Loader },
 scheduled: { label: 'Scheduled', tone: 'neutral', icon: Clock },
}

export function ReviewStatusBadge({ status, solid }: { status: ReviewStatus; solid?: boolean }) {
 return badge(REVIEW[status], solid)
}

const DECISION: Record<DecisionStatus, Spec> = {
 potential: { label: 'Potential decision', tone: 'yellow', icon: Lightbulb },
 confirmed: { label: 'Confirmed', tone: 'success', icon: Gavel },
 implemented: { label: 'Implemented', tone: 'success', icon: CheckCircle2 },
}

export function DecisionStatusBadge({ status, solid }: { status: DecisionStatus; solid?: boolean }) {
 return badge(DECISION[status], solid)
}

const ISSUE: Record<IssueStatus, Spec> = {
 open: { label: 'Open', tone: 'danger', icon: AlertTriangle },
 escalated: { label: 'Escalated', tone: 'danger', icon: ShieldAlert },
 resolved: { label: 'Resolved', tone: 'success', icon: CheckCircle2 },
}

export function IssueStatusBadge({ status, solid }: { status: IssueStatus; solid?: boolean }) {
 return badge(ISSUE[status], solid)
}

/** "2nd cycle" — the recurrence count, always next to the issue title. */
export function RecurrenceBadge({ occurrences }: { occurrences: number }) {
 if (occurrences < 2) return null
 return (
  <Badge tone="yellow" icon={<History size={11} strokeWidth={2.4} aria-hidden="true" />}>
   {occurrences} cycles
  </Badge>
 )
}
