import { AlertTriangle, Armchair, CheckCircle2, CircleDashed, Clock, Eye, Hourglass, Loader, Palmtree, ShieldAlert, Trophy, UserCheck, UserPlus, XCircle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { AllocationKind, AvailabilityStatus, CoverageStatus, OpportunityOutcome, Provenance, RiskLevel } from '../../../shared/types'

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

export const AVAILABILITY: Record<AvailabilityStatus, Spec> = {
  'fully-allocated': { label: 'Fully allocated', tone: 'success', icon: CheckCircle2 },
  'partially-available': { label: 'Partially available', tone: 'blue', icon: CircleDashed },
  bench: { label: 'Bench', tone: 'yellow', icon: Armchair },
  'on-leave': { label: 'On leave', tone: 'neutral', icon: Palmtree },
}
export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  return badge(AVAILABILITY[status])
}

const RISK: Record<RiskLevel, Spec> = {
  high: { label: 'High', tone: 'danger', icon: AlertTriangle },
  medium: { label: 'Medium', tone: 'yellow', icon: AlertTriangle },
  low: { label: 'Low', tone: 'neutral', icon: Eye },
}
export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return badge(RISK[risk])
}

const COVERAGE: Record<CoverageStatus, Spec> = {
  filled: { label: 'Filled', tone: 'success', icon: CheckCircle2 },
  partial: { label: 'Partly filled', tone: 'blue', icon: Loader },
  proposed: { label: 'Proposed', tone: 'yellow', icon: UserPlus },
  unfilled: { label: 'Unfilled', tone: 'danger', icon: AlertTriangle },
  closed: { label: 'Closed', tone: 'neutral', icon: XCircle },
}
export function CoverageBadge({ coverage }: { coverage: CoverageStatus }) {
  return badge(COVERAGE[coverage])
}

const OUTCOME: Record<OpportunityOutcome, Spec> = {
  won: { label: 'Won', tone: 'success', icon: Trophy },
  open: { label: 'Open', tone: 'blue', icon: Hourglass },
  lost: { label: 'Lost', tone: 'neutral', icon: XCircle },
}
export function OutcomeBadge({ outcome }: { outcome: OpportunityOutcome }) {
  return badge(OUTCOME[outcome])
}

const SEVERITY: Record<'critical' | 'high' | 'watch', Spec> = {
  critical: { label: 'Critical', tone: 'danger', icon: AlertTriangle },
  high: { label: 'High', tone: 'yellow', icon: AlertTriangle },
  watch: { label: 'Watch', tone: 'neutral', icon: Eye },
}
export function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'watch' }) {
  return badge(SEVERITY[severity])
}

export function AssignmentBadge({ status }: { status: 'proposed' | 'confirmed' }) {
  return status === 'confirmed' ? badge({ label: 'Confirmed', tone: 'success', icon: UserCheck }) : badge({ label: 'Proposed', tone: 'yellow', icon: Clock })
}

export function CoverageRiskBadge({ risk }: { risk: 'covered' | 'at-risk' | 'gap' | 'n/a' }) {
  if (risk === 'covered') return badge({ label: 'Staffed', tone: 'success', icon: CheckCircle2 })
  if (risk === 'gap') return badge({ label: 'Skill gap', tone: 'danger', icon: ShieldAlert })
  if (risk === 'at-risk') return badge({ label: 'Staffable', tone: 'yellow', icon: UserPlus })
  return <span className="text-ink-faint">—</span>
}

/** Allocation kind → chart colour + label. Fixed order; never cycled. */
export const KIND_META: Record<AllocationKind | 'free', { label: string; color: string }> = {
  billable: { label: 'Billable', color: 'var(--color-c1)' },
  internal: { label: 'Internal', color: 'var(--color-c3)' },
  bench: { label: 'Bench', color: 'var(--color-c2)' },
  blocked: { label: 'Soft-blocked', color: 'var(--color-c4)' },
  leave: { label: 'Leave', color: 'var(--color-c5)' },
  free: { label: 'Unbooked', color: 'var(--color-meter-track)' },
}

/**
 * Marks a record that is not from a source CSV. Neutral and quiet — it is
 * provenance, not status — and always spelled out.
 */
export function ProvenanceTag({ provenance, compact }: { provenance: Provenance; compact?: boolean }) {
  if (provenance === 'source') return null
  const label = provenance === 'synthetic' ? 'Synthetic' : provenance === 'derived' ? 'Derived' : 'Added in app'
  return (
    <span
      title={
        provenance === 'synthetic'
          ? 'Generated to fill a gap in the source data (data/synthetic)'
          : provenance === 'derived'
            ? 'Computed from source fields'
            : 'Created in this app'
      }
      className={`inline-flex items-center rounded-xs border border-dashed border-border-strong font-semibold uppercase tracking-[0.05em] text-ink-faint ${
        compact ? 'px-1 text-[9px] leading-[14px]' : 'px-1.5 text-[9.5px] leading-[16px]'
      }`}
    >
      {compact ? label.slice(0, 3) : label}
    </span>
  )
}

/** Field-level marker for a value that was assumed or derived rather than read. */
export function Est({ provenance, note }: { provenance?: Provenance; note?: string }) {
  if (!provenance || provenance === 'source') return null
  return (
    <sup className="ml-0.5 cursor-help text-[9.5px] font-semibold text-ink-faint" title={note ?? (provenance === 'derived' ? 'Derived from other tracker fields' : 'Assumed — blank in the tracker')}>
      {provenance === 'derived' ? 'drv' : 'est.'}
    </sup>
  )
}
