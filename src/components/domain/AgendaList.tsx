import type { AgendaItem } from '../../data/types'
import { UI_ICON } from '../ui/icons'

const CheckIcon = UI_ICON.check

interface AgendaListProps {
 agenda: AgendaItem[]
 currentId?: string
 /** Nothing is "done" before the meeting starts. */
 started: boolean
}

/** The agenda as progress — blue marks the item being discussed, nothing else. */
export function AgendaList({ agenda, currentId, started }: AgendaListProps) {
 const currentIndex = agenda.findIndex((a) => a.id === currentId)
 return (
  <ol className="space-y-1" aria-label="Agenda">
   {agenda.map((a, i) => {
    const state = !started ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
    return (
     <li
      key={a.id}
      aria-current={state === 'now' ? 'step' : undefined}
      className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${state === 'now' ? 'bg-brand-soft' : ''}`}
     >
      <span
       className={`tabular mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold ${
        state === 'now'
         ? 'border-brand bg-brand text-brand-ink'
         : state === 'done'
          ? 'border-ink-muted bg-ink-muted text-white'
          : 'border-border-strong text-ink-faint'
       }`}
      >
       {state === 'done' ? <CheckIcon size={11} strokeWidth={3} aria-hidden="true" /> : i + 1}
      </span>
      <div className="min-w-0 flex-1">
       <div className={`text-xs leading-snug ${state === 'now' ? 'font-bold text-brand-active' : state === 'done' ? 'font-semibold text-ink-muted' : 'font-semibold text-ink-faint'}`}>{a.title}</div>
       <div className="text-[11px] leading-snug text-ink-faint">{a.detail}</div>
      </div>
      <span className="tabular shrink-0 text-[10.5px] text-ink-faint">{a.minutes}′</span>
     </li>
    )
   })}
  </ol>
 )
}
