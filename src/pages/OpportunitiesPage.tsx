import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CLOSED_STAGES, OPPORTUNITY_STAGES, OPPORTUNITY_TYPES, STAGE_WIN_DEFAULT } from '../../shared/catalog'
import { addMonths, fiscalQuarter } from '../../shared/dates'
import { applyOpportunityEdit } from '../../shared/opportunityEdit'
import type { Client, EmployeeCapacity, OpportunityEdit, OpportunityView } from '../../shared/types'
import { api, useApi, useMutation } from '../api/client'
import { KpiTile } from '../components/domain/KpiTile'
import { StickyBand } from '../components/layout/StickyBand'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Collapsible } from '../components/ui/Collapsible'
import { ColumnFilter } from '../components/ui/ColumnFilter'
import { INLINE_FIELD } from '../components/ui/form'
import { UI_ICON } from '../components/ui/icons'
import { TABLE_ROW, TABLE_ROW_HOVER, TABLE_TH } from '../components/ui/table'
import { OppTypeIcon } from '../components/workforce/badges'
import { Loadable, SortTh, useFilters, useSort } from '../components/workforce/common'
import { fmtMoney } from '../engine/format'

type Key = 'id' | 'name' | 'start' | 'value' | 'win' | 'lead' | 'fy'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-10" → "Oct 26". */
const monthLabel = (key: string) => `${MONTH_ABBR[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`

const QUARTERS = [1, 2, 3, 4]

/** Today's fiscal quarter (1–4) and year label, e.g. { nowQ: 3, fy: 'FY27' }. The fiscal year runs Apr–Mar. */
function currentFiscal() {
  const today = fiscalQuarter(new Date().toISOString().slice(0, 10)) // e.g. "Q3 FY27"
  return { nowQ: Number(today[1]), fy: today.slice(3) }
}

/** Weighted monthly revenue summed into Q1–Q4 of the given fiscal year. */
const quarterRevenue = (o: OpportunityView, fy: string) =>
  QUARTERS.map((q) => o.monthly.filter((m) => fiscalQuarter(`${m.month}-01`) === `Q${q} ${fy}`).reduce((s, m) => s + m.value, 0))
const fyRevenue = (o: OpportunityView, fy: string) => quarterRevenue(o, fy).reduce((a, b) => a + b, 0)

/** The twelve months (YYYY-MM) of a fiscal year label, April to March: 'FY27' → 2026-04 … 2027-03. */
const fiscalMonths = (fy: string) => Array.from({ length: 12 }, (_, k) => addMonths(`${Number(fy.slice(2)) + 1999}-04-01`, k).slice(0, 7))

/**
 * Opp ID and name stay pinned while the wide table scrolls sideways. Pinned cells need their own
 * background so scrolled cells don't show through, matching the row's hover shade.
 */
const PIN_ID = 'sticky left-0 z-10 w-[68px] min-w-[68px]'
const PIN_NAME = 'sticky left-[68px] z-10 shadow-[1px_0_0_var(--color-border)]'
const PIN_BG = 'bg-surface group-hover:bg-surface-sunken'
/** Pipeline cells stay on one line so as many opportunities as possible fit on screen. */
const ROW_TD = 'px-1.5 py-1 align-middle whitespace-nowrap text-[12px] text-(--color-ink-muted)'

/** Every stage except the closed ones — what the table shows by default. */
const OPEN_STAGES = OPPORTUNITY_STAGES.filter((s) => !CLOSED_STAGES.includes(s))

/** Late-stage deals, close to signature — their stage shows in green. */
const SOW_STAGES = new Set(['SOW Preparation', 'SOW Submitted'])

/** A cell holding an unsaved edit. */
const DIRTY_TD = 'bg-warn-soft'

/**
 * The opportunity as the user is editing it: outcome, win % and the weighted monthly revenue behind
 * Q1–Q4, FY and the month columns are recomputed with the same code the server runs on save.
 */
function withDraft(o: OpportunityView, draft: OpportunityEdit | undefined): OpportunityView {
  return draft ? { ...o, ...applyOpportunityEdit(o, draft) } : o
}

/** Win % choices in 5-point steps, plus the current value when it falls between them. */
const winOptions = (pct: number) => [...new Set([...Array.from({ length: 21 }, (_, i) => i * 5), pct])].sort((a, b) => a - b)

/** "420000", "$420,000", "420k" or "1.2m" → dollars; "" → 0 (values default to 0); undefined when unreadable. */
function parseMoney(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (t === '') return 0
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(t)
  if (!m) return undefined
  return Math.round(Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1))
}

