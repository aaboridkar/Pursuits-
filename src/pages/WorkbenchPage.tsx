import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PROFICIENCY_LABEL, type Candidate, type RequirementView } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Callout } from '../components/ui/Callout'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { JourneyStrip } from '../components/ui/JourneyStrip'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { UI_ICON, WORKFLOW_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TH } from '../components/ui/table'
import { AssignmentBadge, AvailabilityBadge, CoverageBadge, ProvenanceTag } from '../components/workforce/badges'
import { Dot, EmployeeCell, Loadable, ScoreCell, SearchField, Segmented } from '../components/workforce/common'
import { fmtDate, fmtNum, fmtPct } from '../engine/format'

const ProposeIcon = UI_ICON.propose
const ConfirmIcon = UI_ICON.confirm
const CloseIcon = UI_ICON.close

export function WorkbenchPage() {
  const [params, setParams] = useSearchParams()
  const reqs = useApi<RequirementView[]>('/api/requirements')
  const selected = params.get('req')

  // Default to the most urgent open requirement.
  useEffect(() => {
    if (selected || !reqs.data) return
    const first = [...reqs.data].filter((r) => r.unmetFte > 0 && r.coverage !== 'closed').sort((a, b) => b.probability - a.probability || a.daysToStart - b.daysToStart)[0]
    if (first) setParams({ req: first.id }, { replace: true })
  }, [selected, reqs.data, setParams])

  return (
    <Loadable state={reqs}>
      {(list) => (
        <>
          <PageHeader
            breadcrumbs={['Workforce', 'Deployment workbench']}
            meta={
              <>
                <span className="font-semibold text-ink">Pick a requirement, compare candidates, propose or confirm</span>
                <Dot />
                <span className="text-ink-muted">confirming books the person and updates capacity, risk and gaps everywhere</span>
              </>
            }
            actions={<JourneyStrip current="candidates" links={{ opportunity: selected ? `/opportunities/${list.find((r) => r.id === selected)?.opportunityId ?? ''}` : '/opportunities', requirement: selected ? `/opportunities/${list.find((r) => r.id === selected)?.opportunityId ?? ''}#requirements` : '/opportunities' }} />}
          />
          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <RequirementPicker list={list} selected={selected} onSelect={(id) => setParams({ req: id })} />
            {selected ? (
              <Candidates reqId={selected} focus={params.get('focus')} />
            ) : (
              <Card>
                <EmptyState icon={<WORKFLOW_ICON.requirement size={16} aria-hidden="true" />} title="Select a requirement" body="Choose a role on the left to see who could fill it." />
              </Card>
            )}
          </div>
        </>
      )}
    </Loadable>
  )
}

