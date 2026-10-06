// Capacity engine. Every employee's allocation rows are rasterized into day
// arrays (billable / internal / bench / blocked / leave %), from which status,
// availability, bench age, roll-off dates and monthly history are read.
//
// Rules:
//   allocated  = billable + internal (capability / core delivery work)
//   available  = 100 − allocated − leave, floored at 0
//   bench pools and "Blocked for <client>" are NOT allocation — they are free
//   capacity (a block is a soft reservation and is shown as such)
//   days after a person's last row are free; days before their first row are unknown

import { STALE_SKILL_DAYS } from '../../shared/catalog'
import { diffDays, fromDay, monthEnd, monthStart, toDay } from '../../shared/dates'
import type {
  AllocationKind,
  AllocationRow,
  AvailabilityStatus,
  DayBreakdown,
  Employee,
  EmployeeCapacity,
  EmployeeSkill,
  MonthBreakdown,
  ProjectHistoryRow,
  Segment,
} from '../../shared/types'

const KINDS: AllocationKind[] = ['billable', 'internal', 'bench', 'blocked', 'leave']

export interface Timeline {
  employee: Employee
  rows: AllocationRow[]
  /** First day covered by the report for this person. */
  coverageStart: number
  day0: number
  arrays: Record<AllocationKind, Float32Array>
}

export function buildTimeline(employee: Employee, rows: AllocationRow[], day0: number, days: number): Timeline {
  const arrays = Object.fromEntries(KINDS.map((k) => [k, new Float32Array(days)])) as Record<AllocationKind, Float32Array>
  for (const r of rows) {
    const a = Math.max(0, toDay(r.start) - day0)
    const b = Math.min(days - 1, toDay(r.end) - day0)
    const arr = arrays[r.kind]
    for (let d = a; d <= b; d++) arr[d] += r.pct
  }
  const coverageStart = rows.length ? Math.min(...rows.map((r) => toDay(r.start))) : day0
  return { employee, rows, coverageStart, day0, arrays }
}

export function dayAt(t: Timeline, iso: string): DayBreakdown {
  const i = toDay(iso) - t.day0
  const v = (k: AllocationKind) => (i >= 0 && i < t.arrays[k].length ? t.arrays[k][i] : 0)
  return { billable: v('billable'), internal: v('internal'), bench: v('bench'), blocked: v('blocked'), leave: v('leave') }
}

const allocatedAt = (t: Timeline, i: number) => t.arrays.billable[i] + t.arrays.internal[i]
const freeAt = (t: Timeline, i: number) => Math.max(0, 100 - allocatedAt(t, i) - t.arrays.leave[i])

export function statusOf(b: DayBreakdown): AvailabilityStatus {
  if (b.leave >= 50) return 'on-leave'
  const allocated = b.billable + b.internal
  if (allocated >= 100) return 'fully-allocated'
  if (allocated > 0) return 'partially-available'
  return 'bench'
}

/** Mean free capacity (0–1) over [from, to]. */
export function avgFree(t: Timeline, from: string, to: string): number {
  const a = toDay(from) - t.day0
  const b = toDay(to) - t.day0
  if (b < a) return 0
  let sum = 0
  for (let i = a; i <= b; i++) sum += i >= 0 && i < t.arrays.billable.length ? freeAt(t, i) : 100
  return sum / (b - a + 1) / 100
}

export function monthBreakdown(t: Timeline, month: string): MonthBreakdown {
  const a = toDay(monthStart(month)) - t.day0
  const b = toDay(monthEnd(month)) - t.day0
  const n = b - a + 1
  const avg = (k: AllocationKind) => {
    let s = 0
    for (let i = a; i <= b; i++) s += i >= 0 && i < t.arrays[k].length ? t.arrays[k][i] : 0
    return Math.round((s / n) * 10) / 10
  }
  let free = 0
  for (let i = a; i <= b; i++) free += i >= 0 && i < t.arrays.billable.length ? freeAt(t, i) : 100
  return { month, billable: avg('billable'), internal: avg('internal'), bench: avg('bench'), blocked: avg('blocked'), leave: avg('leave'), available: Math.round((free / n) * 10) / 10 }
}

/** The active row of a kind with the largest share on a date. */
function activeRow(rows: AllocationRow[], iso: string, kinds: AllocationKind[]) {
  return rows.filter((r) => kinds.includes(r.kind) && r.start <= iso && r.end >= iso).sort((a, b) => b.pct - a.pct)[0] ?? null
}

