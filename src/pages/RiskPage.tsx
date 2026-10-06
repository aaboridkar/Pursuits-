import { Link } from 'react-router-dom'
import type { PersonAtRisk, RiskLevel } from '../../shared/types'
import { useApi } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { NAV_ICON, UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TH } from '../components/ui/table'
import { AvailabilityBadge, RiskBadge } from '../components/workforce/badges'
import { Dot, EmployeeCell, Loadable, ScoreCell, SortTh, useFilters, useSort } from '../components/workforce/common'
import { fmtDate, fmtPct } from '../engine/format'

const ArrowRight = UI_ICON.arrowRight
type Key = 'risk' | 'bench' | 'match' | 'last'

export function RiskPage() {
  const state = useApi<PersonAtRisk[]>('/api/risk')
  return <Loadable state={state}>{(rows) => <Risk rows={rows} />}</Loadable>
}

function Risk({ rows }: { rows: PersonAtRisk[] }) {
  const filters = useFilters<'risk'>()
  const filtered = rows.filter((r) => filters.passes('risk', r.risk))
  const { sorted, sort, toggle } = useSort<PersonAtRisk, Key>(
    filtered,
    { risk: (r) => r.riskScore, bench: (r) => r.benchDays, match: (r) => r.pipelineMatch?.score ?? null, last: (r) => r.lastProjectEnd },
    { key: 'risk', dir: 'desc' },
  )
  const n = (l: RiskLevel) => rows.filter((r) => r.risk === l).length

  return (
    <>
      <StickyBand>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
          <KpiTile plain label="People exposed" value={String(rows.length)} detail="bench, partial, leave or rolling off ≤ 90d" />
          <KpiTile plain label="High risk" value={String(n('high'))} detail="likely to stay unallocated" tone="bad" meter={(n('high') / Math.max(1, rows.length)) * 100} />
          <KpiTile plain label="Medium risk" value={String(n('medium'))} detail="needs a deployment plan" />
          <KpiTile plain label="Low risk" value={String(n('low'))} detail="strong pipeline match" />
          <KpiTile plain label="Bench > 60 days" value={String(rows.filter((r) => (r.benchDays ?? 0) > 60).length)} detail="continuous, to snapshot" tone="bad" />
          <KpiTile plain label="No strong match" value={String(rows.filter((r) => !r.pipelineMatch || r.pipelineMatch.score < 50).length)} detail="nothing in pipeline scores ≥ 50" />
        </div>
      </StickyBand>

      <PageHeader
        breadcrumbs={['Workforce', 'People at risk']}
        meta={
          <>
            <span className="font-semibold text-ink">Risk of remaining unallocated</span>
            <Dot />
            <span className="text-ink-muted">bench age + pipeline match strength + competition for the seat + skill freshness</span>
          </>
        }
      />

      <Card>
        <SectionHeading label="People at risk" icon={<NAV_ICON.risk size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={sorted.length} actions={<span className="text-[11px] text-ink-faint">Highest risk first · Deploy opens their best requirement in the workbench</span>} />
        {sorted.length === 0 ? (
          <EmptyState icon={<UI_ICON.checkCircle size={16} aria-hidden="true" />} title="No one at risk" body="Everyone is fully allocated beyond the next 90 days." />
        ) : (
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TABLE_TH}>Employee</th>
                  <th className={TABLE_TH}>Grade</th>
                  <SortTh label="Bench age" k="bench" sort={sort} onSort={toggle} className="text-right" />
                  <th className={`${TABLE_TH} text-right`}>Allocation</th>
                  <SortTh label="Pipeline match" k="match" sort={sort} onSort={toggle} />
                  <SortTh label="Last project end" k="last" sort={sort} onSort={toggle} />
                  <th className={TABLE_TH}>
                    <ColumnFilter label="Risk" options={['high', 'medium', 'low']} selected={filters.get('risk')} onToggle={(v) => filters.toggle('risk', v)} onClear={() => filters.clear('risk')} />
                  </th>
                  <th className={TABLE_TH}>Probable next deployment</th>
                  <th className={TABLE_TH} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.code} className={`${TABLE_ROW} ${r.risk === 'high' ? 'bg-bad-soft/40' : ''}`}>
                    <td className={TABLE_TD}>
                      <EmployeeCell code={r.code} grade={r.grade} title={r.title} provenance={r.provenance} />
                      <div className="mt-1">
                        <AvailabilityBadge status={r.status} />
                      </div>
                    </td>
                    <td className={`${TABLE_TD} tabular`}>G{r.grade}</td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap text-right`}>
                      {r.benchDays !== null ? (
                        <span className={r.benchDays > 60 ? 'font-bold text-bad' : r.benchDays > 30 ? 'font-semibold text-warn' : 'text-ink'}>{r.benchDays}d</span>
                      ) : r.rollOffDate ? (
                        <span className="text-ink-muted">from {fmtDate(r.rollOffDate)}</span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>{r.allocation}%</td>
                    <td className={TABLE_TD}>
                      {r.pipelineMatch ? (
                        <div className="flex items-start gap-2.5">
                          <ScoreCell value={r.pipelineMatch.score} width={52} />
                          <div className="min-w-0">
                            <Link to={`/opportunities/${r.pipelineMatch.opportunityId}`} className="font-semibold text-ink hover:text-brand hover:underline">
                              {r.pipelineMatch.opportunityName}
                            </Link>
                            <div className="text-[11px] text-ink-faint">
                              {r.pipelineMatch.role} · {fmtPct(r.pipelineMatch.probability)} win · {r.matchCount} match{r.matchCount === 1 ? '' : 'es'} ≥ 60
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-ink-faint">No live requirement</span>
                      )}
                    </td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                      {r.lastProjectEnd ? fmtDate(r.lastProjectEnd) : <span className="text-ink-faint">None in report</span>}
                      {r.lastProject && <div className="max-w-[22ch] truncate text-[11px] text-ink-faint">{r.lastProject}</div>}
                    </td>
                    <td className={TABLE_TD}>
                      <div className="flex items-center gap-1.5">
                        <RiskBadge risk={r.risk} />
                        <span className="tabular text-[11px] font-semibold text-ink-faint">{r.riskScore}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-muted">
                        {r.reasons.map((x) => (
                          <li key={x} className="flex gap-1.5">
                            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
                            {x}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${TABLE_TD} max-w-[30ch]`}>{r.probableNext}</td>
                    <td className={`${TABLE_TD} text-right`}>
                      {r.pipelineMatch && r.pipelineMatch.score >= 50 ? (
                        <Link to={`/workbench?req=${r.pipelineMatch.requirementId}&focus=${r.code}`}>
                          <Button size="sm" variant={r.risk === 'high' ? 'primary' : 'secondary'} icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
                            Deploy
                          </Button>
                        </Link>
                      ) : (
                        <Link to={`/employees/${r.code}`}>
                          <Button size="sm">Open profile</Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
