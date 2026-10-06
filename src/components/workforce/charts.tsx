// Charts. Plain SVG/CSS on the design tokens — no chart library. Rules kept
// throughout: one value axis, thin marks with 2px surface gaps, rounded
// data-ends on the baseline, a legend whenever there are ≥2 series, a hover
// tooltip on every mark, and text in ink tokens (never the series colour).

import { useState, type ReactNode } from 'react'
import { toDay } from '../../../shared/dates'
import type { AllocationKind, MonthBreakdown, MonthSupplyDemand, Segment } from '../../../shared/types'
import { fmtDate, fmtDayMonth, fmtMonth, fmtNum, fmtSigned } from '../../engine/format'
import { KIND_META } from './badges'

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-xs" style={i.dashed ? { border: `1.5px dashed ${i.color}` } : { background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, children }: { x: number | string; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 min-w-[170px] -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] shadow-lg" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  )
}
const TipRow = ({ color, label, value, dashed }: { color?: string; label: string; value: string; dashed?: boolean }) => (
  <div className="flex items-center justify-between gap-4 py-[1px]">
    <span className="flex items-center gap-1.5 text-ink-muted">
      {color && <span className="h-2 w-2 rounded-xs" style={dashed ? { border: `1.5px dashed ${color}` } : { background: color }} />}
      {label}
    </span>
    <span className="tabular font-bold text-ink">{value}</span>
  </div>
)

/** A bar with its top corners rounded and its base square on the baseline. */
const barPath = (x: number, y: number, w: number, h: number, r = 3) => {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

const niceMax = (v: number) => {
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]
  return steps.find((s) => s >= v) ?? Math.ceil(v / 50) * 50
}

// --- Supply vs demand -----------------------------------------------------------------------

export function SupplyDemandChart({ data, highlight }: { data: MonthSupplyDemand[]; highlight?: string[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 220
  const pad = { l: 34, r: 8, t: 10, b: 44 }
  const max = niceMax(Math.max(...data.flatMap((d) => [d.supplyFte, d.demandFteUnweighted, d.demandFte])) * 1.05)
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const band = iw / data.length
  const bw = Math.min(26, band / 3.4)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max]

  const SUPPLY = 'var(--color-c1)'
  const DEMAND = 'var(--color-c2)'

  return (
    <div>
      <Legend
        items={[
          { label: 'Available capacity (FTE)', color: SUPPLY },
          { label: 'Expected demand · probability-weighted', color: DEMAND },
          { label: 'Demand if every open deal is won', color: 'var(--color-ink-faint)', dashed: true },
        ]}
      />
      <div className="relative mt-2 max-w-[860px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Available capacity against expected demand, by month">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-(--color-ink-faint) text-[10px]">
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2
            const inWindow = !highlight || highlight.includes(d.month)
            return (
              <g key={d.month} opacity={inWindow ? 1 : 0.45}>
                {hover === i && <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={ih} fill="var(--color-surface-sunken)" rx={4} />}
                <path d={barPath(cx - bw - 1, y(d.supplyFte), bw, y(0) - y(d.supplyFte))} fill={SUPPLY} />
                <path d={barPath(cx + 1, y(d.demandFte), bw, y(0) - y(d.demandFte))} fill={DEMAND} />
                {d.demandFteUnweighted > d.demandFte && (
                  <rect x={cx + 1.75} y={y(d.demandFteUnweighted)} width={bw - 1.5} height={Math.max(0, y(d.demandFte) - y(d.demandFteUnweighted) - 2)} fill="none" stroke="var(--color-ink-faint)" strokeWidth={1.25} strokeDasharray="3 2" rx={2} />
                )}
                <text x={cx} y={H - pad.b + 15} textAnchor="middle" className="fill-(--color-ink-muted) text-[10.5px] font-semibold">
                  {fmtMonth(d.month)}
                </text>
                <text x={cx} y={H - pad.b + 30} textAnchor="middle" className={`text-[10.5px] font-bold ${d.gapFte < 0 ? 'fill-(--color-bad)' : 'fill-(--color-ink-faint)'}`}>
                  {d.gapFte < 0 ? `${fmtSigned(d.gapFte)} short` : `${fmtSigned(d.gapFte)} spare`}
                </text>
                <rect x={pad.l + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            )
          })}
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-border-strong)" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <Tooltip x={`${((pad.l + band * hover + band / 2) / W) * 100}%`} y={0}>
            <div className="mb-1 font-bold text-ink">{fmtMonth(data[hover].month)}</div>
            <TipRow color={SUPPLY} label="Available" value={`${fmtNum(data[hover].supplyFte)} FTE`} />
            <TipRow color={DEMAND} label="Expected demand" value={`${fmtNum(data[hover].demandFte)} FTE`} />
            <TipRow color="var(--color-ink-faint)" dashed label="If all won" value={`${fmtNum(data[hover].demandFteUnweighted)} FTE`} />
            <TipRow label="Already confirmed" value={`${fmtNum(data[hover].confirmedFte)} FTE`} />
            <div className="mt-1 border-t border-border pt-1">
              <TipRow label={data[hover].gapFte < 0 ? 'Shortfall' : 'Spare capacity'} value={`${fmtNum(Math.abs(data[hover].gapFte))} FTE`} />
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// --- Stacked status bar (capacity by grade) -----------------------------------------------------

