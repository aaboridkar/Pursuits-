import { Link, useNavigate } from 'react-router-dom'
import { fiscalQuarter } from '../../shared/dates'
import type { OpportunityView } from '../../shared/types'
import { useApi } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Card } from '../components/ui/Card'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { NAV_ICON, UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_ROW_HOVER, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { CoverageRiskBadge, Est, OutcomeBadge, ProvenanceTag } from '../components/workforce/badges'
import { Dot, Loadable, SortTh, useFilters, useSort } from '../components/workforce/common'
import { fmtDate, fmtMoney, fmtNum, fmtPct } from '../engine/format'

const FY_MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
const MONTH_LABEL = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

type Key = 'account' | 'name' | 'stage' | 'start' | 'value' | 'win' | 'thisQ' | 'demand' | 'unmet'

export function OpportunitiesPage() {
  const state = useApi<OpportunityView[]>('/api/opportunities')
  return <Loadable state={state}>{(opps) => <Pipeline opps={opps} />}</Loadable>
}

function Pipeline({ opps }: { opps: OpportunityView[] }) {
  const navigate = useNavigate()
  const filters = useFilters<'account' | 'stage' | 'outcome'>()
  const filtered = opps.filter((o) => filters.passes('account', o.account) && filters.passes('stage', o.stage) && filters.passes('outcome', o.outcome))
  const { sorted, sort, toggle } = useSort<OpportunityView, Key>(
    filtered,
    {
      account: (o) => o.account,
      name: (o) => o.name,
      stage: (o) => o.stage,
      start: (o) => o.estStartDate,
      value: (o) => o.value,
      win: (o) => o.probability,
      thisQ: (o) => o.confThisQuarter,
      demand: (o) => o.totalFte,
      unmet: (o) => o.unmetFte,
    },
    { key: 'start', dir: 'asc' },
  )

  const live = opps.filter((o) => o.outcome !== 'lost')
  const open = opps.filter((o) => o.outcome === 'open')
  const won = opps.filter((o) => o.outcome === 'won')
  const uniq = (xs: string[]) => [...new Set(xs)].sort()

  // Weighted value by fiscal month: tracker months where given, else spread over the (possibly assumed) duration.
  const monthTotals = FY_MONTHS.map((m) => live.reduce((s, o) => s + (o.monthly.find((x) => x.month === m)?.value ?? 0), 0))
  const quarters = ['Q2', 'Q3', 'Q4'].map((q, i) => ({ q, total: monthTotals.slice(i * 3, i * 3 + 3).reduce((a, b) => a + b, 0) }))

  return (
    <>
      <StickyBand>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
          <KpiTile plain label="Open opportunities" value={String(open.length)} detail={`${won.length} won · ${opps.length - live.length} lost`} />
          <KpiTile plain label="Open pipeline value" value={fmtMoney(open.reduce((s, o) => s + (o.value ?? 0), 0))} detail={`${fmtMoney(open.reduce((s, o) => s + (o.value ?? 0) * o.probability, 0))} probability-weighted`} />
          <KpiTile plain label="Won, to be staffed" value={fmtMoney(won.reduce((s, o) => s + (o.value ?? 0), 0))} detail={`${won.length} engagements`} />
          <KpiTile plain label="People demand" value={`${fmtNum(live.reduce((s, o) => s + o.totalFte, 0))} FTE`} detail={`${fmtNum(live.reduce((s, o) => s + o.weightedFte, 0))} FTE weighted`} />
          <KpiTile
            plain
            label="Unfilled demand"
            value={`${fmtNum(live.reduce((s, o) => s + o.unmetFte, 0))} FTE`}
            detail={`${live.filter((o) => o.coverageRisk === 'gap').length} with a skill gap`}
            tone="bad"
            meter={(live.reduce((s, o) => s + o.unmetFte, 0) / Math.max(1, live.reduce((s, o) => s + o.totalFte, 0))) * 100}
          />
          <KpiTile plain label="Weighted value FY27 H2" value={fmtMoney(quarters[1].total + quarters[2].total)} detail="Oct–Mar, recomputed from months" />
        </div>
      </StickyBand>

      <PageHeader
        breadcrumbs={['Workforce', 'Opportunity pipeline']}
        meta={
          <>
            <span className="font-semibold text-ink">{opps.length} opportunities</span>
            <Dot />
            <span className="text-ink-muted">
              <sup className="text-[9.5px] font-semibold text-ink-faint">est.</sup> assumed where the tracker is blank ·{' '}
              <sup className="text-[9.5px] font-semibold text-ink-faint">drv</sup> derived from other tracker fields
            </span>
          </>
        }
      />

      <Card>
        <SectionHeading label="Pipeline" icon={<NAV_ICON.pipeline size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={sorted.length} actions={<span className="text-[11px] text-ink-faint">Click a row for its resource requirements</span>} />
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TABLE_TH}>
                  <ColumnFilter label="Account" options={uniq(opps.map((o) => o.account))} selected={filters.get('account')} onToggle={(v) => filters.toggle('account', v)} onClear={() => filters.clear('account')} />
                </th>
                <SortTh label="Opportunity" k="name" sort={sort} onSort={toggle} />
                <th className={TABLE_TH}>
                  <ColumnFilter label="Stage" options={uniq(opps.map((o) => o.stage))} selected={filters.get('stage')} onToggle={(v) => filters.toggle('stage', v)} onClear={() => filters.clear('stage')} />
                </th>
                <th className={TABLE_TH}>Proposal</th>
                <SortTh label="Est. start" k="start" sort={sort} onSort={toggle} />
                <th className={`${TABLE_TH} text-right`}>Months</th>
                <SortTh label="Value" k="value" sort={sort} onSort={toggle} className="text-right" />
                <SortTh label="Win" k="win" sort={sort} onSort={toggle} className="text-right" title="Confidence of winning" />
                <SortTh label="Start this Q" k="thisQ" sort={sort} onSort={toggle} className="text-right" title="Confidence of starting this quarter" />
                <th className={`${TABLE_TH} text-right`} title="Confidence of starting next quarter">
                  Next Q
                </th>
                <th className={TABLE_TH}>
                  <ColumnFilter label="Status" options={['open', 'won', 'lost']} selected={filters.get('outcome')} onToggle={(v) => filters.toggle('outcome', v)} onClear={() => filters.clear('outcome')} />
                </th>
                <SortTh label="Demand" k="demand" sort={sort} onSort={toggle} className="text-right" />
                <SortTh label="Unfilled" k="unmet" sort={sort} onSort={toggle} className="text-right" />
                <th className={TABLE_TH}>
                  Staffing
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const fp = o.fieldProvenance
                const note = o.notes.join(' ')
                return (
                  <tr key={o.id} className={`${TABLE_ROW} ${TABLE_ROW_HOVER} cursor-pointer ${o.outcome === 'lost' ? 'opacity-60' : ''}`} onClick={() => navigate(`/opportunities/${o.id}`)}>
                    <td className={`${TABLE_TD} whitespace-nowrap`}>{o.account}</td>
                    <td className={`${TABLE_TD_STRONG} min-w-[210px]`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link to={`/opportunities/${o.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand hover:underline">
                          {o.name}
                        </Link>
                        <ProvenanceTag provenance={o.provenance} compact />
                      </div>
                      <div className="mt-0.5 text-[11px] font-normal text-ink-faint">{o.id}</div>
                    </td>
                    <td className={`${TABLE_TD} whitespace-nowrap`}>
                      {o.stage}
                      <div className="text-[11px] text-ink-faint">{o.type}</div>
                    </td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap`}>{fmtDate(o.proposalDate)}</td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                      {fmtDate(o.estStartDate)}
                      <Est provenance={fp.estStartDate} note={note} />
                      {o.estStartDate && <div className="text-[10.5px] text-ink-faint">{fiscalQuarter(o.estStartDate)}</div>}
                    </td>
                    <td className={`${TABLE_TD} tabular text-right`}>
                      {o.months ?? '—'}
                      <Est provenance={fp.months} note={note} />
                    </td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap text-right font-semibold text-ink`}>{o.value === null ? <span className="font-normal text-ink-faint">Not stated</span> : fmtMoney(o.value)}</td>
                    <td className={`${TABLE_TD} tabular text-right`}>
                      {fmtPct(o.confWinning)}
                      <Est provenance={fp.confWinning} note={note} />
                    </td>
                    <td className={`${TABLE_TD} tabular text-right`}>{fmtPct(o.confThisQuarter)}</td>
                    <td className={`${TABLE_TD} tabular text-right`}>{fmtPct(o.confNextQuarter)}</td>
                    <td className={`${TABLE_TD} min-w-[170px]`}>
                      <OutcomeBadge outcome={o.outcome} />
                      {o.status && <div className="mt-0.5 max-w-[30ch] text-[11px] leading-snug text-ink-faint">{o.status}</div>}
                    </td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap text-right`}>{o.requirements.length ? `${fmtNum(o.totalFte)} FTE` : '—'}</td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap text-right ${o.unmetFte > 0 ? 'font-semibold text-ink' : ''}`}>{o.outcome === 'lost' ? '—' : `${fmtNum(o.unmetFte)} FTE`}</td>
                    <td className={TABLE_TD}>
                      <CoverageRiskBadge risk={o.coverageRisk} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-3">
        <SectionHeading
          label="Weighted value by month · FY27"
          icon={<UI_ICON.calendar size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
          actions={<span className="text-[11px] text-ink-faint">Value × win probability. Quarters recomputed from months — the tracker’s own Q/H/FY roll-ups are inconsistent.</span>}
        />
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TABLE_TH}>Opportunity</th>
                {MONTH_LABEL.map((m) => (
                  <th key={m} className={`${TABLE_TH} text-right`}>
                    {m}
                  </th>
                ))}
                {quarters.map((q) => (
                  <th key={q.q} className={`${TABLE_TH} text-right`}>
                    {q.q}
                  </th>
                ))}
                <th className={`${TABLE_TH} text-right`}>FY</th>
              </tr>
            </thead>
            <tbody>
              {live
                .filter((o) => o.monthly.length)
                .map((o) => {
                  const vals = FY_MONTHS.map((m) => o.monthly.find((x) => x.month === m)?.value ?? 0)
                  const q = [0, 1, 2].map((i) => vals.slice(i * 3, i * 3 + 3).reduce((a, b) => a + b, 0))
                  return (
                    <tr key={o.id} className={TABLE_ROW}>
                      <td className={`${TABLE_TD_STRONG} whitespace-nowrap`}>
                        <Link to={`/opportunities/${o.id}`} className="hover:text-brand hover:underline">
                          {o.name}
                        </Link>
                        <Est provenance={o.fieldProvenance.monthly} note="Tracker has no monthly split — weighted value spread evenly over the duration" />
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className={`${TABLE_TD} tabular text-right ${v ? 'text-ink' : 'text-ink-faint'}`}>
                          {v ? fmtMoney(v) : '–'}
                        </td>
                      ))}
                      {q.map((v, i) => (
                        <td key={i} className={`${TABLE_TD} tabular text-right font-semibold ${v ? 'text-ink' : 'text-ink-faint'}`}>
                          {v ? fmtMoney(v) : '–'}
                        </td>
                      ))}
                      <td className={`${TABLE_TD} tabular text-right font-bold text-ink`}>{fmtMoney(vals.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  )
                })}
              <tr className="border-t-2 border-border-strong">
                <td className={TABLE_TD_STRONG}>Total</td>
                {monthTotals.map((v, i) => (
                  <td key={i} className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>
                    {v ? fmtMoney(v) : '–'}
                  </td>
                ))}
                {quarters.map((q) => (
                  <td key={q.q} className={`${TABLE_TD} tabular text-right font-bold text-ink`}>
                    {fmtMoney(q.total)}
                  </td>
                ))}
                <td className={`${TABLE_TD} tabular text-right font-bold text-ink`}>{fmtMoney(monthTotals.reduce((a, b) => a + b, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
