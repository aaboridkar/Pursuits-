// Builds the computed model for one scope from the dataset plus what users
// have changed in the app. Cached per (scope, runtime version).

import { AS_OF, GRADES, SKILL_CATALOG, STALE_SKILL_DAYS, gradeTitle } from '../../shared/catalog'
import { addMonths, diffDays, monthEnd, monthKey, monthStart, monthsBetween, overlapDays, toDay } from '../../shared/dates'
import type {
  Alert,
  AllocationRow,
  Assignment,
  Candidate,
  CoverageStatus,
  Employee,
  Employee360,
  EmployeeCapacity,
  EmployeeSkill,
  GradeRow,
  Horizon,
  Meta,
  MonthSupplyDemand,
  Opportunity,
  OpportunityView,
  Overview,
  PersonAtRisk,
  Requirement,
  RequirementView,
  RiskLevel,
  Scope,
} from '../../shared/types'
import type { Dataset } from '../data/load'
import type { RuntimeState } from '../store'
import { buildTimeline, capacityAt, dayAt, monthBreakdown, projectHistory, segmentsOf, statusOf, type Timeline } from './capacity'
import { scoreCandidate, type MatchContext } from './matching'

export const HORIZON_MONTHS: Record<Horizon, number> = { now: 1, '1m': 1, '3m': 3, '6m': 6 }
export const horizonDate = (h: Horizon) => (h === 'now' ? AS_OF : addMonths(AS_OF, HORIZON_MONTHS[h]))

