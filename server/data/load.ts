// Reads the source CSVs and the synthetic gap-fill CSVs, normalizes them into
// the shared model, and records every data-quality finding on the way.

import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { CATEGORY_KIND, PROFICIENCY_ALIASES, SKILL_ALIASES, SKILL_CATALOG, STAGE_WIN_DEFAULT } from '../../shared/catalog'
import { addDays, addMonths, fromExcelSerial } from '../../shared/dates'
import type {
  AllocationKind,
  AllocationRow,
  DataQualityIssue,
  DataSourceSummary,
  Employee,
  EmployeeSkill,
  Opportunity,
  OpportunityOutcome,
  Provenance,
  Requirement,
} from '../../shared/types'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SRC = path.join(ROOT, 'sample_data_csv')
const SYN = path.join(ROOT, 'data', 'synthetic')

type Row = Record<string, string>
const readCsv = (file: string): Row[] =>
  Papa.parse<Row>(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() }).data

const blank = (v: string | undefined) => v === undefined || v.trim() === '' || v.trim() === '-'
/** Dates arrive as Excel serials in the source and ISO in synthetic files. */
const date = (v: string | undefined): string | null => {
  if (blank(v)) return null
  const t = v!.trim()
  return /^\d{5}(\.\d+)?$/.test(t) ? fromExcelSerial(Math.floor(Number(t))) : t.slice(0, 10)
}
/** "$-", "300000", "$ 1,200" → number | null */
const money = (v: string | undefined): number | null => {
  if (blank(v)) return null
  const n = Number(v!.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && v!.replace(/[$,\s-]/g, '') !== '' ? n : null
}
const num = (v: string | undefined): number | null => (blank(v) ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export interface Dataset {
  employees: Employee[]
  allocations: AllocationRow[]
  skills: EmployeeSkill[]
  opportunities: Opportunity[]
  requirements: Requirement[]
  quality: DataQualityIssue[]
  sources: DataSourceSummary[]
  /** Employee codes that appear only in Skills.csv. */
  skillOnlyEmployees: string[]
}

function classify(projectType: string, category: string | null): AllocationKind {
  if (projectType.toLowerCase() === 'billable') return 'billable'
  if (category && CATEGORY_KIND[category]) return CATEGORY_KIND[category]
  return 'internal'
}

function loadAllocations(file: string, provenance: Provenance, quality: DataQualityIssue[]) {
  const rows = readCsv(file)
  const out: AllocationRow[] = []
  const employees = new Map<string, Employee>()
  let missingCode = 0
  rows.forEach((r, i) => {
    const code = r['Employee Code']?.trim()
    if (!code) {
      missingCode++
      return
    }
    const category = blank(r['Project Categorization']) ? null : r['Project Categorization'].trim()
    out.push({
      id: `${provenance === 'source' ? 'A' : 'AX'}-${i + 2}`,
      employeeCode: code,
      projectCode: r['Project Code']?.trim() || '(none)',
      projectName: r['Project Name']?.trim() || r['Sow']?.trim() || '(unnamed project)',
      client: r['Client']?.trim() ?? '',
      department: r['Project Department']?.trim() ?? '',
      vertical: r['Vertical']?.trim() ?? '',
      start: date(r['Start Date'])!,
      end: date(r['End Date'])!,
      pct: Number(r['% Allocation']) || 0,
      projectType: r['Project Type']?.trim() ?? '',
      reportAllocation: r['Allocation']?.trim() ?? '',
      category,
      sowStatus: r['Sow Status']?.trim() ?? '',
      engagementType: r['Engagement Type']?.trim() ?? '',
      kind: classify(r['Project Type'] ?? '', category),
      provenance,
    })
    if (!employees.has(code)) {
      employees.set(code, {
        code,
        title: r['Employee Job Title']?.trim() ?? '',
        grade: Number(r['Employee Grade']),
        joiningDate: date(r['Employee Joining Date']) ?? '',
        status: r['Employee Status']?.trim() ?? 'Active',
        provenance,
      })
    }
  })
  if (missingCode > 0 && provenance === 'source') {
    quality.push({
      id: 'dq-alloc-missing-code',
      file: path.basename(file),
      severity: 'high',
      title: `${missingCode} allocation rows have no Employee Code`,
      detail: 'Rows for the ABI "O-39540 - Order Management Canada" SOW (May–Jun 2026) cannot be attributed to a person and are excluded from capacity.',
      rows: missingCode,
    })
  }
  return { rows: out, employees: [...employees.values()], total: rows.length }
}

function outcomeOf(stage: string, status: string): OpportunityOutcome {
  const s = `${stage} ${status}`.toLowerCase()
  if (/\blost\b|never came through/.test(s)) return 'lost'
  if (/\bwon\b|started|signed/.test(s)) return 'won'
  return stage.toLowerCase() === 'closed' ? 'won' : 'open'
}

/** The tracker's monthly columns are fiscal Jul–Mar of FY27 (Apr 2026–Mar 2027). */
const FY_MONTHS: [string, string][] = [
  ['Jul', '2026-07'], ['Aug', '2026-08'], ['Sep', '2026-09'], ['Oct', '2026-10'], ['Nov', '2026-11'],
  ['Dec', '2026-12'], ['Jan', '2027-01'], ['Feb', '2027-02'], ['Mar', '2027-03'],
]

function loadOpportunities(quality: DataQualityIssue[]) {
  const assumptions = readCsv(path.join(SYN, 'opportunity_assumptions.csv'))
  const parse = (r: Row, provenance: Provenance, id: string): Opportunity => {
    const fp: Opportunity['fieldProvenance'] = {}
    const notes: string[] = []
    const monthly = FY_MONTHS.map(([col, month]) => ({ month, value: money(r[col]) ?? 0 })).filter((m) => m.value > 0)
    const stage = r['Stage']?.trim() ?? ''
    const status = r['Status']?.trim() ?? ''
    const o: Opportunity = {
      id,
      sno: num(r['S.No']),
      account: r['Account']?.trim() ?? '',
      name: r['Opportunity Name']?.trim() ?? '',
      type: r['Opportunity Type']?.trim() ?? '',
      stage,
      proposalDate: date(r['Proposal Date']),
      estStartDate: date(r['Estimated start date']),
      months: num(r['Number of months']),
      value: money(r['$ Value']),
      confWinning: num(r['Confidence of winning']),
      confThisQuarter: num(r['Confidence of starting this quarter']),
      confNextQuarter: num(r['Confidence of starting next quarter']),
      status,
      outcome: outcomeOf(stage, status),
      probability: 0,
      monthly,
      provenance,
      fieldProvenance: fp,
      notes,
    }
    // Derive what the monthly columns imply before falling back to assumptions.
    if (monthly.length > 0) {
      if (!o.estStartDate) {
        o.estStartDate = `${monthly[0].month}-04`
        fp.estStartDate = 'derived'
        notes.push(`Start date derived from the first month with forecast revenue (${monthly[0].month}).`)
      }
      if (o.months === null) {
        o.months = monthly.length
        fp.months = 'derived'
      }
      if (o.confWinning === null && o.value) {
        const ratio = monthly.reduce((s, m) => s + m.value, 0) / o.value
        if (ratio > 0 && ratio <= 1) {
          o.confWinning = Math.round(ratio * 100) / 100
          fp.confWinning = 'derived'
          notes.push(`Monthly figures sum to ${Math.round(ratio * 100)}% of the deal value — read as confidence-weighted, so win confidence is taken as ${Math.round(ratio * 100)}%.`)
        }
      }
    }
    for (const a of assumptions.filter((x) => x['Opportunity ID'] === id)) {
      const field = a['Field']
      if (field === 'Estimated start date' && !o.estStartDate) (o.estStartDate = a['Value']), (fp.estStartDate = 'synthetic')
      if (field === 'Number of months' && o.months === null) (o.months = Number(a['Value'])), (fp.months = 'synthetic')
      if (field === 'Confidence of winning' && o.confWinning === null) (o.confWinning = Number(a['Value'])), (fp.confWinning = 'synthetic')
      notes.push(`${field} assumed: ${a['Basis']}.`)
    }
    if (o.outcome === 'won' && o.confWinning === null) (o.confWinning = 1), (fp.confWinning = 'derived')
    if (o.outcome === 'lost' && o.confWinning === null) (o.confWinning = 0), (fp.confWinning = 'derived')
    if (o.confWinning === null) {
      o.confWinning = STAGE_WIN_DEFAULT[stage] ?? 0.5
      fp.confWinning = 'synthetic'
    }
    o.probability = o.outcome === 'won' ? 1 : o.outcome === 'lost' ? 0 : o.confWinning
    // If the tracker has no monthly split, spread the weighted value over the (possibly assumed) duration.
    if (monthly.length === 0 && o.value && o.estStartDate && o.months && o.outcome !== 'lost') {
      const per = (o.value * o.probability) / o.months
      o.monthly = Array.from({ length: o.months }, (_, k) => ({ month: addMonths(o.estStartDate!, k).slice(0, 7), value: Math.round(per) }))
      fp.monthly = 'derived'
    }
    return o
  }

  const srcRows = readCsv(path.join(SRC, 'Opportunity.csv'))
  const source = srcRows.map((r) => parse(r, 'source', `OPP-${String(r['S.No']).padStart(3, '0')}`))
  const synthetic = readCsv(path.join(SYN, 'opportunities_synthetic.csv')).map((r) => parse(r, 'synthetic', r['Opportunity ID']))

  // Data-quality findings on the tracker.
  const blankCounts = (col: string) => srcRows.filter((r) => blank(r[col])).length
  quality.push({
    id: 'dq-opp-blank-fields',
    file: 'Opportunity.csv',
    severity: 'high',
    title: 'Start date, duration and win confidence are blank on most opportunities',
    detail: `Estimated start date blank on ${blankCounts('Estimated start date')}/${srcRows.length}, Number of months on ${blankCounts('Number of months')}/${srcRows.length}, Confidence of winning on ${blankCounts('Confidence of winning')}/${srcRows.length}. Values are derived from monthly revenue where present, otherwise assumed (marked "est.").`,
    rows: srcRows.length,
  })
  for (const r of srcRows) {
    const q = { q2: money(r['Q2']) ?? 0, q4: money(r['Q4']) ?? 0, h1: money(r['H1']) ?? 0, fy: money(r['FY']) ?? 0 }
    const m = FY_MONTHS.reduce((s, [col]) => s + (money(r[col]) ?? 0), 0)
    const q2m = ['Jul', 'Aug', 'Sep'].reduce((s, c) => s + (money(r[c]) ?? 0), 0)
    if (m > 0 && (q.q2 !== q2m || q.fy !== m)) {
      quality.push({
        id: `dq-opp-rollup-${r['S.No']}`,
        file: 'Opportunity.csv',
        severity: 'watch',
        title: `Quarter roll-ups inconsistent for "${r['Opportunity Name']}"`,
        detail: `Monthly values sum to ${m.toLocaleString('en-US')} (all in Q4), but Q2 = ${q.q2.toLocaleString('en-US')}, H1 = ${q.h1.toLocaleString('en-US')} and FY = ${q.fy.toLocaleString('en-US')}. The app recomputes quarters from the monthly columns.`,
        rows: 1,
      })
    }
    if (money(r['$ Value']) === null) {
      quality.push({ id: `dq-opp-value-${r['S.No']}`, file: 'Opportunity.csv', severity: 'watch', title: `No deal value for "${r['Opportunity Name']}"`, detail: `"$ Value" is "${r['$ Value']?.trim()}". Shown as not stated; excluded from pipeline value.`, rows: 1 })
    }
  }
  return { opportunities: [...source, ...synthetic], sourceRows: srcRows.length, synthRows: synthetic.length }
}

function loadSkills(quality: DataQualityIssue[]) {
  const catalogue = new Map(SKILL_CATALOG.map((c) => [c.skill.toLowerCase(), c]))
  const out: EmployeeSkill[] = []
  const src = readCsv(path.join(SRC, 'Skills.csv'))
  let unlevelled = 0
  for (const r of src) {
    const code = r['Employee Code']?.trim()
    if (!code) continue
    for (const [col, raw] of Object.entries(r)) {
      if (!/^Skill \d+$/.test(col) || blank(raw)) continue
      const [namePart, levelPart] = raw.split(/\s+-\s+/)
      const name = SKILL_ALIASES[namePart.trim().toLowerCase()] ?? namePart.trim()
      const level = levelPart ? (PROFICIENCY_ALIASES[levelPart.trim().toLowerCase()] ?? null) : null
      if (level === null) unlevelled++
      const cat = catalogue.get(name.toLowerCase())
      out.push({ employeeCode: code, skill: name, category: cat?.category ?? 'Supply Chain', proficiency: level, lastUpdated: null, provenance: 'source', basis: `Skills.csv: "${raw.trim()}"` })
    }
  }
  if (unlevelled) {
    quality.push({ id: 'dq-skills-level', file: 'Skills.csv', severity: 'watch', title: `${unlevelled} source skills have no proficiency level`, detail: 'Free-text entries such as "Supply planning" state no level; matching treats them as Intermediate. Skills.csv also has no "last updated" date, so these profiles show as never reviewed.', rows: unlevelled })
  }
  for (const r of readCsv(path.join(SYN, 'employee_skills.csv'))) {
    out.push({
      employeeCode: r['Employee Code'],
      skill: r['Skill'],
      category: r['Skill Category'] as EmployeeSkill['category'],
      proficiency: Number(r['Proficiency']),
      lastUpdated: r['Last Updated'],
      provenance: 'synthetic',
      basis: r['Basis'],
    })
  }
  return { skills: out, sourceCodes: [...new Set(src.map((r) => r['Employee Code']?.trim()).filter(Boolean))] as string[], srcRows: src.length }
}

function loadRequirements(): Requirement[] {
  return readCsv(path.join(SYN, 'opportunity_requirements.csv')).map((r) => ({
    id: r['Requirement ID'],
    opportunityId: r['Opportunity ID'],
    role: r['Role'],
    grade: Number(r['Grade']),
    fte: Number(r['Required FTE']),
    scSkill: r['Supply Chain Skill'],
    techSkill: r['Technical Skill'],
    start: r['Start Date'],
    end: r['End Date'],
    provenance: 'synthetic',
  }))
}

/** Overlapping allocations that sum past 100% on any day are worth knowing about. */
function overAllocation(rows: AllocationRow[], quality: DataQualityIssue[]) {
  const byEmp = new Map<string, AllocationRow[]>()
  for (const r of rows) byEmp.set(r.employeeCode, [...(byEmp.get(r.employeeCode) ?? []), r])
  const flagged: string[] = []
  for (const [code, list] of byEmp) {
    const edges = [...new Set(list.flatMap((r) => [r.start, addDays(r.end, 1)]))].sort()
    for (const d of edges) {
      const total = list.filter((r) => r.start <= d && r.end >= d).reduce((s, r) => s + r.pct, 0)
      if (total > 100) {
        flagged.push(`${code} (${total}% on ${d})`)
        break
      }
    }
  }
  if (flagged.length) quality.push({ id: 'dq-over-allocation', file: 'allocation_report.csv', severity: 'watch', title: `${flagged.length} employees are allocated above 100% on some day`, detail: flagged.join(', '), rows: flagged.length })
}

export function loadDataset(): Dataset {
  const quality: DataQualityIssue[] = []
  const src = loadAllocations(path.join(SRC, 'allocation_report.csv'), 'source', quality)
  const syn = loadAllocations(path.join(SYN, 'allocation_synthetic.csv'), 'synthetic', quality)
  overAllocation(src.rows, quality)
  const opp = loadOpportunities(quality)
  const sk = loadSkills(quality)
  const requirements = loadRequirements()

  const employeeCodes = new Set(src.employees.map((e) => e.code))
  const skillOnly = sk.sourceCodes.filter((c) => !employeeCodes.has(c))
  if (skillOnly.length) {
    quality.push({ id: 'dq-skills-orphan', file: 'Skills.csv', severity: 'high', title: `Skills.csv covers ${sk.sourceCodes.length} employee, who is not in the allocation report`, detail: `${skillOnly.join(', ')} has skills but no allocation rows, so cannot be counted in capacity. No allocated employee has source skills — skills for them are inferred from project history (synthetic).`, rows: skillOnly.length })
  }
  quality.push({ id: 'dq-alloc-bench-horizon', file: 'allocation_report.csv', severity: 'watch', title: 'Bench allocations are booked to 31 Mar 2027', detail: 'Bench pools ("Fractal Bench in Supply Chain", client benches) run to fiscal year end. They are treated as free capacity, not as a deployment. The report starts in Nov 2025, so bench age cannot look further back than that.', rows: src.rows.filter((r) => r.kind === 'bench').length })

  const sources: DataSourceSummary[] = [
    { file: 'sample_data_csv/allocation_report.csv', provenance: 'source', rows: src.total, description: `${src.employees.length} employees, ${new Set(src.rows.map((r) => r.projectCode)).size} projects — allocations, grades, project history` },
    { file: 'sample_data_csv/Opportunity.csv', provenance: 'source', rows: opp.sourceRows, description: 'Opportunity tracker — stage, value, confidence, weighted monthly revenue' },
    { file: 'sample_data_csv/Skills.csv', provenance: 'source', rows: sk.srcRows, description: 'Skill list for one employee (not in allocation report)' },
    { file: 'data/synthetic/allocation_synthetic.csv', provenance: 'synthetic', rows: syn.total, description: `${syn.employees.length} additional employees on real projects, so bench and matching have a population` },
    { file: 'data/synthetic/employee_skills.csv', provenance: 'synthetic', rows: sk.skills.filter((s) => s.provenance === 'synthetic').length, description: 'Skills, proficiency and review dates — inferred from project history for real employees' },
    { file: 'data/synthetic/opportunity_assumptions.csv', provenance: 'synthetic', rows: readCsv(path.join(SYN, 'opportunity_assumptions.csv')).length, description: 'Assumed start date, duration and win confidence where the tracker is blank' },
    { file: 'data/synthetic/opportunities_synthetic.csv', provenance: 'synthetic', rows: opp.synthRows, description: 'Additional pipeline at accounts already in the allocation report' },
    { file: 'data/synthetic/opportunity_requirements.csv', provenance: 'synthetic', rows: requirements.length, description: 'Role, grade, FTE, skills and dates behind each live opportunity' },
  ]

  return {
    employees: [...src.employees, ...syn.employees],
    allocations: [...src.rows, ...syn.rows],
    skills: sk.skills,
    opportunities: opp.opportunities,
    requirements,
    quality,
    sources,
    skillOnlyEmployees: skillOnly,
  }
}

