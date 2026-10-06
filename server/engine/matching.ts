// Candidate matching for a resource requirement.
//
//   score = 40% skill fit + 20% grade fit + 25% availability + 15% bench priority
//           (+5 when the person has worked for the account before), capped at 100
//
// Each component is 0–100 and returned alongside the total, so the UI can show
// why someone ranks where they do.

import { GRADES, SKILL_CATALOG } from '../../shared/catalog'
import { addDays, diffDays, toDay } from '../../shared/dates'
import type { Candidate, EmployeeCapacity, EmployeeSkill, Requirement } from '../../shared/types'
import { avgFree, buildTimeline, type Timeline } from './capacity'

export const WEIGHTS = { skill: 0.4, grade: 0.2, availability: 0.25, bench: 0.15, familiarity: 5 }

const LEVEL_SCORE: Record<number, number> = { 1: 40, 2: 65, 3: 85, 4: 100 }
const FAMILY = new Map(SKILL_CATALOG.map((c) => [c.skill, c.family]))
const LADDER = GRADES.map((g) => g.grade)

export function skillScore(skills: EmployeeSkill[], wanted: string) {
  const exact = skills.find((s) => s.skill.toLowerCase() === wanted.toLowerCase())
  if (exact) {
    const level = exact.proficiency ?? 2
    return { skill: wanted, have: exact.skill, level: exact.proficiency, score: LEVEL_SCORE[level] ?? 65 }
  }
  // Adjacent skill in the same family (e.g. Supply planning for Demand planning) earns partial credit.
  const family = FAMILY.get(wanted)
  const related = skills.filter((s) => family && FAMILY.get(s.skill) === family).sort((a, b) => (b.proficiency ?? 2) - (a.proficiency ?? 2))[0]
  if (related) return { skill: wanted, have: related.skill, level: related.proficiency, score: (related.proficiency ?? 2) >= 3 ? 35 : 25 }
  return { skill: wanted, have: null, level: null, score: 0 }
}

export function gradeFit(empGrade: number, reqGrade: number): { score: number; label: string } {
  const a = LADDER.indexOf(empGrade)
  const b = LADDER.indexOf(reqGrade)
  const d = a === -1 || b === -1 ? empGrade - reqGrade : a - b
  if (d === 0) return { score: 100, label: 'Exact grade' }
  if (d === -1) return { score: 70, label: 'One grade senior' }
  if (d === 1) return { score: 60, label: 'Stretch · one grade junior' }
  if (d === -2) return { score: 35, label: 'Over-graded' }
  if (d === 2) return { score: 25, label: 'Stretch · two grades junior' }
  return { score: 10, label: d < 0 ? 'Far over-graded' : 'Far under-graded' }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0]
export const sameAccount = (client: string, account: string) => !!client && !!account && norm(client) === norm(account)

export interface MatchContext {
  asOf: string
  timelines: Map<string, Timeline>
  capacity: Map<string, EmployeeCapacity>
  skillsByEmp: Map<string, EmployeeSkill[]>
  day0: number
  days: number
}

/**
 * Scores one employee against one requirement. Rows created by this same
 * requirement's confirmed assignment are excluded so an assigned person isn't
 * penalised for their own booking.
 */
export function scoreCandidate(ctx: MatchContext, code: string, req: Requirement, account: string): Candidate {
  const cap = ctx.capacity.get(code)!
  const baseTl = ctx.timelines.get(code)!
  const ownRows = baseTl.rows.filter((r) => r.assignmentId && r.projectCode === req.id)
  const tl = ownRows.length ? buildTimeline(baseTl.employee, baseTl.rows.filter((r) => !ownRows.includes(r)), ctx.day0, ctx.days) : baseTl
  const skills = ctx.skillsByEmp.get(code) ?? []

  const sc = skillScore(skills, req.scSkill)
  const tech = skillScore(skills, req.techSkill)
  const skillFit = Math.round((sc.score + tech.score) / 2)
  const g = gradeFit(cap.grade, req.grade)

  // Availability over the first three months of the requirement (or all of it, if shorter).
  const from = req.start > ctx.asOf ? req.start : ctx.asOf
  const toCap = addDays(from, 89)
  const to = req.end < toCap ? req.end : toCap
  const free = toDay(to) >= toDay(from) ? avgFree(tl, from, to) : 0
  // One person supplies at most 1 FTE, so a 2-FTE role is judged per seat.
  const seat = Math.min(1, req.fte)
  const availability = Math.round(Math.min(1, free / seat) * 100)

  let benchPriority = 0
  if (cap.status === 'bench') benchPriority = Math.round(60 + Math.min(40, (cap.benchDays ?? 0) / 2))
  else if (cap.status === 'on-leave') benchPriority = 20
  else if (cap.rollOffDate && cap.rollOffDate <= req.start && cap.status === 'fully-allocated') benchPriority = 50
  else if (cap.status === 'partially-available') benchPriority = 30

  const familiar = tl.rows.some((r) => r.kind === 'billable' && sameAccount(r.client, account))
  const raw = WEIGHTS.skill * skillFit + WEIGHTS.grade * g.score + WEIGHTS.availability * availability + WEIGHTS.bench * benchPriority + (familiar ? WEIGHTS.familiarity : 0)

  const conflicts: string[] = []
  if (cap.status === 'on-leave') conflicts.push(`On leave${cap.availableFrom ? ` until ${addDays(cap.availableFrom, -1)}` : ''}`)
  if (availability < 100 && availability > 0) conflicts.push(`Only ${Math.round(free * 100)}% free in the first ${Math.min(90, diffDays(to, from) + 1)} days`)
  if (availability === 0) conflicts.push('No free capacity in the requirement window')
  if (cap.blockedFor && !sameAccount(cap.blockedFor, account)) conflicts.push(`Soft-blocked for ${cap.blockedFor}`)

  return {
    code,
    title: cap.title,
    grade: cap.grade,
    provenance: cap.provenance,
    status: cap.status,
    skillFit,
    skillDetail: [sc, tech],
    gradeFit: g.score,
    gradeLabel: g.label,
    availability,
    availableFte: Math.round(free * 100) / 100,
    availableFrom: cap.availableFrom,
    benchPriority,
    benchDays: cap.benchDays,
    accountFamiliarity: familiar,
    score: Math.min(100, Math.round(raw)),
    conflicts,
  }
}