export function OpportunitiesPage() {
  const state = useApi<OpportunityView[]>('/api/opportunities')
  return <Loadable state={state}>{(opps) => <Pipeline opps={opps} />}</Loadable>
}

function Pipeline({ opps }: { opps: OpportunityView[] }) {
  const routerNavigate = useNavigate()
  const { nowQ, fy } = currentFiscal()
  // Dimension tables: clients for the Account field, the employee master for Lead.
  const clients = useApi<Client[]>('/api/clients')
  const employees = useApi<EmployeeCapacity[]>('/api/employees')
  const employeeList = useMemo(() => [...(employees.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [employees.data])
  const employeeByCode = useMemo(() => new Map(employeeList.map((e) => [e.code, e])), [employeeList])
  const fyMonths = fiscalMonths(fy)
  const nowMonth = new Date().toISOString().slice(0, 7)
  // Months before last month are grouped behind a toggle, hidden until asked for.
  const lastMonth = addMonths(`${nowMonth}-01`, -1).slice(0, 7)
  const olderMonths = fyMonths.filter((m) => m < lastMonth)
  const [showOlder, setShowOlder] = useState(false)
  const shownMonths = showOlder ? fyMonths : fyMonths.filter((m) => m >= lastMonth)
  const [drafts, setDrafts] = useState<Record<string, OpportunityEdit>>({})
  const draftCount = Object.values(drafts).reduce((n, d) => n + Object.keys(d).length, 0)
  const stageEdit = useCallback((o: OpportunityView, edit: OpportunityEdit) => {
    setDrafts((all) => {
      const next: OpportunityEdit = { ...all[o.id] }
      // A field set back to its saved value is no longer a change.
      for (const [k, v] of Object.entries(edit) as [keyof OpportunityEdit, unknown][]) {
        if ((o[k] ?? null) === (v ?? null)) delete next[k]
        else (next as Record<string, unknown>)[k] = v
      }
      const { [o.id]: _, ...rest } = all
      return Object.keys(next).length ? { ...rest, [o.id]: next } : rest
    })
  }, [])
  const draftContext = useMemo(() => ({ stage: stageEdit }), [stageEdit])
  const dirty = (id: string, field: keyof OpportunityEdit) => (drafts[id] && field in drafts[id] ? DIRTY_TD : '')
  // Leaving with unsaved edits: ask first, in the app and when closing or reloading the tab.
  const navigate = (to: string) => (draftCount === 0 || window.confirm(`Discard ${draftCount} unsaved change${draftCount === 1 ? '' : 's'}?`)) && routerNavigate(to)
  useEffect(() => {
    if (draftCount === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftCount])
  // Closed deals are hidden until someone ticks a closed stage in the Stage filter.
  const filters = useFilters<'account' | 'type' | 'stage'>({ stage: OPEN_STAGES })
  const filtered = opps.filter((o) => filters.passes('account', o.account) && filters.passes('type', o.type) && filters.passes('stage', o.stage))
  const { sorted, sort, toggle } = useSort<OpportunityView, Key>(
    filtered,
    {
      id: (o) => o.id,
      name: (o) => o.name,
      value: (o) => o.value,
      win: (o) => o.probability,
      lead: (o) => o.lead,
      start: (o) => o.estStartDate,
      fy: (o) => (o.outcome === 'lost' ? null : fyRevenue(o, fy)),
    },
    { key: 'id', dir: 'asc' },
  )

  const live = opps.filter((o) => o.outcome !== 'lost')
  const open = opps.filter((o) => o.outcome === 'open')
  const won = opps.filter((o) => o.outcome === 'won')
  const uniq = (xs: string[]) => [...new Set(xs)].sort()

  const valueOf = (o: OpportunityView) => o.value ?? 0
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  // Weighted revenue by quarter: tracker months where given, else spread over the (possibly assumed) duration.
  const weighted = QUARTERS.map((_, i) => sum(live.map((o) => quarterRevenue(o, fy)[i])))
  const remaining = sum(weighted.filter((_, i) => i + 1 >= nowQ))

  return (
    <DraftContext.Provider value={draftContext}>
      <StickyBand>
        <div className="grid grid-cols-2 divide-border sm:divide-x lg:grid-cols-4">
          <KpiTile inline plain label="Open opportunities" value={String(open.length)} detail={`${won.length} won · ${opps.length - live.length} lost`}>
            <StartQuarterStrip opps={open} what="open" measure={() => 1} format={String} />
          </KpiTile>
          <KpiTile inline plain label="Open pipeline value" value={fmtMoney(sum(open.map(valueOf)))} detail={`${fmtMoney(sum(open.map((o) => valueOf(o) * o.probability)))} probability-weighted`}>
            <StartQuarterStrip opps={open} what="open" measure={valueOf} format={fmtMoney} />
          </KpiTile>
          <KpiTile inline plain label={`Weighted value ${fy}`} value={fmtMoney(remaining)} detail={`value × win %, Q${nowQ}–Q4`}>
            <QuarterStrip values={weighted} format={fmtMoney} title={`Weighted revenue (value × win %) of open and won deals by quarter, ${fy}`} />
          </KpiTile>
          <KpiTile inline plain label="Won" value={fmtMoney(sum(won.map(valueOf)))} detail={`${won.length} engagement${won.length === 1 ? '' : 's'}`}>
            <StartQuarterStrip opps={won} what="won" measure={valueOf} format={fmtMoney} />
          </KpiTile>
        </div>
      </StickyBand>

      {/* The sticky KPI band sits 14px below its layout box, so mt-[30px] on the next block leaves a 16px gap. */}
      <AddOpportunity clients={(clients.data ?? []).map((c) => c.name)} employees={employeeList} />

      <Card className="mt-3">
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Opp ID" k="id" sort={sort} onSort={toggle} className={`px-1.5! ${PIN_ID} bg-surface`} />
                <SortTh label="Opportunity name" k="name" sort={sort} onSort={toggle} className={`${PIN_NAME} bg-surface`} />
                <th className={TABLE_TH}>
                  <ColumnFilter label="Account" options={uniq(opps.map((o) => o.account))} selected={filters.get('account')} onToggle={(v) => filters.toggle('account', v)} onClear={() => filters.clear('account')} />
                </th>
                <SortTh label="Value" k="value" sort={sort} onSort={toggle} className="px-1.5! text-right" />
                <SortTh label="Start" k="start" sort={sort} onSort={toggle} className="px-1.5!" title="Expected start month" />
                <SortTh label="Win" k="win" sort={sort} onSort={toggle} className="px-1.5! text-right" title="Confidence of winning" />
                <th className={`${TABLE_TH} px-1.5! text-right`} title="Number of months">Mths</th>
                <th className={TABLE_TH}>
                  <ColumnFilter label="Stage" options={[...OPPORTUNITY_STAGES, ...uniq(opps.map((o) => o.stage)).filter((s) => !OPPORTUNITY_STAGES.includes(s))]} selected={filters.get('stage')} onToggle={(v) => filters.toggle('stage', v)} onClear={() => filters.clear('stage')} />
                </th>
                <th className={TABLE_TH}>
                  <ColumnFilter label="Type" options={uniq(opps.map((o) => o.type))} selected={filters.get('type')} onToggle={(v) => filters.toggle('type', v)} onClear={() => filters.clear('type')} />
                </th>
                {QUARTERS.map((q) => (
                  <th key={q} className={`${TABLE_TH} px-1.5! text-right ${q < nowQ ? 'bg-good-soft text-good' : ''}`} title={`Weighted revenue (value × win %) in Q${q} ${fy}${q < nowQ ? ' — quarter is over' : ''}`}>
                    Q{q}
                  </th>
                ))}
                <SortTh label="FY" k="fy" sort={sort} onSort={toggle} className="px-1.5! text-right" title={`Weighted revenue (value × win %) in ${fy}`} />
                <SortTh label="Lead" k="lead" sort={sort} onSort={toggle} className="px-1.5!" />
                {olderMonths.length > 0 && (
                  <th className={`${TABLE_TH} px-0.5! text-center`}>
                    <MonthGroupToggle open={showOlder} months={olderMonths} onToggle={() => setShowOlder((v) => !v)} />
                  </th>
                )}
                {shownMonths.map((m) => (
                  <th key={m} className={`${TABLE_TH} px-1.5! text-right ${m < nowMonth ? 'bg-good-soft text-good' : ''}`} title={`Weighted revenue (value × win %) in ${monthLabel(m)}${m < nowMonth ? ' — month is over' : ''}`}>
                    {MONTH_ABBR[Number(m.slice(5, 7)) - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TotalRow rows={sorted.map((s) => withDraft(s, drafts[s.id]))} fy={fy} nowQ={nowQ} nowMonth={nowMonth} months={shownMonths} hasGroup={olderMonths.length > 0} />
              {sorted.map((saved) => {
                const o = withDraft(saved, drafts[saved.id])
                return (
                  <tr key={o.id} className={`group ${TABLE_ROW} ${TABLE_ROW_HOVER} cursor-pointer ${o.outcome === 'lost' ? 'opacity-60' : ''}`} onClick={() => navigate(`/opportunities/${o.id}`)}>
                    <td className={`${ROW_TD} tabular ${PIN_ID} ${PIN_BG}`}>{o.id}</td>
                    <td className={`${ROW_TD} font-semibold text-ink ${PIN_NAME} ${PIN_BG}`}>
                      <div className="flex max-w-[178px] items-center gap-1.5">
                        <Link to={`/opportunities/${o.id}`} onClick={(e) => { e.stopPropagation(); if (draftCount && !window.confirm(`Discard ${draftCount} unsaved change${draftCount === 1 ? '' : 's'}?`)) e.preventDefault() }} title={o.status ? `${o.name}\n\n${o.status}` : `${o.name}\n\nNo description in the tracker`} className="truncate hover:text-brand hover:underline">
                          {o.name}
                        </Link>
                      </div>
                    </td>
                    <td className={ROW_TD}>
                      <div className="max-w-[95px] truncate" title={o.account}>
                        {o.account}
                      </div>
                    </td>
                    <td className={`${ROW_TD} tabular text-right font-semibold text-ink ${dirty(o.id, 'value')}`} onClick={(e) => e.stopPropagation()}>
                      <ValueCell o={o} />
                    </td>
                    <td className={`${ROW_TD} tabular ${dirty(o.id, 'estStartDate')}`} onClick={(e) => e.stopPropagation()}>
                      <StartSelect o={o} />
                    </td>
                    <td className={`${ROW_TD} tabular text-right ${dirty(o.id, 'confWinning')}`} onClick={(e) => e.stopPropagation()}>
                      <WinSelect o={o} />
                    </td>
                    <td className={`${ROW_TD} tabular text-right ${dirty(o.id, 'months')}`} onClick={(e) => e.stopPropagation()}>
                      <MonthsCell o={o} />
                    </td>
                    <td className={`${ROW_TD} ${dirty(o.id, 'stage')}`} onClick={(e) => e.stopPropagation()}>
                      <StageSelect o={o} />
                    </td>
                    <td className={`${ROW_TD} ${dirty(o.id, 'type')}`} onClick={(e) => e.stopPropagation()}>
                      <TypeSelect o={o} />
                    </td>
                    {quarterRevenue(o, fy).map((v, i) => (
                      <td key={i} className={`${ROW_TD} tabular text-right ${i + 1 < nowQ ? 'bg-good-soft' : ''} ${v ? 'text-ink' : 'text-ink-faint'}`}>
                        {o.outcome === 'lost' ? '—' : v ? fmtMoney(v) : i + 1 < nowQ ? '' : '–'}
                      </td>
                    ))}
                    <td className={`${ROW_TD} tabular text-right font-semibold text-ink`}>{o.outcome === 'lost' ? '—' : fyRevenue(o, fy) ? fmtMoney(fyRevenue(o, fy)) : <span className="font-normal text-ink-faint">–</span>}</td>
                    {/* Read-only: the lead is chosen from the employee master when the opportunity is added. */}
                    <td className={ROW_TD}>
                      <LeadName lead={o.lead} employees={employeeByCode} />
                    </td>
                    {olderMonths.length > 0 && <td className={`${ROW_TD} px-0.5` } aria-hidden="true" />}
                    {shownMonths.map((m) => {
                      const v = o.monthly.find((x) => x.month === m)?.value ?? 0
                      const past = m < nowMonth
                      return (
                        <td key={m} className={`${ROW_TD} tabular text-right ${past ? 'bg-good-soft' : ''} ${v ? 'text-ink' : 'text-ink-faint'}`}>
                          {o.outcome === 'lost' ? '—' : past ? '' : v ? fmtMoney(v) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <SaveBar drafts={drafts} count={draftCount} onDiscard={() => setDrafts({})} onSaved={() => setDrafts({})} />
    </DraftContext.Provider>
  )
}

/**
 * Q1–Q4 of the current fiscal year (Apr–Mar) as of today. Quarters already over are filled grey and
 * left blank; the current and coming quarters are blue, the current one outlined.
 */
function QuarterStrip({ values, format, title }: { values: number[]; format: (n: number) => string; title: string }) {
  const { nowQ } = currentFiscal()
  return (
    <div className="mt-1 grid grid-cols-4 gap-1" title={title}>
      {QUARTERS.map((q, i) => {
        const past = q < nowQ
        return (
          <div key={q} className={`flex min-w-0 items-baseline justify-center gap-1 rounded px-1.5 py-0.5 text-center ${past ? 'bg-border' : 'bg-brand-soft'} ${q === nowQ ? 'outline outline-1 outline-brand' : ''}`}>
            <span className={`text-[9.5px] font-bold uppercase tracking-[0.07em] ${past ? 'text-ink-faint' : 'text-brand'}`}>Q{q}</span>
            <span className="tabular truncate text-[11.5px] font-semibold text-ink">{past ? '' : format(values[i])}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Deals totalled by the fiscal quarter they're expected to start in. */
function StartQuarterStrip({ opps, what, measure, format }: { opps: OpportunityView[]; what: string; measure: (o: OpportunityView) => number; format: (n: number) => string }) {
  const { fy } = currentFiscal()
  const inQuarter = (o: OpportunityView, q: number) => o.estStartDate !== null && fiscalQuarter(o.estStartDate) === `Q${q} ${fy}`
  const outside = opps.filter((o) => !QUARTERS.some((q) => inQuarter(o, q)))
  const values = QUARTERS.map((q) => opps.filter((o) => inQuarter(o, q)).reduce((s, o) => s + measure(o), 0))
  const note = outside.length ? ` ${outside.length} ${what} deal${outside.length === 1 ? '' : 's'} start outside ${fy}.` : ''
  return <QuarterStrip values={values} format={format} title={`${what[0].toUpperCase()}${what.slice(1)} deals by expected start quarter, ${fy}.${note}`} />
}

// --- inline editors ---------------------------------------------------------------------

/** Unsaved edits per opportunity, shared by every cell editor on the page. */
const DraftContext = createContext<{ stage: (o: OpportunityView, edit: OpportunityEdit) => void }>({ stage: () => {} })

/** Edits are staged, not saved: they wait for the Save button so every save is logged with who made it. */
function useSaveOpportunity(o: OpportunityView) {
  const { stage } = useContext(DraftContext)
  return (edit: OpportunityEdit) => stage(o, edit)
}

function TypeSelect({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  const options = OPPORTUNITY_TYPES.includes(o.type) ? OPPORTUNITY_TYPES : [o.type, ...OPPORTUNITY_TYPES]
  // Icon only, to keep the column narrow; a transparent select over it opens the type list.
  return (
    <span className="group relative inline-flex h-6 w-7 items-center justify-center rounded border border-transparent text-ink-muted transition-colors hover:border-brand focus-within:border-brand">
      <OppTypeIcon type={o.type} size={15} />
      {/* Shown at once on hover (a native title waits ~1s); to the right so the table's scroll box can't clip it. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-30 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {o.type}
      </span>
      <select
        aria-label={`Type of ${o.name}: ${o.type}`}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={o.type}
        onChange={(e) => {
          const type = e.target.value
          save({ type })
        }}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  )
}

function StartSelect({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  // Every month of the current and next fiscal year, plus the current start when it falls outside them.
  const fyStart = `${Number(currentFiscal().fy.slice(2)) + 1999}-04-01`
  const months = Array.from({ length: 24 }, (_, k) => addMonths(fyStart, k).slice(0, 7))
  const current = o.estStartDate?.slice(0, 7) ?? ''
  const options = current && !months.includes(current) ? [current, ...months].sort() : months
  return (
    <select
      aria-label={`Expected start month of ${o.name}`}
      title={o.estStartDate ? `Starts ${o.estStartDate}${o.fieldProvenance.estStartDate === 'synthetic' ? ' (assumed — blank in the tracker)' : o.fieldProvenance.estStartDate === 'derived' ? ' (derived from monthly revenue)' : ''}` : 'No start date'}
      className={`${INLINE_FIELD} w-[74px]`}
      value={current}
      onChange={(e) => {
        const month = e.target.value
        save({ estStartDate: `${month}-01` })
      }}
    >
      {!current && <option value="">—</option>}
      {options.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  )
}

function StageSelect({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  const options = OPPORTUNITY_STAGES.includes(o.stage) ? OPPORTUNITY_STAGES : [o.stage, ...OPPORTUNITY_STAGES]
  return (
    <select
      aria-label={`Stage of ${o.name}`}
      title={o.stage}
      className={`${INLINE_FIELD} w-[138px] ${SOW_STAGES.has(o.stage) ? 'border-good-border! bg-good-soft! font-semibold text-good!' : ''}`}
      value={o.stage}
      onChange={(e) => {
        const stage = e.target.value
        save({ stage })
      }}
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}

function WinSelect({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  // Won and lost deals count as 100% and 0%; the confidence only applies while the deal is open.
  const locked = o.outcome !== 'open'
  const pct = Math.round((locked ? o.probability : (o.confWinning ?? 0)) * 100)
  return (
    <select
      aria-label={`Win probability of ${o.name}`}
      className={`${INLINE_FIELD} tabular`}
      value={pct}
      disabled={locked}
      title={locked ? `${o.outcome === 'won' ? 'Won' : 'Lost'} — counts as ${pct}%. Change the stage to reopen it.` : 'Confidence of winning'}
      onChange={(e) => {
        const next = Number(e.target.value)
        save({ confWinning: next / 100 })
      }}
    >
      {winOptions(pct).map((p) => (
        <option key={p} value={p}>
          {p}%
        </option>
      ))}
    </select>
  )
}

function ValueCell({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  const run = useMutation()
  return (
    <InlineText
      label={`Value of ${o.name}`}
      initial={String(o.value ?? 0)}
      placeholder="e.g. 420k"
      className="w-28 text-right"
      display={fmtMoney(o.value ?? 0)}
      onSave={(text) => {
        const value = parseMoney(text)
        if (value === undefined) return run(() => Promise.reject(new Error(`"${text}" isn't an amount. Try 420000, 420k or 1.2m.`)))
        if (value === (o.value ?? 0)) return // a blank value already shows as $0
        save({ value })
      }}
    />
  )
}

function MonthsCell({ o }: { o: OpportunityView }) {
  const save = useSaveOpportunity(o)
  const run = useMutation()
  return (
    <InlineText
      label={`Duration in months of ${o.name}`}
      initial={o.months === null ? '' : String(o.months)}
      placeholder="1–60"
      maxLength={2}
      className="w-12 text-right"
      display={o.months ?? <span className="text-ink-faint">—</span>}
      onSave={(text) => {
        const months = Number(text)
        if (!Number.isInteger(months) || months < 1 || months > 60) return run(() => Promise.reject(new Error('Months must be a whole number from 1 to 60.')))
        save({ months })
      }}
    />
  )
}

type EmployeeLite = Pick<EmployeeCapacity, 'code' | 'title' | 'grade'>
/** "F16605 · Consultant · G8" — how an employee from the master shows in pickers and tooltips. */
const employeeLabel = (e: EmployeeLite) => `${e.code} · ${e.title} · G${e.grade}`

/** The lead's employee code, with their title and grade on hover; older free-text leads show as typed. */
function LeadName({ lead, employees }: { lead: string | null; employees: Map<string, EmployeeLite> }) {
  if (!lead) return <span className="text-ink-faint">—</span>
  const e = employees.get(lead)
  return (
    <span className="tabular" title={e ? employeeLabel(e) : 'Not in the employee master'}>
      {lead}
    </span>
  )
}

/** Shows a value; click to edit it in place. Enter or leaving the field saves, Escape cancels. */
function InlineText(props: { label: string; initial: string; display: ReactNode; placeholder?: string; maxLength?: number; className?: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  if (!editing)
    return (
      <button
        type="button"
        title="Click to edit"
        className="rounded px-1 py-0.5 -mx-1 underline decoration-border-strong decoration-dotted underline-offset-4 hover:bg-surface-sunken hover:decoration-brand"
        onClick={() => {
          cancelled.current = false
          setDraft(props.initial)
          setEditing(true)
        }}
      >
        {props.display}
      </button>
    )
  return (
    <input
      autoFocus
      aria-label={props.label}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      className={`${INLINE_FIELD} ${props.className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={() => {
        setEditing(false)
        if (!cancelled.current && draft.trim() !== props.initial) props.onSave(draft.trim())
      }}
    />
  )
}

// --- saving --------------------------------------------------------------------------------

/**
 * Floating bar, shown only while there are unsaved changes: count, Discard and Save. Saves are
 * logged under the IP address they came from. Saved changes are listed under View log (top bar).
 */
function SaveBar({ drafts, count, onDiscard, onSaved }: { drafts: Record<string, OpportunityEdit>; count: number; onDiscard: () => void; onSaved: () => void }) {
  const run = useMutation()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const out = await run(() => api.post<{ changes: number }>('/api/opportunities/edits', { edits: drafts }), {
      title: 'Changes saved',
      body: `${count} change${count === 1 ? '' : 's'} saved to the database.`,
    })
    setSaving(false)
    if (out) onSaved()
  }

  if (count === 0 && !saving) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <span className="text-xs font-semibold text-warn">
        {count} unsaved change{count === 1 ? '' : 's'} <span className="font-normal text-ink-faint">· KPI cards update on save</span>
      </span>
      <Button size="sm" variant="secondary" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button size="sm" variant="primary" onClick={save} disabled={saving} icon={<UI_ICON.check size={13} strokeWidth={2.4} aria-hidden="true" />} title="Save these changes to the database">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

/** Collapses or expands the older month columns as a group. */
function MonthGroupToggle({ open, months, onToggle }: { open: boolean; months: string[]; onToggle: () => void }) {
  const range = `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`
  const Icon = open ? UI_ICON.chevronLeft : UI_ICON.chevronRight
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? `Hide ${range}` : `Show ${range}`}
      title={open ? `Hide ${range}` : `Show ${range} (${months.length} earlier months)`}
      className="inline-flex h-5 items-center gap-0.5 rounded border border-border-strong bg-surface px-1 text-[10px] font-bold text-ink-muted transition-colors hover:border-brand hover:text-brand"
    >
      {open ? '−' : '+'}
      {months.length}
      <Icon size={11} strokeWidth={2.4} aria-hidden="true" />
    </button>
  )
}
// --- adding an opportunity ---------------------------------------------------------------

/** The Account dropdown's last option, which swaps it for a text box. */
const NEW_CLIENT = '__new_client__'

const NEW_OPP_DEFAULTS = (startMonth: string) => ({
  account: '',
  newClient: false,
  name: '',
  type: OPPORTUNITY_TYPES[0],
  stage: OPEN_STAGES[0],
  start: startMonth,
  months: '6',
  value: '',
  win: Math.round((STAGE_WIN_DEFAULT[OPEN_STAGES[0]] ?? 0.5) * 100),
  winTouched: false,
  lead: '',
  status: '',
})

/** Collapsible form for a new opportunity. Saved straight to the database and shown to everyone. */
function AddOpportunity({ clients, employees }: { clients: string[]; employees: EmployeeLite[] }) {
  const run = useMutation()
  const { fy } = currentFiscal()
  // The start month can be any month of this fiscal year or the next.
  const startMonths = [...fiscalMonths(fy), ...fiscalMonths(`FY${Number(fy.slice(2)) + 1}`)]
  const nextMonth = addMonths(`${new Date().toISOString().slice(0, 7)}-01`, 1).slice(0, 7)
  const [f, setF] = useState(() => NEW_OPP_DEFAULTS(nextMonth))
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }))

  const value = parseMoney(f.value)
  const months = Number(f.months)
  const problems = [
    !f.account.trim() && 'account',
    !f.name.trim() && 'opportunity name',
    !f.lead.trim() && 'lead',
    (!f.value.trim() || value === undefined) && 'value (e.g. 420000, 420k or 1.2m)',
    !f.status.trim() && 'description',
    !(Number.isInteger(months) && months >= 1 && months <= 60) && 'months (1–60)',
  ].filter(Boolean) as string[]

  const add = async () => {
    setSaving(true)
    const created = await run(
      () =>
        api.post<{ id: string; name: string }>('/api/opportunities', {
          account: f.account,
          name: f.name,
          type: f.type,
          stage: f.stage,
          estStartDate: `${f.start}-01`,
          months,
          value: value ?? 0,
          confWinning: f.win / 100,
          lead: f.lead.trim(),
          status: f.status,
        }),
      { title: 'Opportunity added', body: `${f.name.trim()} saved to the database.` },
    )
    setSaving(false)
    // Written to the database: clear the form and fold the section away.
    if (created) {
      setF(NEW_OPP_DEFAULTS(nextMonth))
      setOpen(false)
    }
  }

  const label = 'mb-0.5 block text-[10.5px] font-semibold text-ink-muted'
  const field = `${INLINE_FIELD} h-[26px] w-full`
  return (
    <Card className="mt-[30px] py-0.5! px-3!">
      <Collapsible open={open} onOpenChange={setOpen} label="Add opportunity" icon={<UI_ICON.plus size={13} strokeWidth={2.4} className="text-ink-faint" aria-hidden="true" />}>
        <form
          className="grid grid-cols-2 gap-x-3 gap-y-1.5 pb-1.5 md:grid-cols-4 xl:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (!problems.length && !saving) add()
          }}
        >
          <label className="col-span-1">
            <span className={label}>Account *</span>
            {/* Clients come from the client dimension. "+ New client…" switches to a text box; that name is added to it on save. */}
            {f.newClient ? (
              <span className="relative block">
                <input autoFocus className={`${field} pr-6`} value={f.account} maxLength={80} onChange={(e) => set({ account: e.target.value })} placeholder="New client name" />
                <button
                  type="button"
                  onClick={() => set({ newClient: false, account: '' })}
                  title="Back to the client list"
                  aria-label="Back to the client list"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-ink-faint hover:text-ink"
                >
                  ×
                </button>
              </span>
            ) : (
              <select className={field} value={f.account} onChange={(e) => (e.target.value === NEW_CLIENT ? set({ newClient: true, account: '' }) : set({ account: e.target.value }))}>
                <option value="">Select a client</option>
                {clients.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                <option value={NEW_CLIENT}>+ New client…</option>
              </select>
            )}
          </label>
          <label className="col-span-1 md:col-span-2">
            <span className={label}>Opportunity name *</span>
            <input className={field} value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Demand sensing rollout" />
          </label>
          <label>
            <span className={label}>Type *</span>
            <select className={field} value={f.type} onChange={(e) => set({ type: e.target.value })}>
              {OPPORTUNITY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Stage *</span>
            <select
              className={field}
              value={f.stage}
              // Win % follows the stage's usual odds until someone sets it by hand.
              onChange={(e) => set({ stage: e.target.value, ...(f.winTouched ? {} : { win: Math.round((STAGE_WIN_DEFAULT[e.target.value] ?? 0.5) * 100) }) })}
            >
              {OPEN_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Lead *</span>
            <select className={`${field} tabular`} value={f.lead} onChange={(e) => set({ lead: e.target.value })}>
              <option value="">Select from employee master</option>
              {employees.map((e) => (
                <option key={e.code} value={e.code}>
                  {employeeLabel(e)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Value *</span>
            <input className={`${field} tabular text-right`} value={f.value} onChange={(e) => set({ value: e.target.value })} placeholder="e.g. 420k" />
          </label>
          <label>
            <span className={label}>Start *</span>
            <select className={`${field} tabular`} value={f.start} onChange={(e) => set({ start: e.target.value })}>
              {startMonths.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Win % *</span>
            <select className={`${field} tabular`} value={f.win} onChange={(e) => set({ win: Number(e.target.value), winTouched: true })}>
              {winOptions(f.win).map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Months *</span>
            <input className={`${field} tabular text-right`} inputMode="numeric" value={f.months} maxLength={2} onChange={(e) => set({ months: e.target.value })} />
          </label>
          <label className="col-span-2">
            <span className={label}>Description *</span>
            <input className={field} value={f.status} maxLength={300} onChange={(e) => set({ status: e.target.value })} placeholder="Shown when hovering the opportunity name" />
          </label>
          <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-4 xl:col-span-6">
            {problems.length > 0 && <span className="mr-auto text-[11px] text-warn">All fields are required — still needed: {problems.join(', ')}</span>}
            <Button type="button" size="sm" variant="secondary" onClick={() => setF(NEW_OPP_DEFAULTS(nextMonth))} disabled={saving}>
              Clear
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={problems.length > 0 || saving} icon={<UI_ICON.plus size={13} strokeWidth={2.4} aria-hidden="true" />}>
              {saving ? 'Adding…' : 'Add opportunity'}
            </Button>
          </div>
        </form>
      </Collapsible>
    </Card>
  )
}

/**
 * First row of the table: totals over the opportunities currently shown (after filters, with any
 * unsaved edits). Lost deals add nothing to the revenue columns, as their own rows show "—".
 */
function TotalRow({ rows, fy, nowQ, nowMonth, months, hasGroup }: { rows: OpportunityView[]; fy: string; nowQ: number; nowMonth: string; months: string[]; hasGroup: boolean }) {
  const live = rows.filter((o) => o.outcome !== 'lost')
  const quarters = QUARTERS.map((_, i) => live.reduce((s, o) => s + quarterRevenue(o, fy)[i], 0))
  // Solid green with white text, pinned cells included, so the total reads as one band.
  const td = `${ROW_TD} tabular text-right font-bold text-white! text-[14px]!`
  const pinned = 'bg-good'
  return (
    <tr className="border-t border-good bg-good">
      <td className={`${ROW_TD} font-bold text-white! text-[14px]! ${PIN_ID} ${pinned}`}>Total</td>
      <td className={`${ROW_TD} font-bold text-white! text-[14px]! ${PIN_NAME} ${pinned}`}>
        {rows.length} opportunit{rows.length === 1 ? 'y' : 'ies'}
      </td>
      <td className={ROW_TD} />
      <td className={td}>{fmtMoney(rows.reduce((s, o) => s + (o.value ?? 0), 0))}</td>
      {/* Start, Win, Mths, Stage, Type don't add up. */}
      <td className={ROW_TD} colSpan={5} />
      {quarters.map((v, i) => (
        <td key={i} className={td}>
          {i + 1 < nowQ ? '' : fmtMoney(v)}
        </td>
      ))}
      <td className={td}>{fmtMoney(quarters.reduce((a, b) => a + b, 0))}</td>
      <td className={ROW_TD} />
      {hasGroup && <td className={ROW_TD} />}
      {months.map((m) => {
        const past = m < nowMonth
        const v = live.reduce((s, o) => s + (o.monthly.find((x) => x.month === m)?.value ?? 0), 0)
        return (
          <td key={m} className={td}>
            {past ? '' : fmtMoney(v)}
          </td>
        )
      })}
    </tr>
  )
}