export const STATUS_SERIES = [
  { key: 'fully', label: 'Fully allocated', color: 'var(--color-c1)' },
  { key: 'partial', label: 'Partially available', color: 'var(--color-c3)' },
  { key: 'bench', label: 'Bench', color: 'var(--color-c2)' },
  { key: 'leave', label: 'On leave', color: 'var(--color-c5)' },
] as const

export function StackedBar({ parts, total, height = 14 }: { parts: { label: string; value: number; color: string }[]; total: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = parts.filter((p) => p.value > 0)
  return (
    <div className="relative">
      <div className="flex w-full gap-[2px] overflow-hidden rounded-sm" style={{ height }} role="img" aria-label={shown.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {shown.map((p, i) => (
          <div
            key={p.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center justify-center text-[10px] font-bold text-white tabular"
            style={{ flexGrow: p.value, flexBasis: 0, background: p.color, minWidth: 3 }}
          >
            {(p.value / total) * 100 >= 12 ? fmtNum(p.value) : ''}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-lg">
          <TipRow color={shown[hover].color} label={shown[hover].label} value={fmtNum(shown[hover].value)} />
        </div>
      )}
    </div>
  )
}

// --- Monthly allocation (employee 360) ------------------------------------------------------------

const MONTH_KINDS: AllocationKind[] = ['billable', 'internal', 'blocked', 'bench', 'leave']

export function MonthlyAllocationChart({ months, asOfMonth }: { months: MonthBreakdown[]; asOfMonth: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const H = 120
  return (
    <div>
      <Legend items={[...MONTH_KINDS.map((k) => ({ label: KIND_META[k].label, color: KIND_META[k].color })), { label: 'Unbooked', color: 'var(--color-meter-track)' }]} />
      <div className="relative mt-2 flex items-end gap-[3px]" style={{ height: H + 18 }}>
        {months.map((m, i) => {
          const segs = MONTH_KINDS.map((k) => ({ k, v: Math.min(100, m[k]) })).filter((s) => s.v > 0)
          const booked = segs.reduce((s, x) => s + x.v, 0)
          return (
            <div key={m.month} className="relative flex min-w-0 flex-1 flex-col items-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={`flex w-full max-w-[34px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[3px] ${hover === i ? 'ring-2 ring-border-strong' : ''}`} style={{ height: H, background: 'var(--color-meter-track)' }}>
                {segs.map((s) => (
                  <div key={s.k} style={{ height: `${(s.v / Math.max(100, booked)) * 100}%`, background: KIND_META[s.k].color }} />
                ))}
              </div>
              <div className={`mt-1 truncate text-[10px] ${m.month === asOfMonth ? 'font-bold text-brand-active' : 'text-ink-faint'}`}>{fmtMonth(m.month)}</div>
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 min-w-[160px] -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] shadow-lg">
                  <div className="mb-1 font-bold text-ink">
                    {fmtMonth(m.month)}
                    {m.month === asOfMonth ? ' · snapshot' : m.month > asOfMonth ? ' · booked ahead' : ''}
                  </div>
                  {MONTH_KINDS.map((k) => (m[k] > 0 ? <TipRow key={k} color={KIND_META[k].color} label={KIND_META[k].label} value={`${fmtNum(m[k])}%`} /> : null))}
                  <TipRow label="Free capacity" value={`${fmtNum(m.available)}%`} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Deployment timeline (Gantt) ------------------------------------------------------------------

export function DeploymentTimeline({ segments, asOf, from, to }: { segments: Segment[]; asOf: string; from: string; to: string }) {
  const [hover, setHover] = useState<Segment | null>(null)
  const d0 = toDay(from)
  const span = toDay(to) - d0
  const x = (iso: string) => Math.max(0, Math.min(100, ((toDay(iso) - d0) / span) * 100))

  // Greedy lane packing so concurrent allocations stack instead of overlapping.
  const lanes: Segment[][] = []
  for (const s of [...segments].sort((a, b) => a.start.localeCompare(b.start))) {
    const lane = lanes.find((l) => l.at(-1)!.end < s.start)
    if (lane) lane.push(s)
    else lanes.push([s])
  }
  const months: string[] = []
  for (let d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 10))

  return (
    <div>
      <Legend items={(['billable', 'internal', 'blocked', 'bench', 'leave'] as AllocationKind[]).map((k) => ({ label: KIND_META[k].label, color: KIND_META[k].color }))} />
      <div className="relative mt-2">
        <div className="relative h-4 border-b border-border text-[10px] text-ink-faint">
          {months.map((m) => (
            <span key={m} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(m)}%` }}>
              {fmtMonth(m.slice(0, 7))}
            </span>
          ))}
        </div>
        <div className="relative py-1.5">
          {months.map((m) => (
            <span key={m} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${x(m)}%` }} aria-hidden="true" />
          ))}
          {lanes.map((lane, li) => (
            <div key={li} className="relative my-[3px] h-[22px]">
              {lane.map((s) => {
                const left = x(s.start)
                const width = Math.max(0.6, x(s.end) - left + (100 / span) * 1)
                return (
                  <div
                    key={`${s.label}-${s.start}`}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(null)}
                    className={`absolute inset-y-0 flex items-center overflow-hidden rounded-[3px] px-1.5 text-[10.5px] font-semibold text-white ${s.provenance === 'app' ? 'outline-2 outline-dashed outline-offset-1 outline-good' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%`, background: KIND_META[s.kind].color, opacity: s.pct < 100 ? 0.85 : 1 }}
                  >
                    <span className="truncate">
                      {s.label}
                      {s.pct < 100 ? ` · ${s.pct}%` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
          <span className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${x(asOf)}%` }} aria-hidden="true" />
          <span className="absolute -top-0.5 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[9.5px] font-bold text-white" style={{ left: `${x(asOf)}%` }}>
            Today
          </span>
        </div>
        {hover && (
          <div className="mt-1 rounded-md border border-border bg-surface-sunken px-2.5 py-1.5 text-[11px] text-ink-muted">
            <span className="font-bold text-ink">{hover.label}</span> · {hover.client} · {KIND_META[hover.kind].label} {hover.pct}% · {fmtDate(hover.start)} – {fmtDate(hover.end)}
            {hover.provenance === 'app' && ' · confirmed in this app'}
            {hover.provenance === 'synthetic' && ' · synthetic'}
          </div>
        )}
        {!hover && <p className="mt-1 text-[11px] text-ink-faint">Hover a bar for project, client and dates. Today is {fmtDayMonth(asOf)}.</p>}
      </div>
    </div>
  )
}
