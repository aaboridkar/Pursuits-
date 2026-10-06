/**
 * Generates the synthetic data that fills gaps in the source CSVs.
 *
 *   npm run generate
 *
 * Deterministic (seeded), so re-running produces identical files. Everything
 * written here lands in data/synthetic/ and is loaded with provenance
 * 'synthetic' — the source CSVs in sample_data_csv/ are never modified.
 *
 * What is generated, and why:
 *   allocation_synthetic.csv       29 additional Supply Chain employees (codes FX2xxxx) in the
 *                                  allocation-report schema, so bench ageing, risk and matching
 *                                  have a realistic population. Projects are drawn from the real
 *                                  project catalog in allocation_report.csv.
 *   employee_skills.csv            Skills + proficiency + last-reviewed date. Source covers one
 *                                  employee (F09560, not in the allocation report); for the 11 real
 *                                  employees skills are inferred from their project history.
 *   opportunity_assumptions.csv    Values for blank tracker fields (start date, duration, win
 *                                  confidence), one row per assumed field with its basis.
 *   opportunities_synthetic.csv    8 additional pipeline opportunities at accounts already in the
 *                                  allocation report.
 *   opportunity_requirements.csv   Role/grade/FTE/skills/dates behind each live opportunity.
 */
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { AS_OF, SKILL_CATALOG, gradeTitle } from '../shared/catalog'
import { addDays, addMonths, diffDays, toDay } from '../shared/dates'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'data', 'synthetic')
const SRC = path.join(ROOT, 'sample_data_csv')

// --- seeded RNG ----------------------------------------------------------------
let seed = 20261006
const rand = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))

const write = (file: string, rows: Record<string, unknown>[]) => {
  fs.writeFileSync(path.join(OUT, file), Papa.unparse(rows) + '\n')
  console.log(`  ${file.padEnd(32)} ${rows.length} rows`)
}

