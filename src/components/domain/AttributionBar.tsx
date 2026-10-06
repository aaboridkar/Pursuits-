import type { Driver } from '../../data/types'

// Three steps of the brand ramp — reinforcement colour, but every segment
// is labelled by name and value, never colour alone.
const SEGMENT_COLOR = ['var(--color-c1)', 'var(--color-c2)', 'var(--color-c4)']

/** Splits a demand uplift into its named, source-verifiable drivers. */
export function AttributionBar({ drivers }: { drivers: Driver[] }) {
 const total = drivers.reduce((sum, d) => sum + d.pp, 0)

 return (
  <div>
   <div
    className="flex h-[22px] overflow-hidden rounded-md"
    role="img"
    aria-label={`Attribution: ${drivers.map((d) => `${d.label} ${d.pp} points`).join(', ')}`}
   >
    {drivers.map((d, i) => (
     <div
      key={d.label}
      className="flex items-center justify-center overflow-hidden whitespace-nowrap px-2 text-[11px] font-bold text-white tabular"
      style={{ flexGrow: d.pp, flexBasis: 0, background: SEGMENT_COLOR[i % SEGMENT_COLOR.length] }}
     >
      +{d.pp.toFixed(1)} pp
     </div>
    ))}
   </div>
   <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
    {drivers.map((d, i) => (
     <div key={d.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span
       aria-hidden="true"
       className="h-2 w-2 shrink-0 rounded-xs"
       style={{ background: SEGMENT_COLOR[i % SEGMENT_COLOR.length] }}
      />
      <dt className="font-semibold text-ink">{d.label}</dt>
      <dd>{d.source} · {d.sourceSystem}</dd>
     </div>
    ))}
   </dl>
   <p className="mt-1.5 text-[11px] text-ink-faint">Sums to +{total.toFixed(1)} pp against baseline.</p>
  </div>
 )
}

