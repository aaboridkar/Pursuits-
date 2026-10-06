import { Link, useParams } from 'react-router-dom'
import { addMonths } from '../../shared/dates'
import { PROFICIENCY_LABEL, type Employee360 } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Callout } from '../components/ui/Callout'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { JourneyStrip } from '../components/ui/JourneyStrip'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { StatBar } from '../components/ui/StatBar'
import { NAV_ICON, UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { AssignmentBadge, AvailabilityBadge, KIND_META, ProvenanceTag, RiskBadge } from '../components/workforce/badges'
import { DeploymentTimeline, MonthlyAllocationChart } from '../components/workforce/charts'
import { Dot, Loadable, ScoreCell } from '../components/workforce/common'
import { fmtDate, fmtNum, fmtPct } from '../engine/format'

const ArrowRight = UI_ICON.arrowRight

export function Employee360Page() {
  const { code = '' } = useParams()
  const state = useApi<Employee360>(`/api/employees/${encodeURIComponent(code)}`)
  return <Loadable state={state}>{(e) => <Profile e={e} />}</Loadable>
}

function Profile({ e }: { e: Employee360 }) {
  const c = e.capacity
  const mutate = useMutation()
  const meta = useApi<{ asOf: string }>('/api/meta')
  const asOfDate = meta.data?.asOf ?? c.availableFrom ?? ''
  const firstSegment = e.segments.length ? e.segments.map((s) => s.start).sort()[0] : asOfDate
  const best = e.matches.find((m) => !m.assignment)
  const current = e.projects.filter((p) => p.state === 'current' && (p.kind === 'billable' || p.kind === 'internal'))
  const parked = e.projects.filter((p) => p.state === 'current' && p.kind !== 'billable' && p.kind !== 'internal')

  return (
    <>
      <PageHeader
        breadcrumbs={['Workforce', 'People', c.code]}
        meta={
          <>
            <span className="text-sm font-extrabold tracking-[-0.01em] text-ink">{c.code}</span>
            <ProvenanceTag provenance={e.employee.provenance} />
            <Dot />
            <span className="font-semibold text-ink-muted">
              {c.title} · Grade {c.grade}
            </span>
            <AvailabilityBadge status={c.status} />
            {e.risk && <RiskBadge risk={e.risk.risk} />}
          </>
        }
        actions={<JourneyStrip current="employee" links={{ candidates: best ? `/workbench?req=${best.requirement.id}&focus=${c.code}` : '/workbench', opportunity: best ? `/opportunities/${best.requirement.opportunityId}` : '/opportunities' }} />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Grade" value={`G${c.grade}`} detail={`${c.title} · ${e.employee.status}`} />
        <KpiTile label="Tenure" value={`${fmtNum(e.employee.tenureYears)} yrs`} detail={`joined ${fmtDate(e.employee.joiningDate)}`} />
        <KpiTile label="Allocation today" value={`${c.allocation}%`} detail={c.allocation === 0 ? 'nothing booked today' : c.billable === c.allocation ? 'all billable' : `${c.billable}% billable`} meter={c.allocation} tone="good" />
        <KpiTile label="Available" value={`${c.available}%`} detail={c.availableFrom === asOfDate ? 'free now' : `from ${fmtDate(c.availableFrom)}`} meter={c.available} tone="bad" />
        <KpiTile label="Bench age" value={c.benchDays === null ? '—' : `${c.benchDays} days${c.benchHistoryLimited ? '+' : ''}`} detail={c.benchSince ? `since ${fmtDate(c.benchSince)}` : c.rollOffDate ? `rolls off ${fmtDate(c.rollOffDate)}` : 'deployed'} />
        <KpiTile label="Bench risk" value={e.risk ? `${e.risk.risk[0].toUpperCase()}${e.risk.risk.slice(1)} · ${e.risk.riskScore}` : 'None'} detail={e.risk ? e.risk.reasons[0] : 'fully allocated beyond 90 days'} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <SectionHeading label="Current assignment" icon={<UI_ICON.briefcase size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} />
            {current.length === 0 && parked.length === 0 && <p className="text-xs text-ink-faint">No allocation rows cover today.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {[...current, ...parked].map((p) => (
                <div key={p.projectCode + p.start} className="rounded-md border border-border px-3 py-2" style={{ borderLeft: `3px solid ${KIND_META[p.kind].color}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-bold text-ink">{p.projectName}</div>
                      <div className="text-[11px] text-ink-faint">
                        {p.client} · {p.projectCode}
                      </div>
                    </div>
                    <Badge tone={p.kind === 'billable' ? 'blue' : p.kind === 'bench' || p.kind === 'blocked' ? 'yellow' : 'neutral'}>{KIND_META[p.kind].label}</Badge>
                  </div>
                  <div className="tabular mt-1 text-[11.5px] text-ink-muted">
                    {p.peakPct}% · {fmtDate(p.start)} – {fmtDate(p.end)} · {p.engagementType} · {p.sowStatus}
                  </div>
                </div>
              ))}
            </div>
            {c.blockedFor && (
              <div className="mt-2">
                <Callout tone="warn" title={`Soft-blocked for ${c.blockedFor}`}>
                  A block reserves this person for an expected {c.blockedFor} start without booking them. They count as available capacity until a deployment is confirmed.
                </Callout>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeading label="Deployment & bench history" icon={<UI_ICON.history size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} actions={<span className="text-[11px] text-ink-faint">From the allocation report · confirmed deployments outlined</span>} />
            {e.segments.length && asOfDate ? <DeploymentTimeline segments={e.segments} asOf={asOfDate} from={firstSegment} to={addMonths(asOfDate, 6)} /> : <EmptyState compact icon={<UI_ICON.history size={16} aria-hidden="true" />} title="No allocation history" body="This person has no rows in the allocation report." />}
          </Card>

          <Card>
            <SectionHeading label="Capacity & allocation history" icon={<NAV_ICON.capacity size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} actions={<span className="text-[11px] text-ink-faint">Monthly average % · months after today are bookings</span>} />
            <MonthlyAllocationChart months={e.months} asOfMonth={asOfDate.slice(0, 7)} />
          </Card>

          <Card>
            <SectionHeading label="Project history" icon={<UI_ICON.folder size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={e.projects.length} />
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TABLE_TH}>Project</th>
                    <th className={TABLE_TH}>Client</th>
                    <th className={TABLE_TH}>Type</th>
                    <th className={TABLE_TH}>From</th>
                    <th className={TABLE_TH}>To</th>
                    <th className={`${TABLE_TH} text-right`}>Peak %</th>
                    <th className={TABLE_TH}>Engagement</th>
                    <th className={TABLE_TH}>SOW</th>
                  </tr>
                </thead>
                <tbody>
                  {e.projects.map((p) => (
                    <tr key={p.projectCode + p.start} className={`${TABLE_ROW} ${p.state === 'future' ? 'text-ink-faint' : ''}`}>
                      <td className={`${TABLE_TD_STRONG} min-w-[200px]`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {p.projectName}
                          {p.state === 'current' && <Badge tone="blue">Current</Badge>}
                          {p.state === 'future' && <Badge tone="neutral">Booked</Badge>}
                          <ProvenanceTag provenance={p.provenance} compact />
                        </div>
                        <div className="text-[11px] font-normal text-ink-faint">{p.projectCode}</div>
                      </td>
                      <td className={TABLE_TD}>{p.client}</td>
                      <td className={TABLE_TD}>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className="h-2 w-2 rounded-xs" style={{ background: KIND_META[p.kind].color }} aria-hidden="true" />
                          {KIND_META[p.kind].label}
                        </span>
                      </td>
                      <td className={`${TABLE_TD} tabular whitespace-nowrap`}>{fmtDate(p.start)}</td>
                      <td className={`${TABLE_TD} tabular whitespace-nowrap`}>{fmtDate(p.end)}</td>
                      <td className={`${TABLE_TD} tabular text-right`}>{p.peakPct}%</td>
                      <td className={`${TABLE_TD} whitespace-nowrap`}>{p.engagementType}</td>
                      <td className={TABLE_TD}>{p.sowStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <SectionHeading
              label="Skills"
              icon={<NAV_ICON.skills size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
              count={e.skills.length}
              actions={
                c.skillsStale ? (
                  <Button size="sm" onClick={() => mutate(() => api.post(`/api/employees/${c.code}/skills/review`), { title: 'Skills marked reviewed' })} icon={<UI_ICON.check size={13} strokeWidth={2.4} aria-hidden="true" />}>
                    Mark reviewed
                  </Button>
                ) : (
                  <Badge tone="success" icon={<UI_ICON.checkCircle size={11} strokeWidth={2.4} aria-hidden="true" />}>
                    Up to date
                  </Badge>
                )
              }
            />
            <div className={`mb-2 text-[11px] ${c.skillsStale ? 'font-semibold text-bad' : 'text-ink-faint'}`}>Last updated {c.skillsLastUpdated ? fmtDate(c.skillsLastUpdated) : 'never'}</div>
            {e.skills.length === 0 ? (
              <EmptyState compact icon={<NAV_ICON.skills size={16} aria-hidden="true" />} title="No skills recorded" body="Add skills from the Skills matrix." />
            ) : (
              <ul className="flex flex-col gap-2">
                {e.skills.map((s) => (
                  <li key={s.skill}>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="font-semibold text-ink">{s.skill}</span>
                      <span className="text-[11px] text-ink-faint">
                        {s.category} · <span className="font-semibold text-ink-muted">{s.proficiency ? PROFICIENCY_LABEL[s.proficiency] : 'Not stated'}</span>
                      </span>
                    </div>
                    <StatBar value={((s.proficiency ?? 2) / 4) * 100} className="mt-1" />
                  </li>
                ))}
              </ul>
            )}
            {e.skills[0]?.basis && <p className="mt-2 text-[11px] leading-snug text-ink-faint">{e.skills[0].provenance === 'source' ? 'Source: Skills.csv.' : e.skills[0].basis}</p>}
          </Card>

          <Card id="matches">
            <SectionHeading label="Opportunity matches" icon={<NAV_ICON.workbench size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={e.matches.length} actions={<span className="text-[11px] text-ink-faint">Best live requirements</span>} />
            {e.matches.length === 0 ? (
              <EmptyState compact icon={<NAV_ICON.pipeline size={16} aria-hidden="true" />} title="No live requirements" body="Nothing in the pipeline needs staffing." />
            ) : (
              <ul className="divide-y divide-border">
                {e.matches.map((m) => (
                  <li key={m.requirement.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <ScoreCell value={m.score} width={44} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/opportunities/${m.requirement.opportunityId}`} className="block truncate text-[12.5px] font-bold text-ink hover:text-brand hover:underline">
                        {m.requirement.opportunityName}
                      </Link>
                      <div className="truncate text-[11px] text-ink-faint">
                        {m.requirement.role} · G{m.requirement.grade} · {fmtDate(m.requirement.start)} · {fmtPct(m.requirement.probability)} win
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        skill {m.skillFit} · grade {m.gradeFit} · avail {m.availability}
                      </div>
                    </div>
                    {m.assignment ? (
                      <AssignmentBadge status={m.assignment.status} />
                    ) : (
                      <Link to={`/workbench?req=${m.requirement.id}&focus=${c.code}`}>
                        <Button size="sm" icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
                          Workbench
                        </Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeading label="Deployment decisions" icon={<UI_ICON.confirm size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={e.assignments.length} />
            {e.assignments.length === 0 ? (
              <p className="text-xs text-ink-faint">No proposals or confirmations made in the app yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {e.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-bold text-ink">{a.requirement.opportunityName}</div>
                      <div className="text-[11px] text-ink-faint">
                        {a.requirement.role} · {fmtNum(a.fte)} FTE · {fmtDate(a.requirement.start)} – {fmtDate(a.requirement.end)}
                      </div>
                    </div>
                    <AssignmentBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
