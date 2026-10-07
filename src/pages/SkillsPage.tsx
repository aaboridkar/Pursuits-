import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PROFICIENCY_LABEL, type AvailabilityStatus, type EmployeeCapacity, type EmployeeSkill, type Provenance, type SkillCategory } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Collapsible } from '../components/ui/Collapsible'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Tabs } from '../components/ui/Tabs'
import { UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../components/ui/table'
import { AvailabilityBadge, ProvenanceTag } from '../components/workforce/badges'
import { Legend } from '../components/workforce/charts'
import { Dot, EmployeeCell, Loadable, SearchField, Segmented, useFilters } from '../components/workforce/common'

interface SkillsResponse {
  asOf: string
  staleDays: number
  people: { code: string; name: string | null; title: string; grade: number | null; status: AvailabilityStatus | null; provenance: Provenance; inAllocation: boolean; lastUpdated: string | null; daysSinceUpdate: number | null; stale: boolean; skills: EmployeeSkill[] }[]
  coverage: { skill: string; category: SkillCategory; holders: number; advanced: number; demandFte: number }[]
}

type View = 'matrix' | 'list'

/** Sequential, one hue: proficiency 1→4 runs light→dark brand blue; the level is always printed. */
const LEVEL_BG: Record<number, string> = { 1: '#d6e9f8', 2: '#9fcbee', 3: '#4aa6e6', 4: '#0067b4' }
const LEVEL_INK: Record<number, string> = { 1: 'var(--color-ink)', 2: 'var(--color-ink)', 3: '#ffffff', 4: '#ffffff' }

export function SkillsPage() {
  const state = useApi<SkillsResponse>('/api/skills')
  return <Loadable state={state}>{(d) => <Skills data={d} />}</Loadable>
}

function Skills({ data }: { data: SkillsResponse }) {
  const [params, setParams] = useSearchParams()
  const view = (['matrix', 'list'].includes(params.get('view') ?? '') ? params.get('view') : 'matrix') as View
  const [category, setCategory] = useState<'all' | SkillCategory>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [skillFilter, setSkillFilter] = useState<Set<string>>(new Set())
  // Skill list level changes: `code|skill` → 0 (remove) … 4, staged until Save.
  const [drafts, setDrafts] = useState<Record<string, number>>({})
  const draftCount = Object.keys(drafts).length
  useEffect(() => {
    if (draftCount === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftCount])
  const stageLevel = (key: string, level: number, saved: number) =>
    setDrafts((d) => {
      const { [key]: _, ...rest } = d
      return level === saved ? rest : { ...rest, [key]: level }
    })
  // Column filters on the people: ID, name, designation, grade.
  const filters = useFilters<'id' | 'name' | 'desg' | 'grade'>()
  const gradeOf = (g: number | null) => (g === null ? '—' : `G${g}`)
  const nameOf = (n: string | null) => n ?? '—'
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
    setPage(1)
  }

  const people = data.people.filter((p) => filters.passes('id', p.code) && filters.passes('name', nameOf(p.name)) && filters.passes('desg', p.title) && filters.passes('grade', gradeOf(p.grade)) && (!q || `${p.code} ${p.title} ${p.skills.map((s) => s.skill).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  const skills = data.coverage.filter((c) => category === 'all' || c.category === category)

  const rows = people.flatMap((p) => p.skills.filter((s) => (category === 'all' || s.category === category) && (skillFilter.size === 0 || skillFilter.has(s.skill))).map((s) => ({ p, s })))
  const PAGE = 25

  return (
    <>
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
            <Segmented ariaLabel="Skill category" value={category} onChange={(c) => (setCategory(c), setPage(1))} options={[{ id: 'all', label: 'All skills' }, { id: 'Supply Chain', label: 'Supply chain' }, { id: 'Data Science', label: 'Data Science' }, { id: 'FDE', label: 'FDE' }]} />
            <SearchField value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search people or skills" />
          </>
        }
      />

      <AddSkill />

      <Tabs
        ariaLabel="Skills view"
        value={view}
        onChange={(v) => set('view', v === 'matrix' ? null : v)}
        tabs={[
          { id: 'matrix', label: 'Matrix', count: people.length },
          { id: 'list', label: 'Skill rating', count: rows.length },
        ]}
        actions={view === 'matrix' ? <Legend items={[1, 2, 3, 4].map((l) => ({ label: `${l} ${PROFICIENCY_LABEL[l]}`, color: LEVEL_BG[l] }))} /> : undefined}
      />

      {view === 'matrix' && (
        <Card>
          {people.length === 0 ? (
            <EmptyState icon={<UI_ICON.checkCircle size={16} aria-hidden="true" />} title="No matching profiles" body="Clear the search to see everyone." />
          ) : (
            <div className="scroll-x">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface" />
                    <th colSpan={3} />
                    {sections(skills).map((g) => (
                      <th key={g.category} colSpan={g.count} className={`border-b-2 px-1 pb-1 text-left text-[10.5px] font-bold uppercase tracking-[0.07em] ${SECTION_STYLE[g.category]}`}>
                        {SECTION_LABEL[g.category]}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className={`${TABLE_TH} sticky left-0 z-10 bg-surface align-bottom`}>
                      <ColumnFilter label="ID" options={uniq(data.people.map((p) => p.code))} selected={filters.get('id')} onToggle={(v) => filters.toggle('id', v)} onClear={() => filters.clear('id')} />
                    </th>
                    <th className={`${TABLE_TH} align-bottom`}>
                      <ColumnFilter label="Name" options={uniq(data.people.map((p) => nameOf(p.name)))} selected={filters.get('name')} onToggle={(v) => filters.toggle('name', v)} onClear={() => filters.clear('name')} />
                    </th>
                    <th className={`${TABLE_TH} align-bottom`}>
                      <ColumnFilter label="Designation" options={uniq(data.people.map((p) => p.title))} selected={filters.get('desg')} onToggle={(v) => filters.toggle('desg', v)} onClear={() => filters.clear('desg')} />
                    </th>
                    <th className={`${TABLE_TH} align-bottom`}>
                      <ColumnFilter label="Grade" options={uniq(data.people.map((p) => gradeOf(p.grade)))} selected={filters.get('grade')} onToggle={(v) => filters.toggle('grade', v)} onClear={() => filters.clear('grade')} />
                    </th>
                    {skills.map((s) => (
                      <th key={s.skill} className={`h-[118px] w-[30px] min-w-[30px] px-0 pb-1.5 align-bottom ${startsSection(skills, s.skill) ? 'border-l border-border' : ''}`}>
                        <div className="mx-auto w-[14px] whitespace-nowrap text-[10.5px] font-bold text-ink-faint [writing-mode:vertical-rl] rotate-180" title={`${s.skill} · ${s.category}`}>
                          {s.skill}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const by = new Map(p.skills.map((s) => [s.skill, s]))
                    return (
                      <tr key={p.code} className={TABLE_ROW}>
                        <td className={`${TABLE_TD} sticky left-0 z-10 whitespace-nowrap bg-surface align-middle`}>
                          <span className="inline-flex items-center gap-1.5">
                            <Link to={`/employees/${p.code}`} className="tabular font-semibold text-ink hover:text-brand hover:underline">
                              {p.code}
                            </Link>
                            <ProvenanceTag provenance={p.provenance} compact />
                          </span>
                          {!p.inAllocation && <div className="text-[10.5px] text-warn">Skills.csv only</div>}
                        </td>
                        <td className={`${TABLE_TD} whitespace-nowrap align-middle`}>{p.name ?? <span className="text-ink-faint">—</span>}</td>
                        <td className={`${TABLE_TD} whitespace-nowrap align-middle`}>{p.inAllocation ? p.title : <span className="text-ink-faint">—</span>}</td>
                        <td className={`${TABLE_TD} tabular whitespace-nowrap align-middle`}>
                          {p.grade !== null ? <span className="font-semibold text-ink">G{p.grade}</span> : <span className="text-ink-faint">—</span>}
                        </td>
                        {skills.map((s) => {
                          const have = by.get(s.skill)
                          const lvl = have?.proficiency ?? (have ? 2 : 0)
                          const edge = startsSection(skills, s.skill) ? 'border-l border-border' : ''
                          return (
                            <td key={s.skill} className={`px-[2px] py-1 text-center align-middle ${edge}`}>
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
          <AddRating catalogue={data.coverage} people={data.people} />
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
                      <ProficiencyEditor code={p.code} skill={s} draft={drafts[`${p.code}|${s.skill}`]} onPick={(l) => stageLevel(`${p.code}|${s.skill}`, l, s.proficiency ?? 0)} />
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

      {view === 'matrix' && people.some((p) => p.status) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
          Status today: {(['bench', 'partially-available'] as AvailabilityStatus[]).map((s) => <AvailabilityBadge key={s} status={s} />)} people are the ones to reskill first. Dashed outline = level not stated in source.
        </div>
      )}
      <SkillSaveBar drafts={drafts} onDone={() => setDrafts({})} />
    </>
  )
}


const SECTION_LABEL: Record<SkillCategory, string> = { 'Supply Chain': 'Supply chain', 'Data Science': 'DS · Data Science', FDE: 'FDE · Forward Deployed Engineer' }
const SECTION_STYLE: Record<SkillCategory, string> = { 'Supply Chain': 'border-border text-ink-faint', 'Data Science': 'border-good text-good', FDE: 'border-brand text-brand' }

/** Consecutive columns of the same category, for the section headings over the matrix. */
function sections(skills: { skill: string; category: SkillCategory }[]) {
  const out: { category: SkillCategory; count: number }[] = []
  for (const s of skills) {
    const last = out[out.length - 1]
    if (last && last.category === s.category) last.count++
    else out.push({ category: s.category, count: 1 })
  }
  return out
}
const startsSection = (skills: { skill: string; category: SkillCategory }[], skill: string) => {
  const i = skills.findIndex((s) => s.skill === skill)
  return i > 0 && skills[i - 1].category !== skills[i].category
}

/** Level picker in the Skill list. Changes are staged (yellow) and saved with the Save bar; 0 removes the skill. */
function ProficiencyEditor({ code, skill, draft, onPick }: { code: string; skill: EmployeeSkill; draft: number | undefined; onPick: (level: number) => void }) {
  const value = draft ?? skill.proficiency ?? ''
  return (
    <select
      aria-label={`${skill.skill} proficiency for ${code}`}
      value={value}
      onChange={(e) => onPick(Number(e.target.value))}
      className={`min-h-[26px] rounded-md border px-1.5 text-[12px] text-ink focus:border-brand ${draft !== undefined ? 'border-accent bg-warn-soft' : 'border-border-strong bg-surface'}`}
    >
      {skill.proficiency === null && draft === undefined && <option value="">Not stated</option>}
      {[1, 2, 3, 4].map((l) => (
        <option key={l} value={l}>
          {l} · {PROFICIENCY_LABEL[l]}
        </option>
      ))}
      <option value={0}>Remove skill</option>
    </select>
  )
}

/** Shown only while Skill list changes are unsaved: count, Discard, Save. Saved to the database and logged with the IP. */
function SkillSaveBar({ drafts, onDone }: { drafts: Record<string, number>; onDone: () => void }) {
  const run = useMutation()
  const [saving, setSaving] = useState(false)
  const count = Object.keys(drafts).length
  if (count === 0 && !saving) return null
  const save = async () => {
    setSaving(true)
    const out = await run(() => api.post('/api/skills/edits', { edits: drafts }), { title: 'Skills saved', body: `${count} skill change${count === 1 ? '' : 's'} saved to the database.` })
    setSaving(false)
    if (out) onDone()
  }
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <span className="text-xs font-semibold text-warn">
        {count} unsaved skill change{count === 1 ? '' : 's'}
      </span>
      <Button size="sm" variant="secondary" onClick={onDone} disabled={saving}>
        Discard
      </Button>
      <Button size="sm" variant="primary" onClick={save} disabled={saving} icon={<UI_ICON.check size={13} strokeWidth={2.4} aria-hidden="true" />}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

const SKILL_GROUP_LABEL: Record<SkillCategory, string> = { 'Supply Chain': 'Supply chain', 'Data Science': 'DS · Data Science', FDE: 'FDE · Forward Deployed Engineer' }

/**
 * Rate someone on a skill they don't have yet (any skill in the catalogue, including newly added ones):
 * employee from the employee master, skill, level. All required; saved straight to the database and logged.
 */
function AddRating({ catalogue, people }: { catalogue: { skill: string; category: SkillCategory }[]; people: SkillsResponse['people'] }) {
  const run = useMutation()
  const employees = useApi<EmployeeCapacity[]>('/api/employees')
  const master = useMemo(() => [...(employees.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [employees.data])
  const [code, setCode] = useState('')
  const [skill, setSkill] = useState('')
  const [level, setLevel] = useState(0)
  const [saving, setSaving] = useState(false)
  const held = new Set(people.find((p) => p.code === code)?.skills.map((s) => s.skill) ?? [])
  const available = catalogue.filter((c) => !held.has(c.skill))
  const reset = () => (setCode(''), setSkill(''), setLevel(0))
  const missing = [!code && 'employee', !skill && 'skill', !level && 'level'].filter(Boolean) as string[]

  const add = async () => {
    setSaving(true)
    const out = await run(() => api.post('/api/skills/edits', { edits: { [`${code}|${skill}`]: level } }), { title: 'Rating added', body: `${code} · ${skill} · ${level} ${PROFICIENCY_LABEL[level]} saved to the database.` })
    setSaving(false)
    if (out) reset()
  }

  const label = 'mb-0.5 block text-[10.5px] font-semibold text-ink-muted'
  const field = 'h-[26px] w-full rounded border border-border-strong bg-surface px-1 text-[12px] text-ink focus:border-brand'
  return (
    <div className="mb-2 rounded-md border border-dashed border-border-strong px-3 py-2">
      <div className="eyebrow mb-1">Add rating</div>
        <form
          className="grid grid-cols-1 gap-x-3 gap-y-1.5 pb-1.5 sm:grid-cols-[2fr_2fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!missing.length && !saving) add()
          }}
        >
          <label>
            <span className={label}>Employee *</span>
            <select className={`${field} tabular`} value={code} onChange={(e) => (setCode(e.target.value), setSkill(''))}>
              <option value="">Select from employee master</option>
              {master.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.code} · {e.title} · G{e.grade}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Skill *</span>
            <select className={field} value={skill} onChange={(e) => setSkill(e.target.value)} disabled={!code}>
              <option value="">{code ? `Select a skill (${available.length} not yet held)` : 'Pick an employee first'}</option>
              {(['Supply Chain', 'Data Science', 'FDE'] as SkillCategory[]).map((cat) => {
                const options = available.filter((c) => c.category === cat)
                return options.length ? (
                  <optgroup key={cat} label={SKILL_GROUP_LABEL[cat]}>
                    {options.map((c) => (
                      <option key={c.skill}>{c.skill}</option>
                    ))}
                  </optgroup>
                ) : null
              })}
            </select>
          </label>
          <label>
            <span className={label}>Level *</span>
            <select className={field} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              <option value={0}>Select level</option>
              {[1, 2, 3, 4].map((l) => (
                <option key={l} value={l}>
                  {l} · {PROFICIENCY_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={reset} disabled={saving}>
              Clear
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={missing.length > 0 || saving} title={missing.length ? `Still needed: ${missing.join(', ')}` : 'Save this rating to the database'} icon={<UI_ICON.plus size={13} strokeWidth={2.4} aria-hidden="true" />}>
              {saving ? 'Adding…' : 'Add rating'}
            </Button>
          </div>
        </form>
    </div>
  )
}

/**
 * Global: adds a new skill to the catalogue (dim_skill). It shows up as a matrix column for everyone,
 * in its section; people are then rated on it in the Skill rating tab. Name and category are required.
 */
function AddSkill() {
  const run = useMutation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<SkillCategory | ''>('')
  const [saving, setSaving] = useState(false)
  const clean = name.trim().replace(/\s+/g, ' ')
  const problems = [
    !(clean.length >= 2 && clean.length <= 60) && 'a skill name (2–60 characters)',
    /[|<>]/.test(clean) && 'a name without | < or >',
    !category && 'a category',
  ].filter(Boolean) as string[]

  const add = async () => {
    setSaving(true)
    const out = await run(() => api.post('/api/skills', { skill: clean, category }), { title: 'Skill added', body: `${clean} added to the ${SKILL_GROUP_LABEL[category as SkillCategory]} section. Rate people on it in Skill rating.` })
    setSaving(false)
    if (out) {
      setName('')
      setCategory('')
      setOpen(false)
    }
  }

  const label = 'mb-0.5 block text-[10.5px] font-semibold text-ink-muted'
  const field = 'h-[26px] w-full rounded border border-border-strong bg-surface px-1 text-[12px] text-ink focus:border-brand'
  return (
    <Card className="mb-3 py-0.5! px-3!">
      <Collapsible open={open} onOpenChange={setOpen} label="Add skill" icon={<UI_ICON.plus size={13} strokeWidth={2.4} className="text-ink-faint" aria-hidden="true" />}>
        <form
          className="grid grid-cols-1 gap-x-3 gap-y-1.5 pb-1.5 sm:grid-cols-[3fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (!problems.length && !saving) add()
          }}
        >
          <label>
            <span className={label}>Skill name *</span>
            <input className={field} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prompt engineering" />
          </label>
          <label>
            <span className={label}>Section *</span>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value as SkillCategory)}>
              <option value="">Select a section</option>
              {(['Supply Chain', 'Data Science', 'FDE'] as SkillCategory[]).map((c) => (
                <option key={c} value={c}>
                  {SKILL_GROUP_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            {problems.length > 0 && clean && <span className="text-[11px] text-warn">Needs {problems.join(', ')}</span>}
            <Button type="submit" size="sm" variant="primary" disabled={problems.length > 0 || saving} icon={<UI_ICON.plus size={13} strokeWidth={2.4} aria-hidden="true" />}>
              {saving ? 'Adding…' : 'Add skill'}
            </Button>
          </div>
        </form>
      </Collapsible>
    </Card>
  )
}