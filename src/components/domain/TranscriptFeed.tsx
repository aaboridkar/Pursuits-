import { useEffect, useRef } from 'react'
import type { Person, TranscriptLine } from '../../data/types'
import { fmtClock } from '../../engine/format'
import { Badge } from '../ui/Badge'
import { SIGNAL_ICON, UI_ICON } from '../ui/icons'
import { EmptyState } from '../ui/EmptyState'

const AiIcon = UI_ICON.ai
const MicIcon = UI_ICON.mic

const SIGNAL_TONE: Record<string, { tone: 'danger' | 'yellow' | 'blue' | 'neutral' | 'success'; accent: string }> = {
 issue: { tone: 'danger', accent: 'var(--color-bad)' },
 recurrence: { tone: 'danger', accent: 'var(--color-bad)' },
 'action-risk': { tone: 'yellow', accent: 'var(--color-accent)' },
 'potential-decision': { tone: 'yellow', accent: 'var(--color-accent)' },
 evidence: { tone: 'blue', accent: 'var(--color-brand)' },
 conflict: { tone: 'danger', accent: 'var(--color-bad)' },
 parking: { tone: 'neutral', accent: 'var(--color-border-strong)' },
}

interface TranscriptFeedProps {
 lines: TranscriptLine[]
 people: Record<string, Person>
 listening: boolean
 highlightLineId?: string
}

/** The live transcript. Lines the facilitator reacted to carry an accent and a labelled badge. */
export function TranscriptFeed({ lines, people, listening, highlightLineId }: TranscriptFeedProps) {
 const endRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
  endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
 }, [lines.length, listening])

 if (lines.length === 0 && !listening) {
  return (
   <EmptyState
    icon={<MicIcon size={16} aria-hidden="true" />}
    title="Transcript starts when the meeting starts"
    body="The facilitator transcribes the Teams call and flags issues, evidence and potential decisions as they are spoken."
   />
  )
 }

 return (
  <ol className="space-y-2.5" aria-live="polite" aria-label="Transcript">
   {lines.map((line) => {
    const person = people[line.speakerId]
    const signal = line.signal
    const tone = signal ? SIGNAL_TONE[signal.kind] : undefined
    const SignalIcon = signal ? SIGNAL_ICON[signal.kind] : undefined
    const highlighted = line.id === highlightLineId
    return (
     <li
      key={line.id}
      id={`transcript-${line.id}`}
      className={`fade-in flex gap-3 rounded-md px-2.5 py-2 ${person?.isAi ? 'bg-brand-soft/50' : highlighted ? 'bg-warn-soft' : ''}`}
      style={tone ? { borderLeft: `3px solid ${tone.accent}` } : { borderLeft: '3px solid transparent' }}
     >
      <span
       className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        person?.isAi ? 'bg-brand text-brand-ink' : 'bg-ink-muted text-white'
       }`}
       aria-hidden="true"
      >
       {person?.isAi ? <AiIcon size={13} strokeWidth={2.4} /> : person?.initials}
      </span>
      <div className="min-w-0 flex-1">
       <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-bold text-ink">{person?.name ?? line.speakerId}</span>
        <span className="text-[11px] text-ink-faint">{person?.role}</span>
        <span className="tabular text-[11px] text-ink-faint">{fmtClock(line.offsetSec)}</span>
        {signal && tone && SignalIcon && (
         <Badge tone={tone.tone} icon={<SignalIcon size={11} strokeWidth={2.4} aria-hidden="true" />}>
          {signal.label}
         </Badge>
        )}
       </div>
       <p className={`mt-0.5 text-[13px] leading-relaxed ${signal?.kind === 'potential-decision' ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{line.text}</p>
      </div>
     </li>
    )
   })}
   {listening && (
    <li className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-ink-faint" aria-label="Listening">
     <span className="flex gap-[3px]" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" />
     </span>
     Listening…
    </li>
   )}
   <div ref={endRef} />
  </ol>
 )
}
