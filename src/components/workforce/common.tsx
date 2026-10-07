import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { gradeTitle } from '../../../shared/catalog'
import type { Provenance } from '../../../shared/types'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { StatBar } from '../ui/StatBar'
import { TABLE_TH } from '../ui/table'
import { UI_ICON } from '../ui/icons'
import { ProvenanceTag } from './badges'

const AlertIcon = UI_ICON.alert
const ChevronDown = UI_ICON.chevronDown

/** An employee, always as code + grade title, linking to their 360. */
export function EmployeeCell({ code, grade, title, provenance, sub }: { code: string; grade?: number | null; title?: string; provenance?: Provenance; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Link to={`/employees/${code}`} className="font-semibold text-ink hover:text-brand hover:underline">
          {code}
        </Link>
        {provenance && <ProvenanceTag provenance={provenance} compact />}
      </div>
      <div className="text-[11px] font-normal text-ink-faint">
        {title ?? (grade ? gradeTitle(grade) : '')}
        {grade ? <span> · G{grade}</span> : null}
        {sub && <> · {sub}</>}
      </div>
    </div>
  )
}

/** A 0–100 score printed first, with a meter under it. Colour follows the band, never alone. */
export function ScoreCell({ value, width = 72, label }: { value: number; width?: number; label?: string }) {
  const fill = value >= 75 ? 'var(--color-good)' : value >= 55 ? 'var(--color-meter-fill)' : 'var(--color-ink-faint)'
  return (
    <div style={{ width }} title={label}>
      <div className="tabular text-[12.5px] font-bold text-ink">{value}</div>
      <StatBar value={value} fill={fill} className="mt-0.5" />
    </div>
  )
}

/** Loading / error frame for an API-backed screen. */
export function Loadable<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean }; children: (data: T) => ReactNode }) {
  if (state.error)
    return (
      <Card>
        <EmptyState icon={<AlertIcon size={16} aria-hidden="true" />} title="Couldn’t load this view" body={`${state.error}. Is the API running (npm run dev)?`} />
      </Card>
    )
  if (!state.data)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="h-[74px] animate-pulse rounded-lg bg-surface-sunken" />
        <div className="h-[260px] animate-pulse rounded-lg bg-surface-sunken" />
      </div>
    )
  return <>{children(state.data)}</>
}

// --- sortable, filterable tables ---------------------------------------------------------

export type SortDir = 'asc' | 'desc'

export function useSort<T, K extends string>(rows: T[], accessors: Record<K, (r: T) => string | number | null>, initial: { key: K; dir: SortDir }) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => {
    const get = accessors[sort.key]
    return [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      if (x === y) return 0
      if (x === null) return 1
      if (y === null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.dir === 'asc' ? c : -c
    })
    // accessors are static per call site, so only rows and sort drive this.
  }, [rows, sort])
  const toggle = (key: K) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  return { sorted, sort, toggle }
}

/** A column header that sorts on click, in the shared TABLE_TH style. */
export function SortTh<K extends string>({ label, k, sort, onSort, className = '', title }: { label: string; k: K; sort: { key: K; dir: SortDir }; onSort: (k: K) => void; className?: string; title?: string }) {
  const active = sort.key === k
  return (
    <th className={`${TABLE_TH} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} title={title}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-[.09em] transition-colors ${active ? 'text-brand' : 'hover:text-ink-muted'}`}>
        {label}
        <ChevronDown size={11} strokeWidth={2.4} aria-hidden="true" className={`transition-transform ${active ? (sort.dir === 'asc' ? 'rotate-180' : '') : 'opacity-0'}`} />
      </button>
    </th>
  )
}

/** Multi-select column filters keyed by column. Pairs with <ColumnFilter>. */
/** `initial` pre-ticks values per column, e.g. to hide some rows until the user asks for them. */
export function useFilters<K extends string>(initial: Partial<Record<K, string[]>> = {}) {
  const [filters, setFilters] = useState<Partial<Record<K, Set<string>>>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, vs]) => [k, new Set(vs as string[])])) as Partial<Record<K, Set<string>>>,
  )
  const get = (k: K) => filters[k] ?? new Set<string>()
  const toggle = (k: K, v: string) =>
    setFilters((f) => {
      const next = new Set(f[k] ?? [])
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return { ...f, [k]: next }
    })
  const clear = (k: K) => setFilters((f) => ({ ...f, [k]: new Set() }))
  const passes = (k: K, v: string) => get(k).size === 0 || get(k).has(v)
  return { get, toggle, clear, passes }
}

/** A search box in the shared field style. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const Icon = UI_ICON.search
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{placeholder}</span>
      <span className="pointer-events-none absolute left-2.5 text-ink-faint">
        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[32px] w-[220px] rounded-md border border-border-strong bg-surface py-1 pl-8 pr-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand"
      />
    </label>
  )
}

/** A compact segmented control, sharing the Tabs blue-marks-current rule. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border border-border-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`min-h-[26px] rounded-[4px] px-2.5 text-2xs font-semibold transition-colors ${o.id === value ? 'bg-brand-soft text-brand-active' : 'text-ink-muted hover:bg-surface-sunken'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Meta-strip separator for PageHeader. */
export const Dot = () => <span className="text-ink-faint" aria-hidden="true">·</span>