function RequirementPicker({ list, selected, onSelect }: { list: RequirementView[]; selected: string | null; onSelect: (id: string) => void }) {
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [q, setQ] = useState('')
  const live = list.filter((r) => r.coverage !== 'closed' && (show === 'all' || r.unmetFte > 0 || r.id === selected) && (!q || `${r.role} ${r.opportunityName} ${r.account} ${r.scSkill} ${r.techSkill}`.toLowerCase().includes(q.toLowerCase())))
  const groups = new Map<string, RequirementView[]>()
  for (const r of [...live].sort((a, b) => a.start.localeCompare(b.start))) groups.set(r.opportunityId, [...(groups.get(r.opportunityId) ?? []), r])

  return (
    <Card className="flex max-h-[calc(100vh-150px)] flex-col lg:sticky lg:top-0">
      <SectionHeading label="Requirements" icon={<WORKFLOW_ICON.requirement size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} count={live.length} />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="Which requirements" value={show} onChange={setShow} options={[{ id: 'open', label: 'Unfilled' }, { id: 'all', label: 'All live' }]} />
      </div>
      <div className="mb-2 [&_input]:w-full [&_label]:flex">
        <SearchField value={q} onChange={setQ} placeholder="Role, account or skill" />
      </div>
      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {[...groups.entries()].map(([oppId, rs]) => (
          <div key={oppId} className="mb-2.5">
            <div className="mb-1 truncate text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint" title={rs[0].opportunityName}>
              {rs[0].account} · {rs[0].opportunityName}
            </div>
            <ul className="flex flex-col gap-1">
              {rs.map((r) => {
                const active = r.id === selected
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${active ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:bg-surface-sunken'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[12.5px] font-bold ${active ? 'text-brand-active' : 'text-ink'}`}>{r.role}</span>
                        <span className="tabular shrink-0 text-[11px] font-semibold text-ink-muted">
                          {fmtNum(r.unmetFte)}/{fmtNum(r.fte)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
                        <span className="truncate">
                          G{r.grade} · {fmtDate(r.start)} · {fmtPct(r.probability)}
                        </span>
                        {r.strongCandidates === 0 && r.unmetFte > 0 ? <span className="shrink-0 font-semibold text-bad">Skill gap</span> : r.coverage !== 'unfilled' ? <CoverageBadge coverage={r.coverage} /> : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {live.length === 0 && <EmptyState compact icon={<UI_ICON.checkCircle size={16} aria-hidden="true" />} title="Nothing unfilled" body="Every live requirement is fully confirmed. Switch to All live to review them." />}
      </div>
    </Card>
  )
}

function Candidates({ reqId, focus }: { reqId: string; focus: string | null }) {
  const state = useApi<{ requirement: RequirementView; candidates: Candidate[] }>(`/api/requirements/${encodeURIComponent(reqId)}/candidates`)
  const [only, setOnly] = useState<'available' | 'all'>('available')
  const mutate = useMutation()

  useEffect(() => {
    if (focus && state.data) document.getElementById(`cand-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus, state.data])

  const rows = useMemo(() => {
    if (!state.data) return []
    return state.data.candidates.filter((c) => only === 'all' || c.assignment || c.availability >= 50 || c.code === focus)
  }, [state.data, only, focus])

  return (
    <Loadable state={state}>
      {({ requirement: r }) => {
        const fte = Math.min(1, r.unmetFte || r.fte)
        const act = (c: Candidate, status: 'proposed' | 'confirmed') =>
          mutate(
            () => (c.assignment ? api.patch(`/api/assignments/${c.assignment.id}`, { status }) : api.post('/api/assignments', { requirementId: r.id, employeeCode: c.code, fte: Math.min(fte, Math.max(0.1, c.availableFte || fte)), status })),
            status === 'confirmed'
              ? { title: `${c.code} confirmed for ${r.role}`, body: `${r.opportunityName} from ${fmtDate(r.start)}. Capacity, bench and risk are recalculated.`, actionLabel: 'Open Employee 360', actionTo: `/employees/${c.code}` }
              : { title: `${c.code} proposed for ${r.role}`, body: 'Proposals hold no capacity until confirmed.' },
          )
        const release = (c: Candidate) => mutate(() => api.del(`/api/assignments/${c.assignment!.id}`), { title: `${c.code} released from ${r.role}`, body: 'Their capacity is free again.' })
        const strongFree = state.data!.candidates.filter((c) => !c.assignment && c.score >= 65 && c.skillFit >= 60 && c.gradeFit >= 60 && c.availability >= 50).length
        const gap = r.unmetFte > 0 && strongFree < Math.ceil(r.unmetFte)

        return (
          <div className="flex min-w-0 flex-col gap-3">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">
                    <Link to={`/opportunities/${r.opportunityId}`} className="hover:text-brand hover:underline">
                      {r.account} · {r.opportunityName}
                    </Link>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-md font-extrabold tracking-[-0.01em] text-ink">{r.role}</h2>
                    <ProvenanceTag provenance={r.provenance} compact />
                    <CoverageBadge coverage={r.coverage} />
                  </div>
                  <div className="tabular mt-1 text-xs text-ink-muted">
                    G{r.grade} · {fmtNum(r.fte)} FTE · {fmtDate(r.start)} – {fmtDate(r.end)} · {fmtPct(r.probability)} win · {r.daysToStart >= 0 ? `starts in ${r.daysToStart} days` : `started ${-r.daysToStart} days ago`}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{r.scSkill}</Badge>
                    <Badge tone="neutral">{r.techSkill}</Badge>
                  </div>
                </div>
                <dl className="tabular grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Confirmed', fmtNum(r.confirmedFte)],
                    ['Proposed', fmtNum(r.proposedFte)],
                    ['Open', fmtNum(r.unmetFte)],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-[72px] rounded-md bg-surface-sunken px-2 py-1.5">
                      <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-faint">{k}</dt>
                      <dd className="figure text-base text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {gap && (
                <div className="mt-3">
                  <Callout tone="danger" title={`Capacity gap: ${strongFree} qualified ${strongFree === 1 ? 'person' : 'people'} free for ${fmtNum(r.unmetFte)} FTE`}>
                    Nobody else scores ≥ 65 with skill fit ≥ 60 at the right grade and at least half-free in the window. Options: a stretch candidate below, a cross-grade deployment, or an external hire.
                  </Callout>
                </div>
              )}
            </Card>

            <Card>
              <SectionHeading
                label="Candidates"
                icon={<WORKFLOW_ICON.candidates size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
                count={rows.length}
                actions={<Segmented ariaLabel="Candidate filter" value={only} onChange={setOnly} options={[{ id: 'available', label: 'Free ≥ 50%' }, { id: 'all', label: 'Everyone' }]} />}
              />
              <p className="mb-2 text-[11px] text-ink-faint">Match score = 40% skill fit + 20% grade fit + 25% availability (first 90 days) + 15% bench priority, +5 if they have worked for {r.account}.</p>
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={`${TABLE_TH} min-w-[190px]`}>Candidate</th>
                      <th className={`${TABLE_TH} min-w-[165px]`}>Skill fit</th>
                      <th className={`${TABLE_TH} min-w-[104px]`}>Grade fit</th>
                      <th className={`${TABLE_TH} min-w-[120px]`}>Availability</th>
                      <th className={`${TABLE_TH} min-w-[96px]`}>Bench priority</th>
                      <th className={TABLE_TH}>Match score</th>
                      <th className={`${TABLE_TH} text-right`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c, i) => (
                      <tr key={c.code} id={`cand-${c.code}`} className={`${TABLE_ROW} ${c.code === focus ? 'bg-brand-soft/50' : c.assignment?.status === 'confirmed' ? 'bg-good-soft/50' : ''}`}>
                        <td className={TABLE_TD}>
                          <div className="flex items-start gap-2">
                            <span className="tabular mt-0.5 w-4 shrink-0 text-right text-[11px] font-bold text-ink-faint">{i + 1}</span>
                            <div>
                              <EmployeeCell code={c.code} grade={c.grade} title={c.title} provenance={c.provenance} />
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <AvailabilityBadge status={c.status} />
                                {c.accountFamiliarity && <Badge tone="blue">Knows {r.account.split(/[\s(-]/)[0]}</Badge>}
                              </div>
                              {c.conflicts.length > 0 && <div className="mt-1 max-w-[30ch] text-[11px] leading-snug text-warn">{c.conflicts.join(' · ')}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={TABLE_TD}>
                          <ScoreCell value={c.skillFit} width={60} />
                          <ul className="mt-1 space-y-0.5 text-[11px] leading-snug">
                            {c.skillDetail.map((s) => (
                              <li key={s.skill} className={s.score === 0 ? 'text-ink-faint' : 'text-ink-muted'}>
                                {s.have === null ? `No ${s.skill}` : s.have === s.skill ? `${s.skill} · ${s.level ? PROFICIENCY_LABEL[s.level] : 'level not stated'}` : `${s.have} · related`}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className={TABLE_TD}>
                          <ScoreCell value={c.gradeFit} width={60} />
                          <div className="mt-1 text-[11px] text-ink-muted">{c.gradeLabel}</div>
                        </td>
                        <td className={TABLE_TD}>
                          <ScoreCell value={c.availability} width={60} />
                          <div className="mt-1 whitespace-nowrap text-[11px] text-ink-muted">{c.availableFrom ? `free from ${fmtDate(c.availableFrom)}` : 'no free date'}</div>
                        </td>
                        <td className={TABLE_TD}>
                          <ScoreCell value={c.benchPriority} width={60} />
                          <div className="mt-1 text-[11px] text-ink-muted">{c.benchDays !== null ? `${c.benchDays}d on bench` : c.status === 'fully-allocated' ? 'deployed' : '—'}</div>
                        </td>
                        <td className={TABLE_TD}>
                          <div className="flex items-center gap-2">
                            <span className={`figure tabular text-lg ${c.score >= 75 ? 'text-good' : 'text-ink'}`}>{c.score}</span>
                          </div>
                        </td>
                        <td className={`${TABLE_TD} whitespace-nowrap text-right`}>
                          {c.assignment ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="tabular text-[11px] text-ink-faint">{fmtNum(c.assignment.fte)} FTE</span>
                                <AssignmentBadge status={c.assignment.status} />
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {c.assignment.status === 'proposed' && (
                                  <Button size="sm" variant="primary" onClick={() => act(c, 'confirmed')} icon={<ConfirmIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
                                    Confirm
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => release(c)} icon={<CloseIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
                                  {c.assignment.status === 'proposed' ? 'Withdraw' : 'Release'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <Button size="sm" onClick={() => act(c, 'proposed')} icon={<ProposeIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
                                Propose
                              </Button>
                              <Button size="sm" variant="primary" disabled={r.unmetFte <= 0 || c.availability === 0} title={r.unmetFte <= 0 ? 'Requirement already filled' : c.availability === 0 ? 'No free capacity in the window' : undefined} onClick={() => act(c, 'confirmed')} icon={<ConfirmIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
                                Confirm
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && <EmptyState compact icon={<UI_ICON.users size={16} aria-hidden="true" />} title="No one is at least half-free in this window" body="Switch to Everyone to see partly free and deployed people, and when they roll off." />}
            </Card>
          </div>
        )
      }}
    </Loadable>
  )
}
