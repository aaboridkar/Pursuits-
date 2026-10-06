import { Link } from 'react-router-dom'
import { WORKFLOW_ICON } from './icons'

export type JourneyStage = 'opportunity' | 'requirement' | 'gap' | 'candidates' | 'employee'

/** Where each stage leads when the screen has no more specific link for it. */
const STAGES: { key: JourneyStage; label: string; to: string }[] = [
  { key: 'opportunity', label: 'Opportunity', to: '/opportunities' },
  { key: 'requirement', label: 'Requirement', to: '/opportunities' },
  { key: 'gap', label: 'Capacity gap', to: '/capacity' },
  { key: 'candidates', label: 'Candidates', to: '/workbench' },
  { key: 'employee', label: 'Employee', to: '/employees' },
]

/**
 * The deployment story line — Opportunity › Requirement › Capacity gap ›
 * Candidates › Employee — with the current stage in brand blue. Screens pass
 * `links` so each stage jumps to the record in context, not just the list.
 */
export function JourneyStrip({ current, links = {} }: { current: JourneyStage; links?: Partial<Record<JourneyStage, string>> }) {
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Deployment journey">
      {STAGES.map((s, i) => {
        const Icon = WORKFLOW_ICON[s.key]
        const isCurrent = s.key === current
        return (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-border-strong" aria-hidden="true">
                ›
              </span>
            )}
            <Link
              to={links[s.key] ?? s.to}
              aria-current={isCurrent ? 'step' : undefined}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.05em] transition-colors ${
                isCurrent ? 'bg-brand-soft text-brand-active' : 'text-ink-faint hover:bg-surface-sunken hover:text-ink-muted'
              }`}
            >
              <Icon size={11} strokeWidth={2.4} aria-hidden="true" />
              {s.label}
            </Link>
          </span>
        )
      })}
    </nav>
  )
}
