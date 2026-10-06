import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addMonths } from '../../shared/dates'
import type { AvailabilityStatus, EmployeeCapacity, Horizon, MonthSupplyDemand } from '../../shared/types'
import { useApi } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Card } from '../components/ui/Card'
import { Collapsible } from '../components/ui/Collapsible'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Tabs } from '../components/ui/Tabs'
import { UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_ROW_HOVER, TABLE_TD, TABLE_TH } from '../components/ui/table'
import { AVAILABILITY, AvailabilityBadge } from '../components/workforce/badges'
import { SupplyDemandChart } from '../components/workforce/charts'
import { Dot, EmployeeCell, Loadable, SearchField, SortTh, useSort } from '../components/workforce/common'
import { StatBar } from '../components/ui/StatBar'
import { fmtDate, fmtNum } from '../engine/format'

type Row = EmployeeCapacity & { horizonStatus: AvailabilityStatus; horizonAvailable: number; horizonAllocation: number; horizonProject: string | null }
interface CapacityResponse {
  asOf: string
  horizon: Horizon
  rows: Row[]
  supplyDemand: MonthSupplyDemand[]
}

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: '1m', label: 'Next month' },
  { id: '3m', label: 'Next 3 months' },
  { id: '6m', label: 'Next 6 months' },
]
const STATUS_LABEL = (s: AvailabilityStatus) => AVAILABILITY[s].label
const PAGE = 20

export function CapacityPage() {
  const [params, setParams] = useSearchParams()
  const horizon = (HORIZONS.find((h) => h.id === params.get('horizon'))?.id ?? 'now') as Horizon
  const state = useApi<CapacityResponse>(`/api/capacity?horizon=${horizon}`)
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }
  return <Loadable state={state}>{(d) => <Capacity data={d} horizon={horizon} params={params} setParam={setParam} />}</Loadable>
}

type Key = 'code' | 'grade' | 'allocation' | 'available' | 'from' | 'bench'

