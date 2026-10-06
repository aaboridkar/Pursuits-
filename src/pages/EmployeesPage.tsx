import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AvailabilityStatus, EmployeeCapacity } from '../../shared/types'
import { useApi } from '../api/client'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { StatBar } from '../components/ui/StatBar'
import { Tabs } from '../components/ui/Tabs'
import { Tile } from '../components/ui/Tile'
import { UI_ICON } from '../components/ui/icons'
import { AVAILABILITY, AvailabilityBadge, ProvenanceTag } from '../components/workforce/badges'
import { Dot, Loadable, SearchField } from '../components/workforce/common'
import { fmtDate } from '../engine/format'

const ACCENT: Record<AvailabilityStatus, string> = {
  'fully-allocated': 'var(--color-c1)',
  'partially-available': 'var(--color-c3)',
  bench: 'var(--color-c2)',
  'on-leave': 'var(--color-c5)',
}

export function EmployeesPage() {
  const state = useApi<EmployeeCapacity[]>('/api/employees')
  return <Loadable state={state}>{(rows) => <Directory rows={rows} />}</Loadable>
}

function Directory({ rows }: { rows: EmployeeCapacity[] }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | AvailabilityStatus>('all')
  const shown = rows
    .filter((r) => (tab === 'all' || r.status === tab) && (!q || `${r.code} ${r.title} ${r.currentProject ?? ''} ${r.currentClient ?? ''} ${r.keySkills.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code))

  return (
    <>
      <PageHeader
        breadcrumbs={['Workforce', 'People']}
        meta={
          <>
            <span className="font-semibold text-ink">{rows.length} people in the Supply Chain practice</span>
            <Dot />
            <span className="text-ink-muted">open anyone for their Employee 360</span>
          </>
        }
        actions={<SearchField value={q} onChange={setQ} placeholder="Search code, project, client, skill" />}
      />
      <Tabs
        ariaLabel="Filter by status"
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'all' as const, label: 'Everyone', count: rows.length }, ...(Object.keys(AVAILABILITY) as AvailabilityStatus[]).map((s) => ({ id: s, label: AVAILABILITY[s].label, count: rows.filter((r) => r.status === s).length }))]}
      />
      {shown.length === 0 ? (
        <EmptyState icon={<UI_ICON.users size={16} aria-hidden="true" />} title="No one matches" body="Try a different search or status." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((r) => (
            <Link key={r.code} to={`/employees/${r.code}`} className="min-w-0">
              <Tile interactive accent={ACCENT[r.status]} className="flex h-full flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-extrabold tracking-[-0.01em] text-ink">
                      {r.code}
                      <ProvenanceTag provenance={r.provenance} compact />
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {r.title} · G{r.grade}
                    </div>
                  </div>
                  <AvailabilityBadge status={r.status} />
                </div>
                <div className="truncate text-[11.5px] text-ink-muted">{r.currentProject ? `${r.currentProject} · ${r.currentClient}` : r.benchProject ?? 'No current project'}</div>
                <div>
                  <div className="flex justify-between text-[11px] text-ink-faint">
                    <span>
                      Allocated <span className="tabular font-bold text-ink">{r.allocation}%</span>
                    </span>
                    <span className="tabular">{r.status === 'bench' ? `${r.benchDays}d on bench` : r.rollOffDate ? `rolls off ${fmtDate(r.rollOffDate)}` : ''}</span>
                  </div>
                  <StatBar value={r.allocation} className="mt-1" />
                </div>
                <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                  {r.keySkills.slice(0, 3).map((s) => (
                    <span key={s} className="rounded-full bg-surface-sunken px-2 py-[1px] text-[10.5px] text-ink-muted">
                      {s}
                    </span>
                  ))}
                </div>
              </Tile>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
