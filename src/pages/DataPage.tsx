import type { Meta } from '../../shared/types'
import { useApi } from '../api/client'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { ProvenanceTag, SeverityBadge } from '../components/workforce/badges'
import { Dot, Loadable } from '../components/workforce/common'
import { fmtDate } from '../engine/format'

const METHOD: [string, string][] = [
  ['Snapshot date', 'The allocation report’s last “Current allocation” row runs 6 Oct → 6 Oct 2026, so every “today” in the app is 6 Oct 2026.'],
  ['Allocated', 'Billable rows plus internal delivery (Capability, Core Delivery). Bench pools (Capability / Client / Fractal / Practice Bench) and “Blocked for <client>” are free capacity; Parental Leave is unavailable.'],
  ['Availability status', 'Fully allocated ≥ 100%, partially available 1–99%, bench 0%, on leave when leave covers ≥ 50% of the day.'],
  ['Bench age', 'Continuous days at 0% allocation, not on leave, back from the snapshot. It cannot look past the first row the report holds for a person (marked “+”).'],
  ['Available from', 'First day on or after the snapshot with any free capacity. Days after a person’s last row are treated as free.'],
  ['Expected demand', 'Each live requirement’s unfilled FTE × win probability (won = 100%, lost = 0), spread across the months it covers.'],
  ['Capacity gap', 'Average free FTE minus expected demand over the horizon. “No qualified candidate” demand is where nobody free scores ≥ 65 with skill fit ≥ 60 at a fitting grade.'],
  ['Match score', '40% skill fit (proficiency on the two required skills, partial credit for a related skill) + 20% grade fit + 25% availability over the first 90 days + 15% bench priority, +5 for prior work at the account.'],
  ['Bench risk', 'Bench age, partial allocation or upcoming roll-off, plus the strength of the best pipeline match (weighted by win probability), competition for that seat, and skill-profile freshness. High ≥ 60, medium ≥ 35.'],
  ['Deployment decisions', 'Proposals hold nothing. Confirming books the person as a billable allocation for the requirement’s dates, so capacity, bench, risk and gaps all update. Stored in data/runtime/state.json; Reset demo clears them.'],
]

export function DataPage() {
  const state = useApi<Meta>('/api/meta')
  return (
    <Loadable state={state}>
      {(m) => (
        <>
          <PageHeader
            breadcrumbs={['Workforce', 'Data']}
            meta={
              <>
                <span className="font-semibold text-ink">Snapshot {fmtDate(m.asOf)}</span>
                <Dot />
                <span className="text-ink-muted">
                  scope: {m.scope === 'all' ? 'source + synthetic' : 'source records only'} · {m.counts.employees} employees ({m.counts.sourceEmployees} from source) · {m.counts.opportunities} opportunities · {m.counts.requirements} requirements
                </span>
              </>
            }
          />

          <Card>
            <SectionHeading label="Data sources" icon={<UI_ICON.database size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={m.sources.length} actions={<span className="text-[11px] text-ink-faint">Source CSVs are read-only; synthetic files are regenerated with npm run generate</span>} />
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TABLE_TH}>File</th>
                    <th className={TABLE_TH}>Provenance</th>
                    <th className={`${TABLE_TH} text-right`}>Rows</th>
                    <th className={TABLE_TH}>What it provides</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sources.map((s) => (
                    <tr key={s.file} className={TABLE_ROW}>
                      <td className={`${TABLE_TD_STRONG} font-mono text-[12px]`}>{s.file}</td>
                      <td className={TABLE_TD}>{s.provenance === 'source' ? <Badge tone="blue">Source</Badge> : <ProvenanceTag provenance={s.provenance} />}</td>
                      <td className={`${TABLE_TD} tabular text-right`}>{s.rows}</td>
                      <td className={TABLE_TD}>{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <Card>
              <SectionHeading label="Data quality findings" icon={<UI_ICON.alert size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={m.quality.length} />
              <ul className="divide-y divide-border">
                {m.quality.map((q) => (
                  <li key={q.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={q.severity === 'high' ? 'high' : 'watch'} />
                      <span className="text-[12.5px] font-bold text-ink">{q.title}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{q.detail}</p>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{q.file}</div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <SectionHeading label="How figures are calculated" icon={<UI_ICON.calc size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} />
              <dl className="divide-y divide-border">
                {METHOD.map(([k, v]) => (
                  <div key={k} className="grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[150px_1fr]">
                    <dt className="text-[12px] font-bold text-ink">{k}</dt>
                    <dd className="text-[11.5px] leading-relaxed text-ink-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </Loadable>
  )
}
