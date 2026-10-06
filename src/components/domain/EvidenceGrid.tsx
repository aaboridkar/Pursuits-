import type { EvidenceItem } from '../../data/types'
import { fmtDate } from '../../engine/format'
import { Tile } from '../ui/Tile'
import { SYSTEM_ICON, UI_ICON } from '../ui/icons'

const TONE_TEXT = { neutral: 'text-ink', good: 'text-good', bad: 'text-bad' } as const

interface EvidenceGridProps {
 items: EvidenceItem[]
 /** Called with the transcript line id when the user wants to see where it was said. */
 onShowInTranscript?: (lineId: string) => void
}

/** Each figure prints with its system of record and freshness — evidence, not assertion. */
export function EvidenceGrid({ items, onShowInTranscript }: EvidenceGridProps) {
 return (
  <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
   {items.map((e) => {
    const Icon = SYSTEM_ICON[e.sourceSystem] ?? UI_ICON.info
    return (
     <Tile key={e.id} accent={e.tone === 'bad' ? 'var(--color-bad)' : e.tone === 'good' ? 'var(--color-good)' : undefined} className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">{e.label}</dt>
      <dd className={`figure tabular mt-0.5 text-lg ${TONE_TEXT[e.tone ?? 'neutral']}`}>{e.value}</dd>
      <dd className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
       <Icon size={11} strokeWidth={2.2} className="shrink-0 text-ink-faint" aria-hidden="true" />
       <span className="truncate">
        {e.sourceSystem}
        {e.sourceDetail && <span className="text-ink-faint"> · {e.sourceDetail}</span>}
       </span>
      </dd>
      <dd className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] text-ink-faint">
       <span>Refreshed {fmtDate(e.refreshedAt)}</span>
       {e.transcriptLineId && onShowInTranscript && (
        <button type="button" onClick={() => onShowInTranscript(e.transcriptLineId!)} className="font-semibold text-brand hover:underline">
         Said at {e.transcriptLineId}
        </button>
       )}
      </dd>
     </Tile>
    )
   })}
  </dl>
 )
}
