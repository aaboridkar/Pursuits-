import { Tile } from '../ui/Tile'
import { StatBar } from '../ui/StatBar'

interface KpiTileProps {
 label: string
 value: string
 detail: string
 /** 0–100 meter value, when this KPI has a natural percentage reading. */
 meter?: number
 meterTarget?: number
 tone?: 'brand' | 'bad' | 'good'
 /** No own border/radius/shadow — for a strip of tiles sharing a divider between them. */
 plain?: boolean
}

const TONE_FILL: Record<NonNullable<KpiTileProps['tone']>, string> = {
 brand: 'var(--color-meter-fill)',
 bad: 'var(--color-bad)',
 good: 'var(--color-good)',
}
const TONE_TRACK: Record<NonNullable<KpiTileProps['tone']>, string> = {
 brand: 'var(--color-meter-track)',
 bad: 'var(--color-bad-soft)',
 good: 'var(--color-good-soft)',
}

/** A KPI value is never left to a meter alone — the figure prints first. */
export function KpiTile({ label, value, detail, meter, meterTarget, tone = 'brand', plain }: KpiTileProps) {
 return (
  <Tile className="min-w-0" plain={plain}>
   <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">{label}</div>
   <div className="figure tabular mt-0.5 text-lg text-ink">{value}</div>
   <div className="mt-0.5 truncate text-[11px] text-ink-muted">{detail}</div>
   {meter !== undefined && (
    <StatBar
     value={meter}
     target={meterTarget}
     fill={TONE_FILL[tone]}
     track={TONE_TRACK[tone]}
     className="mt-2"
    />
   )}
  </Tile>
 )
}

