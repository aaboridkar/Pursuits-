import { Link, useSearchParams } from 'react-router-dom'
import type { Alert, Horizon, Overview } from '../../shared/types'
import { useApi } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { NAV_ICON, UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { Legend, STATUS_SERIES, StackedBar, SupplyDemandChart } from '../components/workforce/charts'
import { Dot, Loadable, Segmented } from '../components/workforce/common'
import { SeverityBadge } from '../components/workforce/badges'
import { fmtDate, fmtMoney, fmtMonth, fmtNum, fmtSigned } from '../engine/format'

const ArrowRight = UI_ICON.arrowRight
const ListIcon = UI_ICON.list
const CheckIcon = UI_ICON.checkCircle

const ALERT_ICON: Record<Alert['kind'], typeof ArrowRight> = {
  'bench-60': NAV_ICON.risk,
  'unmet-requirement': NAV_ICON.workbench,
  'roll-off': UI_ICON.clock,
  'stale-skills': NAV_ICON.skills,
  'data-quality': NAV_ICON.data,
}

export function OverviewPage() {
  const [params, setParams] = useSearchParams()
  const horizon: Horizon = params.get('horizon') === '6m' ? '6m' : '3m'
  const state = useApi<Overview>(`/api/overview?horizon=${horizon}`)

  return (
    <Loadable state={state}>
      {(o) => {
        const k = o.kpis
        const months = o.supplyDemand.slice(0, horizon === '6m' ? 6 : 3).map((m) => m.month)
        const window = `${fmtMonth(months[0])}–${fmtMonth(months.at(-1)!)}`
        const tiles = [
          { to: '/capacity', label: 'Total SC HC', value: String(k.headcount), detail: 'Supply Chain practice, active' },
          { to: '/capacity?status=fully-allocated', label: 'Fully allocated', value: String(k.fully), detail: `${Math.round((k.fully / k.headcount) * 100)}% of headcount`, meter: (k.fully / k.headcount) * 100, tone: 'good' as const },
          { to: '/capacity?status=partially-available', label: 'Partially available', value: String(k.partial), detail: 'some capacity unbooked' },
          { to: '/capacity?status=bench', label: 'Available / bench', value: String(k.bench), detail: k.onLeave ? `+ ${k.onLeave} on leave` : '0% allocated today', meter: (k.bench / k.headcount) * 100, tone: 'bad' as const },
          { to: '/risk', label: 'Bench > 30 days', value: String(k.bench30), detail: 'continuous, to snapshot' },
          { to: '/risk', label: 'Bench > 60 days', value: String(k.bench60), detail: k.bench60 ? 'action required' : 'none', tone: 'bad' as const },
          { to: '/opportunities', label: 'Open opportunities', value: String(k.openOpportunities), detail: `${fmtMoney(k.pipelineValue)} · ${fmtMoney(k.weightedPipelineValue)} weighted` },
          { to: '/opportunities', label: 'Expected demand', value: `${fmtNum(k.expectedDemandFte)} FTE`, detail: `unfilled, weighted · ${window}` },
          { to: '/capacity?horizon=3m', label: 'Available capacity', value: `${fmtNum(k.availableFte)} FTE`, detail: `avg free · ${window}` },
          {
            to: '/workbench',
            label: 'Potential capacity gap',
            value: k.gapFte < 0 ? `${fmtNum(-k.gapFte)} FTE short` : `${fmtNum(k.gapFte)} FTE spare`,
            detail: k.unqualifiedFte > 0 ? `${fmtNum(k.unqualifiedFte)} FTE with no qualified candidate` : 'all demand has a qualified candidate',
          },
        ]

        return (
          <>
            <StickyBand>
              <div className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x 2xl:grid-cols-10">
                {tiles.map((t) => (
                  <Link key={t.label} to={t.to} className="min-w-0 transition-colors hover:bg-surface-sunken" title={`Open ${t.label.toLowerCase()}`}>
                    <KpiTile plain label={t.label} value={t.value} detail={t.detail} meter={t.meter} tone={t.tone} />
                  </Link>
                ))}
              </div>
            </StickyBand>

            <PageHeader
              breadcrumbs={['Workforce', 'Leadership overview']}
              meta={
                <>
                  <span className="font-semibold text-ink">Snapshot {fmtDate(o.asOf)}</span>
                  <Dot />
                  <span className="text-ink-muted">demand weighted by win probability · gap = available − expected demand</span>
                </>
              }
              actions={
                <Segmented
                  ariaLabel="Planning horizon"
                  value={horizon}
                  onChange={(h) => setParams(h === '3m' ? {} : { horizon: h })}
                  options={[
                    { id: '3m', label: 'Next 3 months' },
                    { id: '6m', label: 'Next 6 months' },
                  ]}
                />
              }
            />

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <Card>
                <SectionHeading
                  label="Supply vs demand"
                  icon={<UI_ICON.trending size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
                  actions={<span className="text-[11px] text-ink-faint">FTE per month · {window} highlighted</span>}
                />
                <SupplyDemandChart data={o.supplyDemand} highlight={months} />
              </Card>

              <Card className="flex flex-col">
                <SectionHeading
                  label="Action required"
                  icon={<ListIcon size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
                  count={o.alerts.length}
                  actions={<span className="text-[11px] text-ink-faint">Most urgent first</span>}
                />
                {o.alerts.length === 0 ? (
                  <EmptyState compact icon={<CheckIcon size={16} aria-hidden="true" />} title="Nothing needs action" body="Bench over 60 days, unmet requirements, roll-offs and stale skills appear here." />
                ) : (
                  <ul className="-mr-1 max-h-[372px] divide-y divide-border overflow-y-auto pr-1">
                    {o.alerts.map((a) => {
                      const Icon = ALERT_ICON[a.kind]
                      const accent = a.severity === 'critical' ? 'var(--color-bad)' : a.severity === 'high' ? 'var(--color-accent)' : 'var(--color-border-strong)'
                      return (
                        <li key={a.id} className="flex items-center gap-x-3 py-2 first:pt-0 last:pb-0" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
                          <span
                            className={`ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.severity === 'critical' ? 'bg-bad-soft text-bad' : a.severity === 'high' ? 'bg-warn-soft text-warn' : 'bg-surface-sunken text-ink-faint'}`}
                            aria-hidden="true"
                          >
                            <Icon size={14} strokeWidth={2.3} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <SeverityBadge severity={a.severity} />
                              <span className="text-[12.5px] font-bold leading-snug text-ink">{a.title}</span>
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-muted">{a.detail}</div>
                          </div>
                          <Link to={a.link} className="shrink-0">
                            <Button size="sm" variant={a.severity === 'critical' ? 'primary' : 'secondary'} icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
                              {a.linkLabel}
                            </Button>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </div>

            <Card className="mt-3">
              <SectionHeading
                label="Capacity by grade"
                icon={<NAV_ICON.capacity size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
                actions={<Legend items={STATUS_SERIES.map((s) => ({ label: s.label, color: s.color }))} />}
              />
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={TABLE_TH}>Grade</th>
                      <th className={`${TABLE_TH} text-right`}>HC</th>
                      <th className={`${TABLE_TH} w-[38%]`}>Status today</th>
                      <th className={`${TABLE_TH} text-right`}>Available FTE</th>
                      <th className={`${TABLE_TH} text-right`}>Expected demand</th>
                      <th className={`${TABLE_TH} text-right`}>Gap</th>
                      <th className={TABLE_TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {o.byGrade.map((g) => (
                      <tr key={g.grade} className={TABLE_ROW}>
                        <td className={TABLE_TD_STRONG}>
                          {g.title}
                          <span className="ml-1 font-normal text-ink-faint">G{g.grade}</span>
                        </td>
                        <td className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>{g.headcount}</td>
                        <td className={`${TABLE_TD} align-middle`}>
                          {g.headcount > 0 ? (
                            <StackedBar total={g.headcount} parts={STATUS_SERIES.map((s) => ({ label: s.label, value: g[s.key], color: s.color }))} />
                          ) : (
                            <span className="text-ink-faint">No one at this grade</span>
                          )}
                        </td>
                        <td className={`${TABLE_TD} tabular text-right`}>{fmtNum(g.availableFte)}</td>
                        <td className={`${TABLE_TD} tabular text-right`}>{fmtNum(g.demandFte)}</td>
                        <td className={`${TABLE_TD} tabular text-right`}>
                          {g.gapFte < 0 ? (
                            <Badge tone="danger">{fmtSigned(g.gapFte)} short</Badge>
                          ) : g.demandFte > 0 && g.gapFte < 0.5 ? (
                            <Badge tone="yellow">Tight · {fmtSigned(g.gapFte)}</Badge>
                          ) : (
                            <span className="font-semibold text-ink-muted">{fmtSigned(g.gapFte)} spare</span>
                          )}
                        </td>
                        <td className={`${TABLE_TD} text-right`}>
                          <Link to={`/capacity?grade=${g.grade}`} className="text-[11.5px] font-semibold text-brand hover:underline">
                            View people
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Available FTE is free capacity averaged over {window}, including people rolling off. Expected demand is unfilled requirement FTE × win probability over the same window.
              </p>
            </Card>
          </>
        )
      }}
    </Loadable>
  )
}
