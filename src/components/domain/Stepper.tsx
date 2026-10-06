import { Check } from 'lucide-react'
import type { Stage } from '../../data/types'
import { STAGE_ICON } from '../ui/icons'

const STAGES: { key: Stage; label: string }[] = [
 { key: 'sense', label: 'Sense' },
 { key: 'diagnose', label: 'Diagnose' },
 { key: 'simulate', label: 'Simulate' },
 { key: 'recommend', label: 'Recommend' },
 { key: 'decide', label: 'Decide' },
]

interface StepperProps {
 current: Stage
 dense?: boolean
 /** When provided, stages become the screen's navigation. */
 onSelect?: (stage: Stage) => void
}

/**
 * The five decision-cycle stages, rendered as progress — and, where
 * onSelect is passed, as this screen's only navigation. Blue marks the
 * current step only; no stage owns a permanent hue.
 */
export function Stepper({ current, dense, onSelect }: StepperProps) {
 const currentIndex = STAGES.findIndex((s) => s.key === current)

 return (
  <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Decision cycle progress">
   {STAGES.map((stage, i) => {
    const state = i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
    const Icon = STAGE_ICON[stage.key]
    const Tag = onSelect ? 'button' : 'span'
    return (
     <span key={stage.key} className="flex items-center gap-1.5" role="listitem">
      {i > 0 && <span className="text-border-strong" aria-hidden="true">›</span>}
      <Tag
       type={onSelect ? 'button' : undefined}
       onClick={onSelect ? () => onSelect(stage.key) : undefined}
       className={`inline-flex items-center gap-1.5 rounded-full py-1 text-[11px] font-bold uppercase tracking-[0.05em] ${
        dense ? 'px-1.5' : 'px-2.5'
       } ${onSelect ? 'transition-colors hover:bg-surface-sunken' : ''} ${
        state === 'now'
         ? 'bg-brand-soft text-brand-active'
         : state === 'done'
          ? 'text-ink-muted'
          : 'text-ink-faint'
       }`}
      >
       <span
        className={`flex h-[16px] w-[16px] items-center justify-center rounded-full border-[1.5px] ${
         state === 'now'
          ? 'border-brand bg-brand text-brand-ink'
          : state === 'done'
           ? 'border-ink-muted bg-ink-muted text-white'
           : 'border-border-strong text-ink-faint'
        }`}
       >
        {state === 'done' ? (
         <Check size={10} strokeWidth={3} aria-hidden="true" />
        ) : (
         <Icon size={10} strokeWidth={2.4} aria-hidden="true" />
        )}
       </span>
       {!dense && stage.label}
      </Tag>
     </span>
    )
   })}
  </div>
 )
}