// --- real project catalog -------------------------------------------------------
type SrcRow = Record<string, string>
const alloc = Papa.parse<SrcRow>(fs.readFileSync(path.join(SRC, 'allocation_report.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data
const projects = new Map<string, SrcRow>()
for (const r of alloc) if (r['Project Code']) projects.set(r['Project Code'], r)
const P = (code: string) => {
  const p = projects.get(code)
  if (!p) throw new Error(`Project ${code} not in allocation_report.csv`)
  return p
}

const BILLABLE = ['26-CAP-12118', '25-CIE-10821', '26-CIE-12415', '26-CIE-12260', '25-CIE-9895', '26-CRE-12408', '26-AIM-12708', '26-AIM-12194', '26-AIM-12815', '25-AIM-10858']
const BENCH = '22-CCT-5143'
const INTERNAL = '16-ASC-1587'
const LEAVE = '25-ASC-9707'
const BLOCK_KENVUE = '25-CAP-9657'

const FY_START = '2026-04-01'
const FY_END = '2027-03-31'

const reportAllocation = (start: string, end: string) =>
  toDay(end) < toDay(AS_OF) ? 'Historic allocation' : toDay(start) > toDay(AS_OF) ? 'Future allocation' : 'Current allocation'

function allocRow(emp: { code: string; grade: number; joined: string }, code: string, start: string, end: string, pct: number) {
  const p = P(code)
  return {
    'Employee Code': emp.code,
    'Project Code': code,
    'Project Name': p['Project Name'],
    'Project Department': p['Project Department'],
    Client: p['Client'],
    'Start Date': start,
    'End Date': end,
    '% Allocation': pct,
    'Project Type': p['Project Type'],
    Allocation: reportAllocation(start, end),
    Sow: p['Sow'],
    'Sow Start Date': '',
    'Sow End Date': '',
    Vertical: p['Vertical'],
    'Sow Code': p['Sow Code'],
    'Sow Status': p['Sow Status'],
    'Sow Receieved Date': '',
    'Employee Job Title': gradeTitle(emp.grade),
    'Employee Grade': emp.grade,
    'Employee Status': 'Active',
    'Employee Joining Date': emp.joined,
    'Engagement Type': p['Engagement Type'],
    'Project Categorization': p['Project Categorization'] ?? '',
    'Project Status': 'Live',
    'Billed Utilization Applicable': 'Yes',
    'Cost of Delivery Applicable': 'Yes',
    'Tentative Billing Date': '',
    'Allocation Creation Date': '',
  }
}

// --- 1. synthetic employees & allocations ------------------------------------------
type Scenario =
  | { kind: 'deployed'; until: string }
  | { kind: 'rolloff'; on: string }
  | { kind: 'bench'; since: string }
  | { kind: 'partial' }
  | { kind: 'leave'; until: string }
  | { kind: 'blocked'; benchSince: string; blockedFrom: string }
  | { kind: 'mixed-internal' }

const PEOPLE: { grade: number; s: Scenario; archetype: string }[] = [
  { grade: 3, s: { kind: 'mixed-internal' }, archetype: 'planning' },
  { grade: 5, s: { kind: 'deployed', until: '2027-02-26' }, archetype: 'logistics' },
  { grade: 5, s: { kind: 'rolloff', on: '2026-10-30' }, archetype: 'manufacturing' },
  { grade: 5, s: { kind: 'bench', since: '2026-08-10' }, archetype: 'visibility' },
  { grade: 6, s: { kind: 'deployed', until: FY_END }, archetype: 'procurement' },
  { grade: 6, s: { kind: 'bench', since: '2026-07-20' }, archetype: 'planning' },
  { grade: 6, s: { kind: 'partial' }, archetype: 'esg' },
  { grade: 6, s: { kind: 'rolloff', on: '2026-11-20' }, archetype: 'planning' },
  { grade: 6, s: { kind: 'deployed', until: FY_END }, archetype: 'logistics' },
  { grade: 7, s: { kind: 'bench', since: '2026-06-15' }, archetype: 'planning' },
  { grade: 7, s: { kind: 'bench', since: '2026-09-10' }, archetype: 'data' },
  { grade: 7, s: { kind: 'deployed', until: FY_END }, archetype: 'bi' },
  { grade: 7, s: { kind: 'deployed', until: '2027-01-29' }, archetype: 'procurement' },
  { grade: 7, s: { kind: 'rolloff', on: '2026-12-15' }, archetype: 'logistics' },
  { grade: 7, s: { kind: 'leave', until: '2026-11-30' }, archetype: 'planning' },
  { grade: 7, s: { kind: 'partial' }, archetype: 'manufacturing' },
  { grade: 7, s: { kind: 'bench', since: '2026-08-01' }, archetype: 'esg' },
  { grade: 7, s: { kind: 'deployed', until: FY_END }, archetype: 'data' },
  { grade: 7, s: { kind: 'rolloff', on: '2026-10-23' }, archetype: 'bi' },
  { grade: 8, s: { kind: 'bench', since: '2026-07-01' }, archetype: 'bi' },
  { grade: 8, s: { kind: 'bench', since: '2026-09-01' }, archetype: 'procurement' },
  { grade: 8, s: { kind: 'deployed', until: FY_END }, archetype: 'data' },
  { grade: 8, s: { kind: 'deployed', until: FY_END }, archetype: 'logistics' },
  { grade: 8, s: { kind: 'deployed', until: '2027-01-15' }, archetype: 'planning' },
  { grade: 8, s: { kind: 'rolloff', on: '2026-11-06' }, archetype: 'manufacturing' },
  { grade: 8, s: { kind: 'bench', since: '2026-08-20' }, archetype: 'planning' },
  { grade: 8, s: { kind: 'deployed', until: FY_END }, archetype: 'bi' },
  { grade: 8, s: { kind: 'partial' }, archetype: 'data' },
  { grade: 8, s: { kind: 'blocked', benchSince: '2026-09-01', blockedFrom: '2026-09-28' }, archetype: 'planning' },
]

const synthEmployees: { code: string; grade: number; joined: string; archetype: string }[] = []
const synthAlloc: Record<string, unknown>[] = []

PEOPLE.forEach((p, i) => {
  const code = `FX${20001 + i}`
  const yearsIn = p.grade <= 5 ? int(6, 12) : p.grade === 6 ? int(3, 7) : p.grade === 7 ? int(1, 5) : int(0, 2)
  const joined = addDays('2026-03-01', -(yearsIn * 365 + int(0, 300)))
  const emp = { code, grade: p.grade, joined, archetype: p.archetype }
  synthEmployees.push(emp)
  const start = toDay(joined) > toDay(FY_START) ? joined : FY_START
  const proj1 = pick(BILLABLE)
  let proj2 = pick(BILLABLE)
  while (proj2 === proj1) proj2 = pick(BILLABLE)
  const add = (c: string, s: string, e: string, pct = 100) => {
    if (toDay(e) >= toDay(s)) synthAlloc.push(allocRow(emp, c, s, e, pct))
  }
  const s = p.s
  switch (s.kind) {
    case 'deployed': {
      const switchOn = addDays('2026-06-01', int(0, 80))
      add(proj1, start, addDays(switchOn, -1))
      add(proj2, switchOn, s.until)
      if (s.until !== FY_END) add(BENCH, addDays(s.until, 1), FY_END)
      break
    }
    case 'rolloff':
      add(proj1, start, addDays(start, int(40, 70)))
      add(proj2, addDays(start, 71), s.on)
      add(BENCH, addDays(s.on, 1), FY_END)
      break
    case 'bench':
      add(proj1, start, addDays(s.since, -1))
      add(BENCH, s.since, FY_END)
      break
    case 'partial':
      add(proj1, start, '2026-07-31')
      add(proj2, '2026-08-01', FY_END, 50)
      add(BENCH, '2026-08-01', FY_END, 50)
      break
    case 'leave':
      add(proj1, start, '2026-08-14')
      add(LEAVE, '2026-08-15', s.until)
      add(BENCH, addDays(s.until, 1), FY_END)
      break
    case 'blocked':
      add(proj1, start, addDays(s.benchSince, -1))
      add(BENCH, s.benchSince, addDays(s.blockedFrom, -1))
      add(BLOCK_KENVUE, s.blockedFrom, '2026-10-31')
      add(BENCH, '2026-11-01', FY_END)
      break
    case 'mixed-internal':
      add(proj1, start, FY_END, 50)
      add(INTERNAL, start, FY_END, 30)
      add(BENCH, start, FY_END, 20)
      break
  }
})
synthAlloc.sort((a, b) => String(a['Employee Code']).localeCompare(String(b['Employee Code'])) || String(a['Start Date']).localeCompare(String(b['Start Date'])))

// --- 2. skills ------------------------------------------------------------------------
const ARCHETYPE_SKILLS: Record<string, { sc: string[]; tech: string[] }> = {
  planning: { sc: ['Demand planning', 'Supply planning', 'S&OP', 'Inventory management'], tech: ['Python', 'SQL', 'SAP IBP', 'o9 Solutions', 'Power BI'] },
  logistics: { sc: ['Logistics & transportation', 'Network design', 'Order management'], tech: ['Python', 'Optimization (OR)', 'SQL', 'Tableau'] },
  procurement: { sc: ['Procurement & sourcing', 'Spend analytics'], tech: ['Power BI', 'SQL', 'GenAI & agents', 'Python'] },
  manufacturing: { sc: ['Manufacturing analytics', 'Quality analytics', 'Supply planning'], tech: ['Python', 'Machine learning', 'SAP S/4HANA', 'Databricks'] },
  visibility: { sc: ['Supply chain control tower', 'Inventory management', 'Order management'], tech: ['Power BI', 'Databricks', 'Azure Data Factory', 'SQL'] },
  esg: { sc: ['ESG & sustainability', 'Procurement & sourcing', 'Manufacturing analytics'], tech: ['Power BI', 'Python', 'SQL'] },
  bi: { sc: ['Supply chain control tower', 'Demand planning', 'Spend analytics'], tech: ['Power BI', 'SQL', 'Tableau', 'Azure Data Factory'] },
  data: { sc: ['Demand planning', 'Inventory management', 'Logistics & transportation'], tech: ['Python', 'Databricks', 'Machine learning', 'SQL', 'GenAI & agents'] },
}

const reviewDate = () => {
  // ~35% reviewed more than 90 days before the snapshot → flagged as outdated.
  const daysAgo = rand() < 0.35 ? int(95, 320) : int(5, 85)
  return addDays(AS_OF, -daysAgo)
}

const skillRows: Record<string, unknown>[] = []
const pushSkill = (code: string, skill: string, level: number, updated: string, basis: string) => {
  const cat = SKILL_CATALOG.find((c) => c.skill === skill)
  if (!cat) throw new Error(`Unknown skill ${skill}`)
  skillRows.push({ 'Employee Code': code, Skill: skill, 'Skill Category': cat.category, Proficiency: level, 'Last Updated': updated, Basis: basis })
}

// Real employees — inferred from the projects they appear on in allocation_report.csv.
const REAL_SKILLS: { code: string; updated: string; basis: string; skills: [string, number][] }[] = [
  { code: 'F00875', updated: '2026-03-18', basis: 'Client Partner; Sales-Farmers-Supply Chain, Supply Chain Capability, Core Delivery', skills: [['S&OP', 4], ['Demand planning', 4], ['Supply planning', 3], ['Network design', 3], ['SAP IBP', 3], ['Power BI', 2]] },
  { code: 'F07781', updated: '2026-02-02', basis: 'Client Bench of Philips (procurement client); returning from leave', skills: [['Procurement & sourcing', 3], ['Spend analytics', 3], ['Power BI', 3], ['SQL', 3], ['Python', 2], ['GenAI & agents', 1]] },
  { code: 'F08019', updated: '2026-08-21', basis: 'Power BI Engineer Supply Chain (Carrier); Air Freight Analysis (3M)', skills: [['Power BI', 4], ['SQL', 3], ['Logistics & transportation', 3], ['Azure Data Factory', 2], ['Supply chain control tower', 2]] },
  { code: 'F08299', updated: '2026-09-02', basis: 'ABI Logistics 4 use cases; Air Freight Analysis (3M)', skills: [['Logistics & transportation', 3], ['Network design', 3], ['Python', 3], ['Optimization (OR)', 3], ['SQL', 3]] },
  { code: 'F11888', updated: '2026-05-11', basis: 'Metro Brands Project Ferrari (retail)', skills: [['Inventory management', 3], ['Demand planning', 2], ['SQL', 3], ['Python', 2], ['Power BI', 2]] },
  { code: 'F12135', updated: '2026-07-30', basis: 'Brenntag - Engagement with Leon Verbeek (chemicals distribution)', skills: [['Order management', 3], ['Supply planning', 3], ['Inventory management', 2], ['Python', 3], ['SAP S/4HANA', 2]] },
  { code: 'F15217', updated: '2026-09-15', basis: 'Supply Chain Procurement SME Support; Supply Chain SME (Unilever)', skills: [['Procurement & sourcing', 4], ['Spend analytics', 3], ['S&OP', 3], ['Power BI', 3], ['SQL', 2]] },
  { code: 'F15234', updated: '2026-06-24', basis: 'ABI Logistics 4 use cases; Order Management Canada SOW', skills: [['Logistics & transportation', 3], ['Order management', 3], ['Python', 3], ['SQL', 3], ['Databricks', 2]] },
  { code: 'F15866', updated: '2026-04-09', basis: 'Brenntag engagement; Carrier - Digital India TnM Engagement', skills: [['Inventory management', 3], ['Supply chain control tower', 2], ['Python', 3], ['Machine learning', 3], ['Azure Data Factory', 2]] },
  { code: 'F16605', updated: '2026-09-26', basis: 'Phase 2 Air Freight Analysis Output Based Model (3M)', skills: [['Logistics & transportation', 3], ['Spend analytics', 2], ['Python', 3], ['SQL', 3], ['Machine learning', 2]] },
  { code: 'F17553', updated: '2026-06-02', basis: 'Nestle India Supply Chain BI POD; Supply Chain CDM (Unilever)', skills: [['Power BI', 4], ['SQL', 3], ['Demand planning', 3], ['Supply chain control tower', 2], ['Databricks', 2]] },
]
for (const r of REAL_SKILLS) for (const [skill, level] of r.skills) pushSkill(r.code, skill, level, r.updated, `Inferred from project history: ${r.basis}`)

for (const e of synthEmployees) {
  const a = ARCHETYPE_SKILLS[e.archetype]
  const updated = reviewDate()
  const base = e.grade <= 5 ? 3 : e.grade === 6 ? 3 : e.grade === 7 ? 2 : 2
  const sc = [...a.sc].sort(() => rand() - 0.5).slice(0, Math.min(a.sc.length, int(2, 3)))
  const tech = [...a.tech].sort(() => rand() - 0.5).slice(0, int(2, 3))
  sc.forEach((s, i) => pushSkill(e.code, s, Math.min(4, base + (i === 0 ? 1 : 0) + (rand() < 0.2 ? 1 : 0)), updated, `Synthetic profile (${e.archetype})`))
  tech.forEach((s, i) => pushSkill(e.code, s, Math.max(1, Math.min(4, base + (i === 0 ? 1 : 0) - (rand() < 0.3 ? 1 : 0))), updated, `Synthetic profile (${e.archetype})`))
}

// --- 3. assumptions for blank fields on source opportunities ------------------------------
// Source rows: 1 ESG Phase 2 (won) · 2 Smart Mfg (won, started) · 3 agentification (lost)
//              4 Manufacturing safety · 5 PR-PO automation · 6 3M Quality CR
const assumptions = [
  { 'Opportunity ID': 'OPP-001', Field: 'Estimated start date', Value: '2026-11-02', Basis: 'SOW signed and won; no start date in tracker — assumed first Monday of next month' },
  { 'Opportunity ID': 'OPP-001', Field: 'Number of months', Value: 6, Basis: 'Assumed phase length for a $300K fixed bid' },
  { 'Opportunity ID': 'OPP-002', Field: 'Estimated start date', Value: '2026-10-19', Basis: '"T&M engagement started" but no Mondelez allocations exist yet — assumed staffing from 19 Oct' },
  { 'Opportunity ID': 'OPP-002', Field: 'Number of months', Value: 12, Basis: 'Assumed for a $2M data-product programme' },
  { 'Opportunity ID': 'OPP-005', Field: 'Estimated start date', Value: '2026-11-16', Basis: 'Preparatory phase, 50% confidence of starting this quarter' },
  { 'Opportunity ID': 'OPP-005', Field: 'Number of months', Value: 4, Basis: 'Assumed POV-to-pilot duration' },
  { 'Opportunity ID': 'OPP-005', Field: 'Confidence of winning', Value: 0.3, Basis: 'Stage default for Preparatory phase' },
  { 'Opportunity ID': 'OPP-006', Field: 'Estimated start date', Value: '2026-10-19', Basis: 'SOW submitted, 50% confidence of starting this quarter' },
  { 'Opportunity ID': 'OPP-006', Field: 'Number of months', Value: 2, Basis: 'Assumed for a $32K change request' },
  { 'Opportunity ID': 'OPP-006', Field: 'Confidence of winning', Value: 0.75, Basis: 'Stage default for SOW Submitted' },
]

// --- 4. synthetic opportunities ---------------------------------------------------------------
const FY_MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const FY_MONTH_DATES = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
const synthOpps = [
  { id: 'OPPX-101', account: 'Unilever', name: 'Supply Chain Control Tower – EU rollout', type: 'T&M', stage: 'Proposal Submitted', proposal: '2026-09-08', start: '2026-11-09', months: 9, value: 680000, win: 0.7, thisQ: 0.6, nextQ: 0.9, status: 'Proposal under client review; team soft-blocked' },
  { id: 'OPPX-102', account: 'Kenvue Brands -LLC', name: 'Demand Sensing & Forecast Accuracy', type: 'Fixed Bid', stage: 'SOW Submitted', proposal: '2026-08-25', start: '2026-10-26', months: 6, value: 420000, win: 0.8, thisQ: 0.8, nextQ: 1, status: 'SOW in legal review' },
  { id: 'OPPX-103', account: 'Carrier', name: 'Inventory Optimization – Aftermarket Parts', type: 'Fixed Bid', stage: 'Proposal Submitted', proposal: '2026-09-21', start: '2026-12-01', months: 6, value: 350000, win: 0.6, thisQ: 0.3, nextQ: 0.8, status: 'Orals scheduled' },
  { id: 'OPPX-104', account: 'Anheuser-Busch Companies', name: 'Logistics Network Redesign Phase 2', type: 'Fixed Bid', stage: 'Qualification', proposal: '', start: '2027-01-11', months: 8, value: 900000, win: 0.4, thisQ: 0, nextQ: 0.5, status: 'Follow-on to Logistics 4 use cases' },
  { id: 'OPPX-105', account: 'Nestle (CPG)', name: 'S&OP Digital Twin (IBP)', type: 'Retainer - Monthly', stage: 'Proposal Submitted', proposal: '2026-09-30', start: '2027-02-01', months: 12, value: 520000, win: 0.5, thisQ: 0, nextQ: 0.6, status: 'Extension of BI POD relationship' },
  { id: 'OPPX-106', account: 'Brenntag', name: 'Procurement Spend Cube & GenAI Assistant', type: 'Fixed Bid', stage: 'Preparatory phase', proposal: '', start: '2027-01-04', months: 4, value: 240000, win: 0.3, thisQ: 0, nextQ: 0.4, status: 'POV development' },
  { id: 'OPPX-107', account: '3M', name: 'Ocean Freight Rate Benchmarking', type: 'Output Based', stage: 'SOW Submitted', proposal: '2026-09-14', start: '2026-11-02', months: 3, value: 150000, win: 0.8, thisQ: 0.9, nextQ: 1, status: 'Awaiting PO' },
  { id: 'OPPX-108', account: 'Metro brands-GCC', name: 'Store Replenishment Analytics', type: 'Fixed Bid', stage: 'Qualification', proposal: '', start: '2027-03-01', months: 5, value: 210000, win: 0.35, thisQ: 0, nextQ: 0.3, status: 'Discovery workshops' },
]
const oppRows = synthOpps.map((o, i) => {
  const months = Array.from({ length: o.months }, (_, k) => addMonths(o.start, k).slice(0, 7))
  const perMonth = Math.round((o.value * o.win) / o.months)
  const monthly: Record<string, number | string> = {}
  FY_MONTHS.forEach((m, k) => (monthly[m] = months.includes(FY_MONTH_DATES[k]) ? perMonth : ''))
  const sum = (ks: string[]) => ks.reduce((s, k) => s + (Number(monthly[k]) || 0), 0)
  const q2 = sum(['Jul', 'Aug', 'Sep']), q3 = sum(['Oct', 'Nov', 'Dec']), q4 = sum(['Jan', 'Feb', 'Mar'])
  return {
    'Opportunity ID': o.id, 'S.No': 100 + i + 1, Account: o.account, 'Opportunity Name': o.name, 'Opportunity Type': o.type, Stage: o.stage,
    'Proposal Date': o.proposal, 'Estimated start date': o.start, 'Number of months': o.months, '$ Value': o.value,
    'Confidence of winning': o.win, 'Confidence of starting this quarter': o.thisQ, 'Confidence of starting next quarter': o.nextQ, Status: o.status,
    ...monthly, Q2: q2 || '-', Q3: q3 || '-', Q4: q4 || '-', H1: '-', H2: q3 + q4 || '-', FY: q2 + q3 + q4 || '-',
  }
})

// --- 5. requirements ------------------------------------------------------------------------
type Req = [role: string, grade: number, fte: number, sc: string, tech: string, offsetMonths?: number, lengthMonths?: number]
const REQS: Record<string, { start: string; months: number; reqs: Req[] }> = {
  'OPP-001': { start: '2026-11-02', months: 6, reqs: [['Engagement lead', 6, 0.5, 'ESG & sustainability', 'Power BI'], ['Sustainability analyst', 7, 1, 'ESG & sustainability', 'Python'], ['BI developer', 8, 1, 'ESG & sustainability', 'Power BI', 0, 4]] },
  'OPP-002': { start: '2026-10-19', months: 12, reqs: [['Delivery manager', 5, 1, 'Manufacturing analytics', 'o9 Solutions'], ['Solution architect', 6, 1, 'Supply planning', 'SAP S/4HANA'], ['Data engineer', 7, 2, 'Manufacturing analytics', 'Databricks'], ['Planning analyst', 8, 1, 'Supply planning', 'o9 Solutions', 1, 11]] },
  'OPP-004': { start: '2027-01-04', months: 2, reqs: [['Manufacturing analytics lead', 7, 1, 'Manufacturing analytics', 'Python'], ['Data scientist', 8, 1, 'Quality analytics', 'Machine learning']] },
  'OPP-005': { start: '2026-11-16', months: 4, reqs: [['Procurement consultant', 7, 1, 'Procurement & sourcing', 'GenAI & agents'], ['Automation developer', 8, 1, 'Procurement & sourcing', 'Python']] },
  'OPP-006': { start: '2026-10-19', months: 2, reqs: [['Power BI developer', 7, 1, 'Logistics & transportation', 'Power BI'], ['Spend analyst', 8, 0.5, 'Spend analytics', 'SQL']] },
  'OPPX-101': { start: '2026-11-09', months: 9, reqs: [['Engagement manager', 5, 1, 'Supply chain control tower', 'Power BI'], ['Control tower consultant', 7, 2, 'Supply chain control tower', 'Databricks'], ['Inventory analyst', 8, 1, 'Inventory management', 'SQL']] },
  'OPPX-102': { start: '2026-10-26', months: 6, reqs: [['Demand planning manager', 6, 1, 'Demand planning', 'Machine learning'], ['Forecasting consultant', 7, 1, 'Demand planning', 'Python'], ['Forecast analyst', 8, 1, 'Demand planning', 'Power BI']] },
  'OPPX-103': { start: '2026-12-01', months: 6, reqs: [['Inventory optimization lead', 7, 1, 'Inventory management', 'Optimization (OR)'], ['Inventory analyst', 8, 1, 'Inventory management', 'Python']] },
  'OPPX-104': { start: '2027-01-11', months: 8, reqs: [['Engagement manager', 5, 1, 'Network design', 'Optimization (OR)'], ['Network modeller', 7, 2, 'Network design', 'Python'], ['Logistics analyst', 8, 1, 'Logistics & transportation', 'SQL']] },
  'OPPX-105': { start: '2027-02-01', months: 12, reqs: [['S&OP manager', 6, 1, 'S&OP', 'SAP IBP'], ['S&OP consultant', 7, 1, 'S&OP', 'Python'], ['Planning analyst', 8, 1, 'Demand planning', 'Power BI']] },
  'OPPX-106': { start: '2027-01-04', months: 4, reqs: [['Spend analytics consultant', 7, 1, 'Spend analytics', 'GenAI & agents'], ['Procurement analyst', 8, 1, 'Procurement & sourcing', 'Power BI']] },
  'OPPX-107': { start: '2026-11-02', months: 3, reqs: [['Freight analytics consultant', 7, 1, 'Logistics & transportation', 'Python'], ['Freight analyst', 8, 0.5, 'Logistics & transportation', 'Tableau']] },
  'OPPX-108': { start: '2027-03-01', months: 5, reqs: [['Replenishment consultant', 7, 1, 'Inventory management', 'Python'], ['Retail analyst', 8, 1, 'Demand planning', 'SQL']] },
}
const reqRows: Record<string, unknown>[] = []
for (const [oppId, o] of Object.entries(REQS)) {
  o.reqs.forEach(([role, grade, fte, sc, tech, offset = 0, len], i) => {
    const start = addMonths(o.start, offset)
    const end = addDays(addMonths(start, len ?? o.months - offset), -1)
    reqRows.push({ 'Requirement ID': `${oppId}-R${i + 1}`, 'Opportunity ID': oppId, Role: role, Grade: grade, 'Required FTE': fte, 'Supply Chain Skill': sc, 'Technical Skill': tech, 'Start Date': start, 'End Date': end })
  })
}

// --- write -------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true })
console.log(`Synthetic data → ${path.relative(ROOT, OUT)}`)
write('allocation_synthetic.csv', synthAlloc)
write('employee_skills.csv', skillRows)
write('opportunity_assumptions.csv', assumptions)
write('opportunities_synthetic.csv', oppRows)
write('opportunity_requirements.csv', reqRows)

// Sanity: the snapshot must sit inside the generated horizon.
if (diffDays(FY_END, AS_OF) < 150) throw new Error('Horizon too short')