const round1 = (n: number) => Math.round(n * 10) / 10
const pctOf = (n: number) => `${Math.round(n * 100)}%`
const fmtFte = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} FTE`

export class Model {
  readonly asOf = AS_OF
  readonly employees: Employee[]
  readonly opportunities: Opportunity[]
  readonly requirements: Requirement[]
  readonly assignments: Assignment[]
  readonly skills: EmployeeSkill[]
  readonly timelines = new Map<string, Timeline>()
  readonly capacity = new Map<string, EmployeeCapacity>()
  readonly skillsByEmp = new Map<string, EmployeeSkill[]>()
  readonly months: string[]
  private readonly ctx: MatchContext
  private candidateCache = new Map<string, Candidate[]>()
  private reqViews?: RequirementView[]
  private riskCache?: PersonAtRisk[]

  constructor(
    readonly data: Dataset,
    readonly runtime: RuntimeState,
    readonly scope: Scope,
  ) {
    const inScope = <T extends { provenance: string }>(x: T) => scope === 'all' || x.provenance !== 'synthetic'
    this.employees = data.employees.filter(inScope)
    const codes = new Set(this.employees.map((e) => e.code))

    // Opportunities: synthetic ones drop out of 'source' scope; gap-fill fields on real ones stay.
    this.opportunities = data.opportunities.filter(inScope)
    const oppIds = new Set(this.opportunities.map((o) => o.id))
    this.requirements = [...data.requirements, ...runtime.requirementsAdded]
      .filter((r) => !runtime.requirementsDeleted.includes(r.id))
      .map((r) => ({ ...r, ...runtime.requirementEdits[r.id] }))
      .filter((r) => oppIds.has(r.opportunityId))
    const reqIds = new Set(this.requirements.map((r) => r.id))
    this.assignments = runtime.assignments.filter((a) => reqIds.has(a.requirementId) && codes.has(a.employeeCode))

    // Skills, with in-app edits and reviews applied.
    const skills: EmployeeSkill[] = []
    for (const s of data.skills) {
      const edit = runtime.skillEdits[`${s.employeeCode}|${s.skill}`]
      if (edit === 0) continue
      skills.push({ ...s, proficiency: edit ?? s.proficiency, provenance: edit ? 'app' : s.provenance, lastUpdated: runtime.skillReviews[s.employeeCode] ?? s.lastUpdated })
    }
    for (const [key, level] of Object.entries(runtime.skillEdits)) {
      const [code, skill] = key.split('|')
      if (level > 0 && !skills.some((s) => s.employeeCode === code && s.skill === skill)) {
        const cat = SKILL_CATALOG.find((c) => c.skill === skill)
        skills.push({ employeeCode: code, skill, category: cat?.category ?? 'Supply Chain', proficiency: level, lastUpdated: runtime.skillReviews[code] ?? AS_OF, provenance: 'app', basis: 'Added in app' })
      }
    }
    this.skills = skills.filter((s) => codes.has(s.employeeCode) || data.skillOnlyEmployees.includes(s.employeeCode))
    for (const s of this.skills) this.skillsByEmp.set(s.employeeCode, [...(this.skillsByEmp.get(s.employeeCode) ?? []), s])

    // Confirmed deployments become planned billable allocations.
    const reqById = new Map(this.requirements.map((r) => [r.id, r]))
    const oppById = new Map(this.opportunities.map((o) => [o.id, o]))
    const planned: AllocationRow[] = this.assignments
      .filter((a) => a.status === 'confirmed')
      .map((a) => {
        const r = reqById.get(a.requirementId)!
        const o = oppById.get(r.opportunityId)!
        return {
          id: `P-${a.id}`, employeeCode: a.employeeCode, projectCode: r.id, projectName: `${o.name} · ${r.role}`, client: o.account,
          department: '', vertical: '', start: r.start, end: r.end, pct: Math.round(a.fte * 100), projectType: 'Billable',
          reportAllocation: 'Planned (confirmed in app)', category: null, sowStatus: o.stage, engagementType: o.type,
          kind: 'billable', provenance: 'app', assignmentId: a.id,
        }
      })

    const rows = [...data.allocations.filter((r) => codes.has(r.employeeCode)), ...planned]
    const day0 = Math.min(...rows.map((r) => toDay(r.start)))
    const days = toDay(addMonths(AS_OF, 24)) - day0
    for (const e of this.employees) {
      const t = buildTimeline(e, rows.filter((r) => r.employeeCode === e.code), day0, days)
      this.timelines.set(e.code, t)
      this.capacity.set(e.code, capacityAt(t, AS_OF, this.skillsByEmp.get(e.code) ?? []))
    }
    this.months = monthsBetween(monthKey(AS_OF), 6)
    this.ctx = { asOf: AS_OF, timelines: this.timelines, capacity: this.capacity, skillsByEmp: this.skillsByEmp, day0, days }
  }

  opportunity(id: string) {
    return this.opportunities.find((o) => o.id === id)
  }

  // --- matching -------------------------------------------------------------------

  candidates(reqId: string): Candidate[] {
    const cached = this.candidateCache.get(reqId)
    if (cached) return cached
    const req = this.requirements.find((r) => r.id === reqId)
    if (!req) return []
    const opp = this.opportunity(req.opportunityId)!
    const list = this.employees
      .map((e) => {
        const c = scoreCandidate(this.ctx, e.code, req, opp.account)
        const a = this.assignments.find((x) => x.requirementId === reqId && x.employeeCode === e.code)
        return a ? { ...c, assignment: a } : c
      })
      .sort((a, b) => b.score - a.score || (b.benchDays ?? -1) - (a.benchDays ?? -1))
    this.candidateCache.set(reqId, list)
    return list
  }

  // --- demand ---------------------------------------------------------------------

  requirementViews(): RequirementView[] {
    if (this.reqViews) return this.reqViews
    const capByCode = this.capacity
    this.reqViews = this.requirements.map((r) => {
      const o = this.opportunity(r.opportunityId)!
      const assignments = this.assignments
        .filter((a) => a.requirementId === r.id)
        .map((a) => ({ ...a, grade: capByCode.get(a.employeeCode)?.grade ?? 0, title: capByCode.get(a.employeeCode)?.title ?? '' }))
      const confirmedFte = assignments.filter((a) => a.status === 'confirmed').reduce((s, a) => s + a.fte, 0)
      const proposedFte = assignments.filter((a) => a.status === 'proposed').reduce((s, a) => s + a.fte, 0)
      const unmetFte = Math.max(0, round1(r.fte - confirmedFte))
      let coverage: CoverageStatus = 'unfilled'
      if (o.outcome === 'lost' || r.end < AS_OF) coverage = 'closed'
      else if (unmetFte === 0) coverage = 'filled'
      else if (confirmedFte > 0) coverage = 'partial'
      else if (proposedFte > 0) coverage = 'proposed'
      const cands = coverage === 'closed' ? [] : this.candidates(r.id).filter((c) => !c.assignment)
      // Strong = qualified (skills), broadly the right level, and free for at least half the ask.
      const strong = cands.filter((c) => c.score >= 65 && c.skillFit >= 60 && c.gradeFit >= 60 && c.availability >= 50)
      return {
        ...r,
        opportunityName: o.name,
        account: o.account,
        outcome: o.outcome,
        probability: o.probability,
        confirmedFte,
        proposedFte,
        unmetFte,
        coverage,
        assignments,
        strongCandidates: strong.length,
        bestCandidate: cands[0] ? { code: cands[0].code, score: cands[0].score } : null,
        daysToStart: diffDays(r.start, AS_OF),
      }
    })
    return this.reqViews
  }

  opportunityViews(): OpportunityView[] {
    const reqs = this.requirementViews()
    return this.opportunities.map((o) => {
      const rs = reqs.filter((r) => r.opportunityId === o.id)
      const totalFte = rs.reduce((s, r) => s + r.fte, 0)
      const confirmedFte = rs.reduce((s, r) => s + r.confirmedFte, 0)
      const unmetFte = rs.filter((r) => r.coverage !== 'closed').reduce((s, r) => s + r.unmetFte, 0)
      let coverageRisk: OpportunityView['coverageRisk'] = 'n/a'
      if (o.outcome !== 'lost' && rs.length) {
        const uncoverable = rs.filter((r) => r.unmetFte > 0 && r.coverage !== 'closed' && r.strongCandidates === 0)
        coverageRisk = unmetFte === 0 ? 'covered' : uncoverable.length ? 'gap' : 'at-risk'
      }
      return { ...o, requirements: rs, totalFte: round1(totalFte), weightedFte: round1(totalFte * o.probability), confirmedFte: round1(confirmedFte), unmetFte: round1(unmetFte), coverageRisk }
    })
  }

  /** Weighted unmet demand per month, optionally for one grade. */
  private demandIn(month: string, grade?: number) {
    let weighted = 0
    let unweighted = 0
    let confirmed = 0
    const ms = monthStart(month)
    const me = monthEnd(month)
    const n = overlapDays(ms, me, ms, me)
    for (const r of this.requirementViews()) {
      if (r.outcome === 'lost' || (grade !== undefined && r.grade !== grade)) continue
      const f = overlapDays(r.start, r.end, ms, me) / n
      if (!f) continue
      weighted += r.unmetFte * r.probability * f
      unweighted += r.unmetFte * f
      confirmed += r.confirmedFte * f
    }
    return { weighted, unweighted, confirmed }
  }

  private supplyIn(month: string, grade?: number) {
    let s = 0
    for (const [code, t] of this.timelines) {
      if (grade !== undefined && this.capacity.get(code)!.grade !== grade) continue
      s += monthBreakdown(t, month).available / 100
    }
    return s
  }

  supplyDemand(months = this.months): MonthSupplyDemand[] {
    return months.map((m) => {
      const d = this.demandIn(m)
      const supply = this.supplyIn(m)
      return { month: m, supplyFte: round1(supply), demandFte: round1(d.weighted), demandFteUnweighted: round1(d.unweighted), confirmedFte: round1(d.confirmed), gapFte: round1(supply - d.weighted) }
    })
  }

  // --- capacity at a horizon -----------------------------------------------------------

  capacityRows(h: Horizon): (EmployeeCapacity & { horizonStatus: EmployeeCapacity['status']; horizonAvailable: number; horizonAllocation: number; horizonProject: string | null })[] {
    const at = horizonDate(h)
    return [...this.capacity.values()].map((c) => {
      const t = this.timelines.get(c.code)!
      const b = dayAt(t, at)
      const allocated = b.billable + b.internal
      const proj = t.rows.filter((r) => (r.kind === 'billable' || r.kind === 'internal') && r.start <= at && r.end >= at).sort((x, y) => y.pct - x.pct)[0]
      return { ...c, horizonStatus: statusOf(b), horizonAvailable: Math.max(0, 100 - allocated - b.leave), horizonAllocation: allocated, horizonProject: proj?.projectName ?? null }
    })
  }

  // --- risk ----------------------------------------------------------------------------

  risk(): PersonAtRisk[] {
    if (this.riskCache) return this.riskCache
    const live = this.requirementViews().filter((r) => r.coverage !== 'closed' && r.coverage !== 'filled' && r.outcome !== 'lost')
    const out: PersonAtRisk[] = []
    for (const c of this.capacity.values()) {
      const soon = c.rollOffDate ? diffDays(c.rollOffDate, AS_OF) : null
      const exposed = c.status !== 'fully-allocated' || (soon !== null && soon <= 90)
      if (!exposed) continue

      const reasons: string[] = []
      let score = 0
      if (c.status === 'bench') {
        const d = c.benchDays ?? 0
        score += d > 90 ? 65 : d > 60 ? 55 : d > 30 ? 35 : 25
        reasons.push(`On bench ${d} days${c.benchHistoryLimited ? '+' : ''}`)
      } else if (c.status === 'partially-available') {
        score += 15
        reasons.push(`${c.available}% unallocated`)
      } else if (c.status === 'on-leave') {
        score += 15
        reasons.push(`Returns from leave ${c.availableFrom ?? ''} with no deployment`)
      }
      if (c.status === 'fully-allocated' && soon !== null) {
        score += soon <= 30 ? 25 : soon <= 60 ? 15 : 8
        reasons.push(`Rolls off in ${soon} days (${c.rollOffDate})`)
      }

      // Best pipeline match, weighted towards opportunities likely to land.
      let best: { r: RequirementView; cand: Candidate; eff: number } | null = null
      let matchCount = 0
      for (const r of live) {
        const cand = this.candidates(r.id).find((x) => x.code === c.code)!
        if (cand.score >= 60) matchCount++
        const eff = cand.score * (0.5 + 0.5 * r.probability)
        if (!best || eff > best.eff) best = { r, cand, eff }
      }
      const confirmedNext = this.assignments.find((a) => a.employeeCode === c.code && a.status === 'confirmed')
      if (confirmedNext) {
        const r = this.requirementViews().find((x) => x.id === confirmedNext.requirementId)!
        score -= 40
        reasons.push(`Confirmed for ${r.opportunityName} from ${r.start}`)
      } else if (!best || best.cand.score < 50) {
        score += 30
        reasons.push('No strong pipeline match')
      } else if (best.cand.score < 65) {
        score += 15
        reasons.push(`Weak pipeline match (${best.cand.score})`)
      } else {
        // A good match still leaves someone on the bench if better-placed people take the seats.
        const rank = this.candidates(best.r.id).filter((x) => !x.assignment).findIndex((x) => x.code === c.code) + 1
        const seats = Math.max(1, Math.ceil(best.r.unmetFte))
        if (rank > seats * 2) {
          score += 15
          reasons.push(`Ranked #${rank} for ${seats} seat${seats === 1 ? '' : 's'} on best match`)
        }
      }
      if (c.skillsStale) {
        score += 10
        reasons.push(c.skillsLastUpdated ? `Skills not reviewed for ${diffDays(AS_OF, c.skillsLastUpdated)} days` : 'Skills never reviewed')
      }
      score = Math.max(0, Math.min(100, score))
      const risk: RiskLevel = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low'

      let probableNext = 'No suitable requirement in the pipeline — consider cross-practice deployment or reskilling'
      if (confirmedNext) {
        const r = this.requirementViews().find((x) => x.id === confirmedNext.requirementId)!
        probableNext = `${r.opportunityName} · ${r.role} — confirmed from ${r.start}`
      } else if (best && best.cand.score >= 50) {
        probableNext = `${best.r.opportunityName} · ${best.r.role} from ${best.r.start} (${pctOf(best.r.probability)} win)`
      }

      out.push({
        code: c.code, title: c.title, grade: c.grade, provenance: c.provenance, status: c.status, benchDays: c.benchDays, rollOffDate: c.rollOffDate,
        allocation: c.allocation, lastProjectEnd: c.lastProjectEnd, lastProject: c.lastProject,
        pipelineMatch: best ? { requirementId: best.r.id, opportunityId: best.r.opportunityId, opportunityName: best.r.opportunityName, role: best.r.role, score: best.cand.score, probability: best.r.probability, start: best.r.start } : null,
        matchCount, riskScore: score, risk, reasons, probableNext,
      })
    }
    this.riskCache = out.sort((a, b) => b.riskScore - a.riskScore)
    return this.riskCache
  }

  // --- overview ---------------------------------------------------------------------------

  overview(h: Horizon): Overview {
    const caps = [...this.capacity.values()]
    const n = HORIZON_MONTHS[h]
    const window = this.months.slice(0, Math.max(1, n))
    const sd = this.supplyDemand()
    const inWindow = sd.filter((m) => window.includes(m.month))
    const avg = (f: (m: MonthSupplyDemand) => number) => round1(inWindow.reduce((s, m) => s + f(m), 0) / inWindow.length)

    const byGrade: GradeRow[] = GRADES.map(({ grade, title }) => {
      const gs = caps.filter((c) => c.grade === grade)
      const supply = window.reduce((s, m) => s + this.supplyIn(m, grade), 0) / window.length
      const demand = window.reduce((s, m) => s + this.demandIn(m, grade).weighted, 0) / window.length
      return {
        grade, title, headcount: gs.length,
        fully: gs.filter((c) => c.status === 'fully-allocated').length,
        partial: gs.filter((c) => c.status === 'partially-available').length,
        bench: gs.filter((c) => c.status === 'bench').length,
        leave: gs.filter((c) => c.status === 'on-leave').length,
        availableFte: round1(supply), demandFte: round1(demand), gapFte: round1(supply - demand),
      }
    }).filter((g) => g.headcount > 0 || g.demandFte > 0)

    const opps = this.opportunityViews()
    const open = opps.filter((o) => o.outcome === 'open')
    return {
      asOf: AS_OF,
      horizon: h,
      kpis: {
        headcount: caps.length,
        fully: caps.filter((c) => c.status === 'fully-allocated').length,
        partial: caps.filter((c) => c.status === 'partially-available').length,
        bench: caps.filter((c) => c.status === 'bench').length,
        onLeave: caps.filter((c) => c.status === 'on-leave').length,
        bench30: caps.filter((c) => (c.benchDays ?? 0) > 30).length,
        bench60: caps.filter((c) => (c.benchDays ?? 0) > 60).length,
        openOpportunities: open.length,
        pipelineValue: open.reduce((s, o) => s + (o.value ?? 0), 0),
        weightedPipelineValue: Math.round(open.reduce((s, o) => s + (o.value ?? 0) * o.probability, 0)),
        expectedDemandFte: avg((m) => m.demandFte),
        availableFte: avg((m) => m.supplyFte),
        gapFte: avg((m) => m.gapFte),
        unqualifiedFte: round1(this.requirementViews().filter((r) => r.unmetFte > 0 && r.coverage !== 'closed' && r.outcome !== 'lost' && r.strongCandidates === 0).reduce((s, r) => s + r.unmetFte * r.probability, 0)),
        rollingOff: caps.filter((c) => c.status === 'fully-allocated' && c.rollOffDate && diffDays(c.rollOffDate, AS_OF) <= 30).length,
      },
      byGrade,
      supplyDemand: sd,
      alerts: this.alerts(),
    }
  }

  alerts(): Alert[] {
    const out: Alert[] = []
    const caps = [...this.capacity.values()]
    for (const c of caps.filter((x) => (x.benchDays ?? 0) > 60).sort((a, b) => (b.benchDays ?? 0) - (a.benchDays ?? 0))) {
      const r = this.risk().find((x) => x.code === c.code)
      out.push({
        id: `bench-${c.code}`, kind: 'bench-60', severity: 'critical',
        title: `${c.code} on bench ${c.benchDays} days`,
        detail: `${gradeTitle(c.grade)} · since ${c.benchSince} · ${r?.pipelineMatch && r.pipelineMatch.score >= 50 ? `best match ${r.pipelineMatch.opportunityName} (${r.pipelineMatch.score})` : 'no strong pipeline match'}`,
        link: r?.pipelineMatch && r.pipelineMatch.score >= 50 ? `/workbench?req=${r.pipelineMatch.requirementId}` : `/employees/${c.code}`,
        linkLabel: r?.pipelineMatch && r.pipelineMatch.score >= 50 ? 'Deploy' : 'Open profile',
      })
    }
    const urgent = this.requirementViews()
      .filter((r) => r.unmetFte > 0 && r.coverage !== 'closed' && r.daysToStart <= 45 && r.probability >= 0.5)
      .sort((a, b) => a.daysToStart - b.daysToStart)
    // One alert per opportunity, so a five-role engagement doesn't flood the list.
    const byOpp = new Map<string, RequirementView[]>()
    for (const r of urgent) byOpp.set(r.opportunityId, [...(byOpp.get(r.opportunityId) ?? []), r])
    for (const rs of byOpp.values()) {
      const first = rs[0]
      const fte = round1(rs.reduce((s, r) => s + r.unmetFte, 0))
      const gaps = rs.filter((r) => r.strongCandidates === 0)
      out.push({
        id: `opp-${first.opportunityId}`, kind: 'unmet-requirement', severity: first.daysToStart <= 14 ? 'critical' : 'high',
        title: `${fmtFte(fte)} unfilled · ${first.opportunityName}`,
        detail: `${first.account} · ${rs.length} role${rs.length === 1 ? '' : 's'} · ${first.daysToStart < 0 ? `started ${-first.daysToStart} days ago` : `starts in ${first.daysToStart} days`} · ${pctOf(first.probability)} win${gaps.length ? ` · no qualified candidate for ${gaps.map((r) => r.role).join(', ')}` : ''}`,
        link: rs.length === 1 ? `/workbench?req=${first.id}` : `/opportunities/${first.opportunityId}#requirements`,
        linkLabel: rs.length === 1 ? 'Find candidates' : 'Staff roles',
      })
    }
    const rolling = caps.filter((c) => c.status === 'fully-allocated' && c.rollOffDate && diffDays(c.rollOffDate, AS_OF) <= 30 && !this.assignments.some((a) => a.employeeCode === c.code && a.status === 'confirmed'))
    if (rolling.length) {
      out.push({ id: 'roll-off', kind: 'roll-off', severity: 'high', title: `${rolling.length} employee${rolling.length === 1 ? '' : 's'} roll off within 30 days with no next deployment`, detail: rolling.map((c) => `${c.code} (${c.rollOffDate})`).join(' · '), link: '/capacity?horizon=1m', linkLabel: 'View capacity' })
    }
    const stale = caps.filter((c) => c.skillsStale)
    if (stale.length) {
      out.push({ id: 'stale-skills', kind: 'stale-skills', severity: 'watch', title: `${stale.length} skill profiles not updated in ${STALE_SKILL_DAYS}+ days`, detail: `Matching relies on these profiles · oldest ${stale.map((c) => c.skillsLastUpdated ?? '').filter(Boolean).sort()[0] ?? 'never reviewed'}`, link: '/skills?stale=1', linkLabel: 'Review skills' })
    }
    const dq = this.data.quality.filter((q) => q.severity === 'high')
    if (dq.length) out.push({ id: 'data-quality', kind: 'data-quality', severity: 'watch', title: `${dq.length} data-quality issues in source files`, detail: dq.map((q) => q.title).join(' · '), link: '/data', linkLabel: 'View data sources' })
    return out
  }

  // --- employee 360 -------------------------------------------------------------------------

  employee360(code: string): Employee360 | null {
    const t = this.timelines.get(code)
    const cap = this.capacity.get(code)
    if (!t || !cap) return null
    const e = t.employee
    const first = t.rows.map((r) => r.start).sort()[0]
    const months = monthsBetween(first ? monthKey(first) : monthKey(AS_OF), Math.max(1, Math.round(diffDays(addMonths(AS_OF, 6), first ?? AS_OF) / 30.44)))
    const reqs = this.requirementViews().filter((r) => r.coverage !== 'closed' && r.outcome !== 'lost')
    const matches = reqs
      .map((r) => ({ ...this.candidates(r.id).find((c) => c.code === code)!, requirement: r }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
    const assignments = this.assignments.filter((a) => a.employeeCode === code).map((a) => ({ ...a, requirement: this.requirementViews().find((r) => r.id === a.requirementId)! }))
    return {
      capacity: cap,
      employee: { ...e, tenureYears: e.joiningDate ? round1(diffDays(AS_OF, e.joiningDate) / 365.25) : 0 },
      skills: (this.skillsByEmp.get(code) ?? []).sort((a, b) => a.category.localeCompare(b.category) || (b.proficiency ?? 0) - (a.proficiency ?? 0)),
      projects: projectHistory(t, AS_OF),
      segments: segmentsOf(t),
      months: months.map((m) => monthBreakdown(t, m)),
      matches,
      assignments,
      risk: this.risk().find((r) => r.code === code) ?? null,
    }
  }

  // --- skills matrix ----------------------------------------------------------------------------

  skillsMatrix() {
    const known = new Set(this.employees.map((e) => e.code))
    const people = [...this.skillsByEmp.keys()].map((code) => {
      const cap = this.capacity.get(code)
      const list = this.skillsByEmp.get(code)!
      const reviewed = list.map((s) => s.lastUpdated).filter((d): d is string => !!d).sort().at(-1) ?? null
      return {
        code,
        title: cap?.title ?? 'Not in allocation report',
        grade: cap?.grade ?? null,
        status: cap?.status ?? null,
        provenance: cap?.provenance ?? 'source',
        inAllocation: known.has(code),
        lastUpdated: reviewed,
        daysSinceUpdate: reviewed ? diffDays(AS_OF, reviewed) : null,
        stale: !reviewed || diffDays(AS_OF, reviewed) > STALE_SKILL_DAYS,
        skills: list,
      }
    })
    // Demand per skill from live requirements vs people with the skill at Advanced+.
    const live = this.requirementViews().filter((r) => r.coverage !== 'closed' && r.outcome !== 'lost')
    const coverage = SKILL_CATALOG.map(({ skill, category }) => {
      const holders = this.skills.filter((s) => s.skill === skill && known.has(s.employeeCode))
      return {
        skill, category,
        holders: holders.length,
        advanced: holders.filter((s) => (s.proficiency ?? 2) >= 3).length,
        demandFte: round1(live.filter((r) => r.scSkill === skill || r.techSkill === skill).reduce((s, r) => s + r.unmetFte * r.probability, 0)),
      }
    })
    return { asOf: AS_OF, staleDays: STALE_SKILL_DAYS, people: people.sort((a, b) => (b.daysSinceUpdate ?? 9999) - (a.daysSinceUpdate ?? 9999)), coverage }
  }

  meta(): Meta {
    return {
      asOf: AS_OF,
      scope: this.scope,
      sources: this.data.sources,
      quality: this.data.quality,
      grades: GRADES.map(({ grade, title }) => ({ grade, title })),
      skillCatalog: SKILL_CATALOG.map(({ skill, category }) => ({ skill, category })),
      months: this.months,
      counts: {
        employees: this.employees.length,
        sourceEmployees: this.employees.filter((e) => e.provenance === 'source').length,
        opportunities: this.opportunities.length,
        requirements: this.requirements.length,
        assignments: this.assignments.length,
      },
    }
  }
}

