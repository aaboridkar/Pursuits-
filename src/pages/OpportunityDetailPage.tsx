import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addDays, addMonths, fiscalQuarter } from '../../shared/dates'
import type { Meta, OpportunityView, Requirement, RequirementView } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { Button } from '../components/ui/Button'
import { Callout } from '../components/ui/Callout'
import { Card } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { FIELD, FIELD_LABEL } from '../components/ui/form'
import { JourneyStrip } from '../components/ui/JourneyStrip'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionHeading } from '../components/ui/SectionHeading'
import { UI_ICON, WORKFLOW_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { AssignmentBadge, CoverageBadge, CoverageRiskBadge, Est, OutcomeBadge, ProvenanceTag } from '../components/workforce/badges'
import { Dot, Loadable } from '../components/workforce/common'
import { fmtDate, fmtMoney, fmtMonth, fmtNum, fmtPct } from '../engine/format'

const ArrowRight = UI_ICON.arrowRight
const PlusIcon = UI_ICON.plus
const EditIcon = UI_ICON.edit
const TrashIcon = UI_ICON.trash

export function OpportunityDetailPage() {
  const { id = '' } = useParams()
  const state = useApi<OpportunityView>(`/api/opportunities/${encodeURIComponent(id)}`)
  const meta = useApi<Meta>('/api/meta')
  return <Loadable state={state}>{(o) => <Detail o={o} meta={meta.data} />}</Loadable>
}

function Detail({ o, meta }: { o: OpportunityView; meta: Meta | null }) {
  const [editing, setEditing] = useState<RequirementView | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RequirementView | null>(null)
  const mutate = useMutation()
  const fp = o.fieldProvenance
  const live = o.outcome !== 'lost'
  const firstOpen = o.requirements.find((r) => r.unmetFte > 0 && r.coverage !== 'closed')

  return (
    <>
      <PageHeader
        breadcrumbs={['Workforce', 'Opportunity pipeline', o.name]}
        meta={
          <>
            <span className="text-sm font-extrabold tracking-[-0.01em] text-ink">{o.name}</span>
            <ProvenanceTag provenance={o.provenance} />
            <Dot />
            <span className="font-semibold text-ink-muted">{o.account}</span>
            <Dot />
            <span className="text-ink-muted">
              {o.type} · {o.stage}
            </span>
            <OutcomeBadge outcome={o.outcome} />
          </>
        }
        actions={<JourneyStrip current="opportunity" links={{ requirement: `#requirements`, candidates: firstOpen ? `/workbench?req=${firstOpen.id}` : '/workbench', gap: '/capacity' }} />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Deal value" value={o.value === null ? 'Not stated' : fmtMoney(o.value)} detail={`${fmtMoney((o.value ?? 0) * o.probability)} weighted`} />
        <KpiTile label="Win probability" value={fmtPct(o.probability)} detail={fp.confWinning === 'synthetic' ? 'assumed from stage' : fp.confWinning === 'derived' ? 'derived from tracker' : 'from tracker'} meter={o.probability * 100} />
        <KpiTile label="Estimated start" value={o.estStartDate ? fmtDate(o.estStartDate) : '—'} detail={`${o.estStartDate ? fiscalQuarter(o.estStartDate) : ''}${fp.estStartDate ? ` · ${fp.estStartDate === 'synthetic' ? 'assumed' : 'derived'}` : ''}`} />
        <KpiTile label="Duration" value={o.months ? `${o.months} months` : '—'} detail={fp.months ? (fp.months === 'synthetic' ? 'assumed' : 'derived') : 'from tracker'} />
        <KpiTile label="People demand" value={`${fmtNum(o.totalFte)} FTE`} detail={`${fmtNum(o.weightedFte)} FTE weighted · ${o.requirements.length} roles`} />
        <KpiTile label="Unfilled" value={`${fmtNum(o.unmetFte)} FTE`} detail={`${fmtNum(o.confirmedFte)} FTE confirmed`} tone={o.unmetFte > 0 ? 'bad' : 'good'} meter={o.totalFte ? (o.confirmedFte / o.totalFte) * 100 : 0} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <SectionHeading label="Tracker record" icon={<UI_ICON.fileText size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            {[
              ['Proposal date', fmtDate(o.proposalDate)],
              ['Confidence of winning', <>{fmtPct(o.confWinning)}<Est provenance={fp.confWinning} /></>],
              ['Start this quarter', fmtPct(o.confThisQuarter)],
              ['Start next quarter', fmtPct(o.confNextQuarter)],
              ['Status', o.status || '—'],
              ['Record', o.provenance === 'source' ? `Opportunity.csv · S.No ${o.sno}` : 'Synthetic (data/synthetic)'],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">{k}</dt>
                <dd className="mt-0.5 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {o.monthly.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-faint">
                Weighted value by month
                <Est provenance={fp.monthly} note="Spread evenly over the duration — the tracker has no monthly split" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {o.monthly.map((m) => (
                  <span key={m.month} className="tabular rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-ink-muted">
                    <span className="font-semibold text-ink">{fmtMonth(m.month)}</span> {fmtMoney(m.value)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
        {o.notes.length > 0 ? (
          <Callout tone="info" title="How blank tracker fields were filled">
            <ul className="space-y-1">
              {o.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Callout>
        ) : (
          <Callout tone="success" title="Complete tracker record">
            Every field used for demand comes from the {o.provenance === 'source' ? 'source tracker' : 'synthetic record'} — nothing assumed.
          </Callout>
        )}
      </div>

      <Card className="mt-3" id="requirements">
        <SectionHeading
          label="Resource requirements"
          icon={<WORKFLOW_ICON.requirement size={13} strokeWidth={2.2} className="text-ink-faint" aria-hidden="true" />}
          count={o.requirements.length}
          actions={
            <div className="flex items-center gap-2">
              <CoverageRiskBadge risk={o.coverageRisk} />
              {live && (
                <Button size="sm" variant="secondary" icon={<PlusIcon size={13} strokeWidth={2.4} aria-hidden="true" />} onClick={() => setEditing('new')}>
                  Add requirement
                </Button>
              )}
            </div>
          }
        />
        {o.requirements.length === 0 ? (
          <EmptyState
            compact
            icon={<WORKFLOW_ICON.requirement size={16} aria-hidden="true" />}
            title={live ? 'No requirements yet' : 'Lost — no staffing needed'}
            body={live ? 'Add the roles this opportunity needs so demand, gaps and candidate matching can be calculated.' : 'This opportunity was lost, so it adds no demand.'}
            action={
              live ? (
                <Button size="sm" variant="primary" onClick={() => setEditing('new')} icon={<PlusIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
                  Add requirement
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TABLE_TH}>Role</th>
                  <th className={TABLE_TH}>Grade</th>
                  <th className={`${TABLE_TH} text-right`}>FTE</th>
                  <th className={TABLE_TH}>Supply chain skill</th>
                  <th className={TABLE_TH}>Technical skill</th>
                  <th className={TABLE_TH}>Window</th>
                  <th className={TABLE_TH}>Coverage</th>
                  <th className={TABLE_TH}>Deployed / proposed</th>
                  <th className={TABLE_TH} title="Available people scoring ≥ 65 with skill fit ≥ 60">
                    Supply
                  </th>
                  <th className={TABLE_TH} />
                </tr>
              </thead>
              <tbody>
                {o.requirements.map((r) => (
                  <tr key={r.id} className={TABLE_ROW}>
                    <td className={`${TABLE_TD_STRONG} min-w-[150px]`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.role}
                        <ProvenanceTag provenance={r.provenance} compact />
                      </div>
                      <div className="text-[11px] font-normal text-ink-faint">{r.id}</div>
                    </td>
                    <td className={`${TABLE_TD} whitespace-nowrap`}>
                      {meta?.grades.find((g) => g.grade === r.grade)?.title} <span className="text-ink-faint">G{r.grade}</span>
                    </td>
                    <td className={`${TABLE_TD} tabular text-right font-semibold text-ink`}>{fmtNum(r.fte)}</td>
                    <td className={TABLE_TD}>{r.scSkill}</td>
                    <td className={TABLE_TD}>{r.techSkill}</td>
                    <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
                      {fmtDate(r.start)}
                      <div className="text-[11px] text-ink-faint">to {fmtDate(r.end)}</div>
                    </td>
                    <td className={TABLE_TD}>
                      <CoverageBadge coverage={r.coverage} />
                      {r.unmetFte > 0 && r.coverage !== 'closed' && <div className="tabular mt-0.5 text-[11px] text-ink-faint">{fmtNum(r.unmetFte)} FTE open</div>}
                    </td>
                    <td className={TABLE_TD}>
                      {r.assignments.length === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {r.assignments.map((a) => (
                            <li key={a.id} className="flex items-center gap-1.5 whitespace-nowrap">
                              <Link to={`/employees/${a.employeeCode}`} className="font-semibold text-ink hover:text-brand hover:underline">
                                {a.employeeCode}
                              </Link>
                              <span className="tabular text-[11px] text-ink-faint">{fmtNum(a.fte)}</span>
                              <AssignmentBadge status={a.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={`${TABLE_TD} whitespace-nowrap`}>
                      {r.coverage === 'closed' ? (
                        '—'
                      ) : r.strongCandidates === 0 ? (
                        <span className="font-semibold text-bad">No qualified candidate</span>
                      ) : (
                        <span>
                          <span className="font-semibold text-ink">{r.strongCandidates}</span> strong
                          {r.bestCandidate && <span className="text-ink-faint"> · best {r.bestCandidate.score}</span>}
                        </span>
                      )}
                    </td>
                    <td className={`${TABLE_TD} whitespace-nowrap text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        {r.coverage !== 'closed' && (
                          <Link to={`/workbench?req=${r.id}`}>
                            <Button size="sm" variant={r.unmetFte > 0 ? 'primary' : 'secondary'} icon={<ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />}>
                              {r.unmetFte > 0 ? 'Find candidates' : 'Review'}
                            </Button>
                          </Link>
                        )}
                        <button type="button" onClick={() => setEditing(r)} aria-label={`Edit ${r.role}`} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink">
                          <EditIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(r)} aria-label={`Delete ${r.role}`} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-bad-soft hover:text-bad">
                          <TrashIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && meta && (
        <RequirementDialog
          opportunity={o}
          meta={meta}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await mutate(() => (editing === 'new' ? api.post(`/api/opportunities/${o.id}/requirements`, body) : api.patch(`/api/requirements/${editing.id}`, body)), {
              title: editing === 'new' ? 'Requirement added' : 'Requirement updated',
              body: `${body.role} · ${body.fte} FTE. Demand, gaps and candidate matches are recalculated.`,
            })
            if (ok !== undefined) setEditing(null)
          }}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this requirement?"
        eyebrow={o.name}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={<TrashIcon size={13} strokeWidth={2.4} aria-hidden="true" />}
              onClick={async () => {
                const r = confirmDelete!
                await mutate(() => api.del(`/api/requirements/${r.id}`), { title: 'Requirement deleted', body: `${r.role} removed along with its proposed and confirmed people.` })
                setConfirmDelete(null)
              }}
            >
              Delete requirement
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{confirmDelete.role}</span> ({fmtNum(confirmDelete.fte)} FTE, G{confirmDelete.grade}) will be removed from demand.
            {confirmDelete.assignments.length > 0 && ` ${confirmDelete.assignments.length} deployment decision${confirmDelete.assignments.length === 1 ? '' : 's'} on it will be removed too.`} Reset demo restores it.
          </p>
        )}
      </Dialog>
    </>
  )
}

type Draft = Pick<Requirement, 'role' | 'grade' | 'fte' | 'scSkill' | 'techSkill' | 'start' | 'end'>

function RequirementDialog({ opportunity, meta, initial, onClose, onSave }: { opportunity: OpportunityView; meta: Meta; initial: RequirementView | null; onClose: () => void; onSave: (d: Draft) => void }) {
  const start = initial?.start ?? opportunity.estStartDate ?? meta.asOf
  const [d, setD] = useState<Draft>(
    initial ?? { role: '', grade: 7, fte: 1, scSkill: 'Demand planning', techSkill: 'Python', start, end: addDays(addMonths(start, opportunity.months ?? 3), -1) },
  )
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const valid = d.role.trim() && d.fte > 0 && d.start && d.end && d.end >= d.start
  const sc = meta.skillCatalog.filter((s) => s.category === 'Supply Chain')
  const tech = meta.skillCatalog.filter((s) => s.category === 'Technical')

  return (
    <Dialog
      open
      variant="panel"
      onClose={onClose}
      eyebrow={opportunity.name}
      title={initial ? `Edit ${initial.role}` : 'Add resource requirement'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...d, role: d.role.trim() })}>
            {initial ? 'Save changes' : 'Add requirement'}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-3.5" onSubmit={(e) => (e.preventDefault(), valid && onSave(d))}>
        <div>
          <label className={FIELD_LABEL} htmlFor="req-role">
            Role
          </label>
          <input id="req-role" className={FIELD} value={d.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Demand planning consultant" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="req-grade">
              Grade
            </label>
            <select id="req-grade" className={FIELD} value={d.grade} onChange={(e) => set('grade', Number(e.target.value))}>
              {meta.grades.map((g) => (
                <option key={g.grade} value={g.grade}>
                  G{g.grade} · {g.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="req-fte">
              Required FTE
            </label>
            <input id="req-fte" type="number" min={0.1} max={10} step={0.1} className={FIELD} value={d.fte} onChange={(e) => set('fte', Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className={FIELD_LABEL} htmlFor="req-sc">
            Supply chain skill
          </label>
          <select id="req-sc" className={FIELD} value={d.scSkill} onChange={(e) => set('scSkill', e.target.value)}>
            {sc.map((s) => (
              <option key={s.skill}>{s.skill}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL} htmlFor="req-tech">
            Technical skill
          </label>
          <select id="req-tech" className={FIELD} value={d.techSkill} onChange={(e) => set('techSkill', e.target.value)}>
            {tech.map((s) => (
              <option key={s.skill}>{s.skill}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="req-start">
              Start date
            </label>
            <input id="req-start" type="date" className={FIELD} value={d.start} onChange={(e) => set('start', e.target.value)} />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="req-end">
              End date
            </label>
            <input id="req-end" type="date" className={FIELD} value={d.end} min={d.start} onChange={(e) => set('end', e.target.value)} />
          </div>
        </div>
        {d.end < d.start && <p className="text-[11.5px] font-semibold text-bad">End date must be on or after the start date.</p>}
        <p className="text-[11.5px] text-ink-faint">Saved in the app (data/runtime), never written back to the CSVs. Reset demo removes it.</p>
      </form>
    </Dialog>
  )
}