function Capacity({ data, horizon, params, setParam }: { data: CapacityResponse; horizon: Horizon; params: URLSearchParams; setParam: (k: string, v: string | null) => void }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const statusSel = new Set((params.get('status') ?? '').split(',').filter(Boolean))
  const gradeSel = new Set((params.get('grade') ?? '').split(',').filter(Boolean))
  const toggleIn = (key: string, set: Set<string>, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setParam(key, next.size ? [...next].join(',') : null)
    setPage(1)
  }

  const now = horizon === 'now'
  const at = now ? data.asOf : addMonths(data.asOf, horizon === '1m' ? 1 : horizon === '3m' ? 3 : 6)
  const statusAt = (r: Row) => (now ? r.status : r.horizonStatus)
  const filtered = data.rows.filter(
    (r) =>
      (statusSel.size === 0 || statusSel.has(statusAt(r))) &&
      (gradeSel.size === 0 || gradeSel.has(String(r.grade))) &&
      (!q || `${r.code} ${r.title} ${r.currentProject ?? ''} ${r.keySkills.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  )
  const { sorted, sort, toggle } = useSort<Row, Key>(
    filtered,
    {
      code: (r) => r.code,
      grade: (r) => r.grade,
      allocation: (r) => (now ? r.allocation : r.horizonAllocation),
      available: (r) => (now ? r.available : r.horizonAvailable),
      from: (r) => r.availableFrom,
      bench: (r) => r.benchDays,
    },
    { key: 'available', dir: 'desc' },
  )
  const pageCount = Math.ceil(sorted.length / PAGE)
  const shown = sorted.slice((page - 1) * PAGE, page * PAGE)

  const count = (s: AvailabilityStatus) => data.rows.filter((r) => statusAt(r) === s).length
  const freeFte = data.rows.reduce((s, r) => s + (now ? r.available : r.horizonAvailable), 0) / 100
  const becoming = data.rows.filter((r) => r.status === 'fully-allocated' && r.availableFrom && r.availableFrom <= at).length
  const grades = [...new Set(data.rows.map((r) => r.grade))].sort((a, b) => a - b).map(String)

  return (
    <>
      <StickyBand>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
          <KpiTile plain label={now ? 'Headcount' : `Headcount · ${fmtDate(at)}`} value={String(data.rows.length)} detail="Supply Chain practice" />
          <KpiTile plain label="Fully allocated" value={String(count('fully-allocated'))} detail={now ? 'today' : `on ${fmtDate(at)}`} meter={(count('fully-allocated') / data.rows.length) * 100} tone="good" />
          <KpiTile plain label="Partially available" value={String(count('partially-available'))} detail="some capacity unbooked" />
          <KpiTile plain label="Available / bench" value={String(count('bench'))} detail={`${count('on-leave')} on leave`} meter={(count('bench') / data.rows.length) * 100} tone="bad" />
          <KpiTile plain label="Free capacity" value={`${fmtNum(Math.round(freeFte * 10) / 10)} FTE`} detail={now ? 'unbooked today' : `unbooked on ${fmtDate(at)}`} />
          <KpiTile plain label="Becoming available" value={String(becoming)} detail={now ? 'fully booked today' : `roll off by ${fmtDate(at)}`} />
        </div>
      </StickyBand>

      <PageHeader
        breadcrumbs={['Workforce', 'Capacity & availability']}
        meta={
          <>
            <span className="font-semibold text-ink">{now ? `As of ${fmtDate(data.asOf)}` : `Projected to ${fmtDate(at)}`}</span>
            <Dot />
            <span className="text-ink-muted">allocated = billable + internal work · bench pools and soft blocks count as free</span>
          </>
        }
        actions={<SearchField value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search people, projects, skills" />}
      />

      <Tabs
        ariaLabel="Capacity horizon"
        value={horizon}
        onChange={(h) => (setParam('horizon', h === 'now' ? null : h), setPage(1))}
        tabs={HORIZONS.map((h) => ({ id: h.id, label: h.label }))}
        actions={<span className="text-[11px] text-ink-faint">Allocation and availability are read at the horizon date</span>}
      />

      <Card>
        {shown.length === 0 ? (
          <EmptyState icon={<UI_ICON.users size={16} aria-hidden="true" />} title="No one matches these filters" body="Clear a column filter or the search to see more people." />
        ) : (
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <SortTh label="Employee" k="code" sort={sort} onSort={toggle} />
                  <th className={TABLE_TH}>
                    <ColumnFilter label="Grade" options={grades} selected={gradeSel} onToggle={(v) => toggleIn('grade', gradeSel, v)} onClear={() => setParam('grade', null)} />
                  </th>
                  <th className={TABLE_TH}>{now ? 'Current project' : 'Project at horizon'}</th>
                  <SortTh label="Allocation" k="allocation" sort={sort} onSort={toggle} className="text-right" />
                  <SortTh label="Available" k="available" sort={sort} onSort={toggle} />
                  <SortTh label="Available from" k="from" sort={sort} onSort={toggle} />
                  <SortTh label="Bench age" k="bench" sort={sort} onSort={toggle} className="text-right" title="Continuous days at 0% allocation, to the snapshot" />
                  <th className={TABLE_TH}>Key skills</th>
                  <th className={TABLE_TH}>
                    <ColumnFilter
                      label="Status"
                      options={(['fully-allocated', 'partially-available', 'bench', 'on-leave'] as AvailabilityStatus[]).map(STATUS_LABEL)}
                      selected={new Set([...statusSel].map((s) => STATUS_LABEL(s as AvailabilityStatus)))}
                      onToggle={(label) => toggleIn('status', statusSel, Object.keys(AVAILABILITY).find((k) => STATUS_LABEL(k as AvailabilityStatus) === label)!)}
                      onClear={() => setParam('status', null)}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const alloc = now ? r.allocation : r.horizonAllocation
                  const avail = now ? r.available : r.horizonAvailable
                  const project = now ? r.currentProject : r.horizonProject
                  return (
                    <tr key={r.code} className={`${TABLE_ROW} ${TABLE_ROW_HOVER}`}>
                      <td className={TABLE_TD}>
                        <EmployeeCell code={r.code} grade={r.grade} title={r.title} provenance={r.provenance} />
                      </td>
                      <td className={`${TABLE_TD} tabular`}>G{r.grade}</td>
                      <td className={TABLE_TD}>
                        {project ? (
                          <span className="text-ink">{project}</span>
                        ) : (
                          <span className="text-ink-faint">{now && r.benchProject ? r.benchProject : 'No project'}</span>
                        )}
                        {now && r.currentClient && <div className="text-[11px] text-ink-faint">{r.currentClient}</div>}
                        {now && r.blockedFor && <div className="text-[11px] font-semibold text-warn">Soft-blocked for {r.blockedFor}</div>}
                      </td>
                      <td className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>{alloc}%</td>
                      <td className={TABLE_TD}>
                        <div className="w-[84px]">
                          <div className="tabular text-[12.5px] font-bold text-ink">{avail}%</div>
                          <StatBar value={avail} fill="var(--color-c2)" className="mt-0.5" />
                        </div>
                      </td>
                      <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                        {r.availableFrom === data.asOf ? <span className="font-semibold text-ink">Now</span> : fmtDate(r.availableFrom)}
                        {r.rollOffDate && r.status !== 'bench' && <div className="text-[11px] text-ink-faint">rolls off {fmtDate(r.rollOffDate)}</div>}
                      </td>
                      <td className={`${TABLE_TD} tabular whitespace-nowrap text-right`}>
                        {r.benchDays === null ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <span className={r.benchDays > 60 ? 'font-bold text-bad' : r.benchDays > 30 ? 'font-semibold text-warn' : 'text-ink'}>
                            {r.benchDays}d{r.benchHistoryLimited ? '+' : ''}
                          </span>
                        )}
                      </td>
                      <td className={TABLE_TD}>
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {r.keySkills.map((s) => (
                            <span key={s} className="rounded-full bg-surface-sunken px-2 py-[1px] text-[11px] text-ink-muted">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={TABLE_TD}>
                        <AvailabilityBadge status={statusAt(r)} />
                        {(r.status === 'bench' || r.status === 'partially-available') && (
                          <div className="mt-1">
                            <Link to={`/employees/${r.code}#matches`} className="text-[11px] font-semibold text-brand hover:underline">
                              See matches
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} totalRows={sorted.length} pageSize={PAGE} onChange={setPage} />
      </Card>

      <Card className="mt-3">
        <Collapsible label="Supply vs demand by month" icon={<UI_ICON.trending size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} defaultOpen summary={<Link to="/workbench" className="text-[11.5px] font-semibold text-brand hover:underline">Close the gap in the workbench</Link>}>
          <SupplyDemandChart data={data.supplyDemand} />
        </Collapsible>
      </Card>
    </>
  )
}