export function capacityAt(t: Timeline, asOf: string, skills: EmployeeSkill[]): EmployeeCapacity {
  const i0 = toDay(asOf) - t.day0
  const today = dayAt(t, asOf)
  const status = statusOf(today)
  const allocation = today.billable + today.internal
  const available = Math.max(0, 100 - allocation - today.leave)
  const len = t.arrays.billable.length

  // Bench age: continuous days at 0% allocation (and not on leave) up to the snapshot.
  let benchDays: number | null = null
  let benchSince: string | null = null
  let benchHistoryLimited = false
  if (status === 'bench') {
    let i = i0
    const floor = t.coverageStart - t.day0
    while (i - 1 >= floor && allocatedAt(t, i - 1) === 0 && t.arrays.leave[i - 1] < 50) i--
    benchHistoryLimited = i === floor
    benchSince = fromDay(t.day0 + i)
    benchDays = i0 - i
  }

  // Roll-off: the next day allocation drops below today's level.
  let rollOffDate: string | null = null
  if (allocation > 0) {
    for (let i = i0 + 1; i < len; i++) {
      if (allocatedAt(t, i) < allocation) {
        rollOffDate = fromDay(t.day0 + i)
        break
      }
    }
  }

  // Available from: the first day with any free capacity, on or after the snapshot.
  let availableFrom: string | null = null
  for (let i = Math.max(0, i0); i < len; i++) {
    if (freeAt(t, i) > 0) {
      availableFrom = fromDay(t.day0 + i)
      break
    }
  }

  const current = activeRow(t.rows, asOf, ['billable', 'internal'])
  const parked = activeRow(t.rows, asOf, ['blocked', 'bench', 'leave'])
  const blocked = activeRow(t.rows, asOf, ['blocked'])

  // Last project end: the most recent billable engagement that has finished; else the current one's end.
  const billable = t.rows.filter((r) => r.kind === 'billable')
  const finished = billable.filter((r) => r.end < asOf).sort((a, b) => b.end.localeCompare(a.end))[0]
  const ongoing = billable.filter((r) => r.start <= asOf && r.end >= asOf).sort((a, b) => b.end.localeCompare(a.end))[0]
  const last = status === 'bench' || !ongoing ? finished : ongoing

  const sorted = [...skills].sort((a, b) => (b.proficiency ?? 2) - (a.proficiency ?? 2))
  const reviewed = skills.map((s) => s.lastUpdated).filter((d): d is string => !!d).sort().at(-1) ?? null

  return {
    code: t.employee.code,
    title: t.employee.title,
    grade: t.employee.grade,
    provenance: t.employee.provenance,
    status,
    allocation,
    billable: today.billable,
    available,
    currentProject: current?.projectName ?? null,
    currentClient: current?.client ?? null,
    benchProject: parked?.projectName ?? null,
    blockedFor: blocked?.client ?? null,
    availableFrom,
    benchDays,
    benchSince,
    benchHistoryLimited,
    rollOffDate,
    lastProjectEnd: last?.end ?? null,
    lastProject: last?.projectName ?? null,
    keySkills: sorted.slice(0, 4).map((s) => s.skill),
    skillsLastUpdated: reviewed,
    skillsStale: !reviewed || diffDays(asOf, reviewed) > STALE_SKILL_DAYS,
  }
}

/** Contiguous runs of the same project at the same %, merged across the report's monthly splits. */
export function segmentsOf(t: Timeline): Segment[] {
  const sorted = [...t.rows].sort((a, b) => a.start.localeCompare(b.start) || a.projectCode.localeCompare(b.projectCode))
  const out: Segment[] = []
  for (const r of sorted) {
    const prev = out.findLast((s) => s.label === r.projectName && s.pct === r.pct && s.kind === r.kind)
    if (prev && toDay(r.start) <= toDay(prev.end) + 1) {
      if (r.end > prev.end) prev.end = r.end
      continue
    }
    out.push({ start: r.start, end: r.end, kind: r.kind, label: r.projectName, client: r.client, pct: r.pct, provenance: r.provenance })
  }
  return out
}

export function projectHistory(t: Timeline, asOf: string): ProjectHistoryRow[] {
  // One row per stint: rows of the same project merge only while they are contiguous,
  // so a return to the same bench pool months later is its own stint.
  const stints: AllocationRow[][] = []
  for (const r of [...t.rows].sort((a, b) => a.start.localeCompare(b.start))) {
    const open = stints.find((s) => s[0].projectCode === r.projectCode && s[0].projectName === r.projectName && toDay(r.start) <= toDay(s.map((x) => x.end).sort().at(-1)!) + 1)
    if (open) open.push(r)
    else stints.push([r])
  }
  return stints
    .map((rows) => {
      const start = rows.map((r) => r.start).sort()[0]
      const end = rows.map((r) => r.end).sort().at(-1)!
      const latest = [...rows].sort((a, b) => b.start.localeCompare(a.start))[0]
      return {
        projectCode: rows[0].projectCode,
        projectName: rows[0].projectName,
        client: rows[0].client,
        kind: rows[0].kind,
        start,
        end,
        peakPct: Math.max(...rows.map((r) => r.pct)),
        engagementType: latest.engagementType,
        sowStatus: latest.sowStatus,
        provenance: rows.some((r) => r.provenance === 'app') ? 'app' : rows[0].provenance,
        state: end < asOf ? 'past' : start > asOf ? 'future' : 'current',
      } satisfies ProjectHistoryRow
    })
    .sort((a, b) => b.start.localeCompare(a.start))
}

