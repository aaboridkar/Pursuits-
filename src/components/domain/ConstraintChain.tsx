import type { ChainLink } from '../../data/types'

const fmt = (v: number, unit: string) => {
 const signed = unit.startsWith('%') ? `${v}` : v > 0 ? `+${v.toLocaleString('en-US')}` : v.toLocaleString('en-US')
 return unit.startsWith('%') ? `${signed}%` : signed
}

/** Walks demand down through each binding constraint to the resulting service level. */
export function ConstraintChain({ chain }: { chain: ChainLink[] }) {
 return (
  <div className="flex flex-wrap gap-0 overflow-hidden rounded-md border border-border">
   {chain.map((link, i) => {
    const isLast = i === chain.length - 1
    return (
     <div
      key={link.label}
      className={`min-w-[120px] flex-1 border-border px-2.5 py-1.5 ${i > 0 ? 'border-l' : ''} ${
       isLast ? 'bg-bad-soft' : 'bg-surface'
      }`}
     >
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-faint">{link.label}</div>
      <div className={`tabular mt-0.5 text-sm font-extrabold tracking-[-0.02em] ${isLast ? 'text-bad' : 'text-ink'}`}>
       {fmt(link.value, link.unit)}
      </div>
      <div className="text-[11px] text-ink-muted">{link.unit.replace(/^%\s*/, '').replace(/^,\s*/, '')}</div>
     </div>
    )
   })}
  </div>
 )
}

