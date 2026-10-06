import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PROFICIENCY_LABEL, type AvailabilityStatus, type EmployeeSkill, type Provenance, type SkillCategory } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Tabs } from '../components/ui/Tabs'
import { UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { AvailabilityBadge, ProvenanceTag } from '../components/workforce/badges'
import { Legend } from '../components/workforce/charts'
import { Dot, EmployeeCell, Loadable, SearchField, Segmented } from '../components/workforce/common'
import { fmtDate, fmtNum } from '../engine/format'

interface SkillsResponse {
  asOf: string
  staleDays: number
  people: { code: string; title: string; grade: number | null; status: AvailabilityStatus | null; provenance: Provenance; inAllocation: boolean; lastUpdated: string | null; daysSinceUpdate: number | null; stale: boolean; skills: EmployeeSkill[] }[]
  coverage: { skill: string; category: SkillCategory; holders: number; advanced: number; demandFte: number }[]
}

type View = 'matrix' | 'list' | 'coverage'

/** Sequential, one hue: proficiency 1→4 runs light→dark brand blue; the level is always printed. */
const LEVEL_BG: Record<number, string> = { 1: '#d6e9f8', 2: '#9fcbee', 3: '#4aa6e6', 4: '#0067b4' }
const LEVEL_INK: Record<number, string> = { 1: 'var(--color-ink)', 2: 'var(--color-ink)', 3: '#ffffff', 4: '#ffffff' }

export function SkillsPage() {
  const state = useApi<SkillsResponse>('/api/skills')
  return <Loadable state={state}>{(d) => <Skills data={d} />}</Loadable>
}

function Skills({ data }: { data: SkillsResponse }) {
  const [params, setParams] = useSearchParams()
  const view = (['matrix', 'list', 'coverage'].includes(params.get('view') ?? '') ? params.get('view') : 'matrix') as View
  const staleOnly = params.get('stale') === '1'
  const [category, setCategory] = useState<'all' | SkillCategory>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [skillFilter, setSkillFilter] = useState<Set<string>>(new Set())
  const mutate = useMutation()
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
    setPage(1)
  }

  const people = data.people.filter((p) => (!staleOnly || p.stale) && (!q || `${p.code} ${p.title} ${p.skills.map((s) => s.skill).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  const skills = data.coverage.filter((c) => category === 'all' || c.category === category)
  const stale = data.people.filter((p) => p.stale)
  const review = (code: string) => mutate(() => api.post(`/api/employees/${code}/skills/review`), { title: `${code} skills marked reviewed`, body: `Last updated set to ${fmtDate(data.asOf)}.` })

  const rows = people.flatMap((p) => p.skills.filter((s) => (category === 'all' || s.category === category) && (skillFilter.size === 0 || skillFilter.has(s.skill))).map((s) => ({ p, s })))
  const PAGE = 25

  return (
    <>
      <StickyBand>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
          <KpiTile plain label="Skill profiles" value={String(data.people.length)} detail={`${data.people.filter((p) => !p.inAllocation).length} not in allocation report`} />
          <KpiTile plain label="Skills recorded" value={String(data.people.reduce((s, p) => s + p.skills.length, 0))} detail={`${data.coverage.length} in catalogue`} />
          <KpiTile plain label={`Outdated (> ${data.staleDays}d)`} value={String(stale.length)} detail="never reviewed or reviewed too long ago" tone="bad" meter={(stale.length / Math.max(1, data.people.length)) * 100} />
          <KpiTile plain label="Advanced+ share" value={`${Math.round((data.people.flatMap((p) => p.skills).filter((s) => (s.proficiency ?? 2) >= 3).length / Math.max(1, data.people.flatMap((p) => p.skills).length)) * 100)}%`} detail="of recorded skills" />
          <KpiTile plain label="Skills short of demand" value={String(data.coverage.filter((c) => c.demandFte > c.advanced).length)} detail="weighted demand > Advanced+ holders" />
        </div>
      </StickyBand>

      <PageHeader
        breadcrumbs={['Workforce', 'Skills matrix']}
        meta={
          <>
            <span className="font-semibold text-ink">Proficiency 1 Basic · 2 Intermediate · 3 Advanced · 4 Expert</span>
            <Dot />
            <span className="text-ink-muted">only F09560’s skills come from Skills.csv; the rest are inferred from project history (synthetic)</span>
          </>
        }
        actions={
          <>
            <Segmented ariaLabel="Skill category" value={category} onChange={(c) => (setCategory(c), setPage(1))} options={[{ id: 'all', label: 'All skills' }, { id: 'Supply Chain', label: 'Supply chain' }, { id: 'Technical', label: 'Technical' }]} />
            <Button size="sm" variant={staleOnly ? 'primary' : 'secondary'} icon={<UI_ICON.clock size={13} strokeWidth={2.4} aria-hidden="true" />} onClick={() => set('stale', staleOnly ? null : '1')}>
              {staleOnly ? 'Showing outdated only' : 'Outdated only'}
            </Button>
            <SearchField value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search people or skills" />
          </>
        }
      />

      <Tabs
        ariaLabel="Skills view"
        value={view}
        onChange={(v) => set('view', v === 'matrix' ? null : v)}
        tabs={[
          { id: 'matrix', label: 'Matrix', count: people.length },
          { id: 'list', label: 'Skill list', count: rows.length },
          { id: 'coverage', label: 'Coverage vs demand', count: skills.length },
        ]}
        actions={view === 'matrix' ? <Legend items={[1, 2, 3, 4].map((l) => ({ label: `${l} ${PROFICIENCY_LABEL[l]}`, color: LEVEL_BG[l] }))} /> : undefined}
      />

      {view === 'matrix' && (
        <Card>
          {people.length === 0 ? (
            <EmptyState icon={<UI_ICON.checkCircle size={16} aria-hidden="true" />} title="No matching profiles" body={staleOnly ? 'Every profile has been reviewed within the window.' : 'Clear the search to see everyone.'} />
          ) : (
            <div className="scroll-x">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className={`${TABLE_TH} sticky left-0 z-10 bg-surface align-bottom`}>Employee</th>
                    <th className={`${TABLE_TH} align-bottom`}>Last updated</th>
                    {skills.map((s) => (
                      <th key={s.skill} className="h-[118px] w-[30px] min-w-[30px] px-0 pb-1.5 align-bottom">
                        <div className="mx-auto w-[14px] whitespace-nowrap text-[10.5px] font-bold text-ink-faint [writing-mode:vertical-rl] rotate-180" title={`${s.skill} · ${s.category}`}>
                          {s.skill}
                        </div>
                      </th>
                    ))}
                    <th className={`${TABLE_TH} align-bottom`} />
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const by = new Map(p.skills.map((s) => [s.skill, s]))
                    return (
                      <tr key={p.code} className={TABLE_ROW}>
                        <td className={`${TABLE_TD} sticky left-0 z-10 bg-surface`}>
                          {p.inAllocation ? <EmployeeCell code={p.code} grade={p.grade} title={p.title} provenance={p.provenance} /> : <div className="font-semibold text-ink">{p.code}<div className="text-[11px] font-normal text-warn">Skills.csv only · no allocation rows</div></div>}
                        </td>
                        <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                          <span className={p.stale ? 'font-semibold text-bad' : 'text-ink'}>{p.lastUpdated ? fmtDate(p.lastUpdated) : 'Never'}</span>
                          <div className="text-[11px] text-ink-faint">{p.daysSinceUpdate !== null ? `${p.daysSinceUpdate} days ago` : 'no date in source'}</div>
                        </td>
                        {skills.map((s) => {
                          const have = by.get(s.skill)
                          const lvl = have?.proficiency ?? (have ? 2 : 0)
                          return (
                            <td key={s.skill} className="px-[2px] py-1 text-center align-middle">
                              {have ? (
                                <span
                                  className="tabular mx-auto flex h-[22px] w-[24px] items-center justify-center rounded-[3px] text-[11px] font-bold"
                                  style={{ background: LEVEL_BG[lvl], color: LEVEL_INK[lvl], outline: have.proficiency === null ? '1.5px dashed var(--color-ink-faint)' : undefined }}
                                  title={`${s.skill}: ${have.proficiency ? PROFICIENCY_LABEL[have.proficiency] : 'level not stated'}${have.basis ? ` — ${have.basis}` : ''}`}
                                >
                                  {have.proficiency ?? '?'}
                                </span>
                              ) : (
                                <span className="mx-auto block h-[22px] w-[24px] rounded-[3px] bg-surface-sunken" aria-label="none" />
                              )}
                            </td>
                          )
                        })}
                        <td className={`${TABLE_TD} whitespace-nowrap`}>
                          {p.stale && p.inAllocation && (
                            <Button size="sm" onClick={() => review(p.code)} icon={<UI_ICON.check size={13} strokeWidth={2.4} aria-hidden="true" />}>
                              Mark reviewed
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {view === 'list' && (
        <Card>
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TABLE_TH}>Employee</th>
                  <th className={TABLE_TH}>
                    <ColumnFilter
                      label="Skill"
                      options={data.coverage.map((c) => c.skill)}
                      selected={skillFilter}
                      onToggle={(v) => (setSkillFilter((f) => { const n = new Set(f); if (n.has(v)) n.delete(v); else n.add(v); return n }), setPage(1))}
                      onClear={() => setSkillFilter(new Set())}
                    />
                  </th>
                  <th className={TABLE_TH}>Skill category</th>
                  <th className={TABLE_TH}>Proficiency</th>
                  <th className={TABLE_TH}>Last updated</th>
                  <th className={TABLE_TH}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * PAGE, page * PAGE).map(({ p, s }) => (
                  <tr key={`${p.code}-${s.skill}`} className={TABLE_ROW}>
                    <td className={TABLE_TD}>{p.inAllocation ? <EmployeeCell code={p.code} grade={p.grade} title={p.title} provenance={p.provenance} /> : <span className="font-semibold text-ink">{p.code}</span>}</td>
                    <td className={TABLE_TD_STRONG}>{s.skill}</td>
                    <td className={TABLE_TD}>{s.category}</td>
                    <td className={TABLE_TD}>
                      <ProficiencyEditor code={p.code} skill={s} />
                    </td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                      <span className={p.stale ? 'font-semibold text-bad' : ''}>{s.lastUpdated ? fmtDate(s.lastUpdated) : 'Never'}</span>
                    </td>
                    <td className={`${TABLE_TD} max-w-[44ch]`}>
                      <div className="flex items-start gap-1.5">
                        <ProvenanceTag provenance={s.provenance} compact />
                        <span className="text-[11px] leading-snug">{s.basis}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={Math.ceil(rows.length / PAGE)} totalRows={rows.length} pageSize={PAGE} onChange={setPage} />
        </Card>
      )}

      {view === 'coverage' && (
        <Card>
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TABLE_TH}>Skill</th>
                  <th className={TABLE_TH}>Category</th>
                  <th className={`${TABLE_TH} text-right`}>People with skill</th>
                  <th className={`${TABLE_TH} text-right`}>Advanced or expert</th>
                  <th className={`${TABLE_TH} text-right`}>Weighted unfilled demand</th>
                  <th className={TABLE_TH}>Position</th>
                </tr>
              </thead>
              <tbody>
                {[...skills].sort((a, b) => b.demandFte - b.advanced - (a.demandFte - a.advanced)).map((c) => (
                  <tr key={c.skill} className={TABLE_ROW}>
                    <td className={TABLE_TD_STRONG}>{c.skill}</td>
                    <td className={TABLE_TD}>{c.category}</td>
                    <td className={`${TABLE_TD} tabular text-right`}>{c.holders}</td>
                    <td className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>{c.advanced}</td>
                    <td className={`${TABLE_TD} tabular text-right`}>{c.demandFte ? `${fmtNum(c.demandFte)} FTE` : '—'}</td>
                    <td className={TABLE_TD}>
                      {c.demandFte === 0 ? (
                        <span className="text-ink-faint">No live demand</span>
                      ) : c.demandFte > c.advanced ? (
                        <Badge tone="danger">Short of depth</Badge>
                      ) : c.demandFte > c.advanced / 2 ? (
                        <Badge tone="yellow">Tight</Badge>
                      ) : (
                        <Badge tone="success">Covered</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Demand counts each live requirement’s unfilled FTE × win probability against both its supply chain and its technical skill. Depth = people at Advanced or Expert, whether or not they are free —{' '}
            <Link to="/workbench" className="font-semibold text-brand hover:underline">
              check availability in the workbench
            </Link>
            .
          </p>
        </Card>
      )}
      {view === 'matrix' && people.some((p) => p.status) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          Status today: {(['bench', 'partially-available'] as AvailabilityStatus[]).map((s) => <AvailabilityBadge key={s} status={s} />)} people are the ones to reskill first. Dashed outline = level not stated in source.
        </div>
      )}
    </>
  )
}

function ProficiencyEditor({ code, skill }: { code: string; skill: EmployeeSkill }) {
  const mutate = useMutation()
  return (
    <select
      aria-label={`${skill.skill} proficiency for ${code}`}
      value={skill.proficiency ?? ''}
      onChange={(e) => mutate(() => api.put(`/api/employees/${code}/skills/${encodeURIComponent(skill.skill)}`, { proficiency: Number(e.target.value) }), { title: `${code} · ${skill.skill} updated`, body: 'Profile marked reviewed; matching recalculated.' })}
      className="min-h-[26px] rounded-md border border-border-strong bg-surface px-1.5 text-[12px] text-ink focus:border-brand"
    >
      {skill.proficiency === null && <option value="">Not stated</option>}
      {[1, 2, 3, 4].map((l) => (
        <option key={l} value={l}>
          {l} · {PROFICIENCY_LABEL[l]}
        </option>
      ))}
    </select>
  )
}
