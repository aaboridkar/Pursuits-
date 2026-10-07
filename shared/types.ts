// The data model shared by the API (server/) and the UI (src/).
// Every record carries its provenance so the UI can always say whether a
// figure came from a source CSV, was derived from one, or is synthetic.

/** source = read from a CSV as-is · derived = computed from source fields · synthetic = generated to fill a gap · app = created in this app */
export type Provenance = 'source' | 'derived' | 'synthetic' | 'app'

/** Which records feed every calculation. */
export type Scope = 'all' | 'source'

export type Horizon = 'now' | '1m' | '3m' | '6m'

/** ISO date, YYYY-MM-DD. */
export type ISODate = string

// --- People & allocations -----------------------------------------------------

/** How an allocation row is treated by the capacity engine. */
export type AllocationKind = 'billable' | 'internal' | 'bench' | 'blocked' | 'leave'

export interface Employee {
  code: string
  title: string
  grade: number
  joiningDate: ISODate
  status: string
  provenance: Provenance
  /** Display name, when the employee master has one (the source data has codes only). */
  name?: string
}

export interface AllocationRow {
  id: string
  employeeCode: string
  projectCode: string
  projectName: string
  client: string
  department: string
  vertical: string
  start: ISODate
  end: ISODate
  pct: number
  projectType: string
  /** Historic / Current / Future, as stated by the report. */
  reportAllocation: string
  category: string | null
  sowStatus: string
  engagementType: string
  kind: AllocationKind
  provenance: Provenance
  /** Set when the row was created by confirming a deployment in this app. */
  assignmentId?: string
}

export type AvailabilityStatus = 'fully-allocated' | 'partially-available' | 'bench' | 'on-leave'

export interface DayBreakdown {
  billable: number
  internal: number
  bench: number
  blocked: number
  leave: number
}

export interface MonthBreakdown extends DayBreakdown {
  month: string // YYYY-MM
  /** Average free capacity over the month, 0–100. */
  available: number
}

export interface Segment {
  start: ISODate
  end: ISODate
  kind: AllocationKind
  label: string
  client: string
  pct: number
  provenance: Provenance
}

export interface EmployeeCapacity {
  code: string
  title: string
  grade: number
  provenance: Provenance
  status: AvailabilityStatus
  /** Allocated (billable + internal) % at the snapshot date. */
  allocation: number
  billable: number
  available: number
  currentProject: string | null
  currentClient: string | null
  /** Where non-deployed capacity currently sits (bench pool, block, leave). */
  benchProject: string | null
  blockedFor: string | null
  availableFrom: ISODate | null
  /** Continuous days at 0% allocation up to the snapshot. null when allocated. */
  benchDays: number | null
  benchSince: ISODate | null
  /** True when the bench run reaches the first date the report covers. */
  benchHistoryLimited: boolean
  /** Next date the person drops to bench, when currently allocated. */
  rollOffDate: ISODate | null
  lastProjectEnd: ISODate | null
  lastProject: string | null
  keySkills: string[]
  skillsLastUpdated: ISODate | null
  skillsStale: boolean
}

// --- Skills -------------------------------------------------------------------

export type SkillCategory = 'Supply Chain' | 'Data Science' | 'FDE'

export interface EmployeeSkill {
  employeeCode: string
  skill: string
  category: SkillCategory
  /** 1 Basic · 2 Intermediate · 3 Advanced · 4 Expert · null when the source states no level. */
  proficiency: number | null
  /** null when the source gives no review date. */
  lastUpdated: ISODate | null
  provenance: Provenance
  /** Why this skill is believed — for synthetic skills, the project evidence it was inferred from. */
  basis?: string
}

// --- Opportunities ------------------------------------------------------------

export type OpportunityOutcome = 'won' | 'lost' | 'open'

export interface Opportunity {
  id: string
  sno: number | null
  account: string
  name: string
  type: string
  stage: string
  proposalDate: ISODate | null
  estStartDate: ISODate | null
  months: number | null
  value: number | null
  confWinning: number | null
  confThisQuarter: number | null
  confNextQuarter: number | null
  status: string
  /** Who leads the pursuit. Not in the tracker, so only ever set in the app. */
  lead: string | null
  outcome: OpportunityOutcome
  /** Probability used to weight demand: 1 for won, 0 for lost, else confidence of winning. */
  probability: number
  /** Weighted revenue by fiscal month (YYYY-MM). */
  monthly: { month: string; value: number }[]
  provenance: Provenance
  /** When the record entered the database, and when it was last saved (ISO timestamps). */
  createdAt?: string
  modifiedAt?: string
  /** Per-field provenance where it differs from the record's own. */
  fieldProvenance: Partial<Record<keyof Opportunity, Provenance>>
  notes: string[]
}

/** Opportunity fields that can be changed in the app. */
export type OpportunityEdit = Partial<Pick<Opportunity, 'type' | 'stage' | 'estStartDate' | 'months' | 'value' | 'confWinning' | 'lead'>>

/** A row of the client dimension (dim_client): every account the app knows. */
export interface Client {
  id: string
  name: string
  /** Where the client was first seen: the opportunity tracker, the allocation report, or added in the app. */
  source: 'opportunity' | 'allocation' | 'app'
  createdAt: string
}

/** A skill in the catalogue (dim_skill): the columns of the skills matrix. */
export interface SkillDef {
  skill: string
  category: SkillCategory
  /** Groups related skills for candidate matching; skills added in the app get their own. */
  family: string
  /** 'catalog' = shipped with the app; 'app' = added on the Skills tab. */
  source: 'catalog' | 'app'
  createdAt: string
}

/** One changed field, as recorded in the audit log. */
export interface AuditEntry {
  at: string
  /** Who saved: the IP address for new saves (earlier entries may hold a typed-in name). */
  editor: string
  /** Address the change came from, as the server saw it. */
  ip: string
  userAgent: string
  opportunityId: string
  opportunityName: string
  /**
   * The field changed, 'created' for a new opportunity (`to` holds its name), or 'skill' for a skill level
   * (`opportunityId` holds the employee code and `opportunityName` the skill; levels 0 = none to 4).
   */
  field: keyof OpportunityEdit | 'created' | 'skill' | 'skill-created'
  from: string | number | null
  to: string | number | null
}

export interface Requirement {
  id: string
  opportunityId: string
  role: string
  grade: number
  fte: number
  scSkill: string
  techSkill: string
  start: ISODate
  end: ISODate
  provenance: Provenance
}

export type AssignmentStatus = 'proposed' | 'confirmed'

export interface Assignment {
  id: string
  requirementId: string
  employeeCode: string
  fte: number
  status: AssignmentStatus
  createdAt: string
  updatedAt: string
}

export type CoverageStatus = 'filled' | 'partial' | 'proposed' | 'unfilled' | 'closed'

export interface RequirementView extends Requirement {
  opportunityName: string
  account: string
  outcome: OpportunityOutcome
  probability: number
  confirmedFte: number
  proposedFte: number
  unmetFte: number
  coverage: CoverageStatus
  assignments: (Assignment & { grade: number; title: string })[]
  /** Candidates on the bench / available who score ≥ 60 for this requirement. */
  strongCandidates: number
  bestCandidate: { code: string; score: number } | null
  daysToStart: number
}

export interface OpportunityView extends Opportunity {
  requirements: RequirementView[]
  totalFte: number
  weightedFte: number
  confirmedFte: number
  unmetFte: number
  /** Unmet FTE nobody available can cover in the window. */
  coverageRisk: 'covered' | 'at-risk' | 'gap' | 'n/a'
}

// --- Matching -----------------------------------------------------------------

export interface Candidate {
  code: string
  title: string
  grade: number
  provenance: Provenance
  status: AvailabilityStatus
  skillFit: number
  skillDetail: { skill: string; have: string | null; level: number | null; score: number }[]
  gradeFit: number
  gradeLabel: string
  availability: number
  availableFte: number
  availableFrom: ISODate | null
  benchPriority: number
  benchDays: number | null
  accountFamiliarity: boolean
  score: number
  assignment?: Assignment
  conflicts: string[]
}

// --- Risk ---------------------------------------------------------------------

export type RiskLevel = 'high' | 'medium' | 'low'

export interface PersonAtRisk {
  code: string
  title: string
  grade: number
  provenance: Provenance
  status: AvailabilityStatus
  benchDays: number | null
  rollOffDate: ISODate | null
  allocation: number
  lastProjectEnd: ISODate | null
  lastProject: string | null
  pipelineMatch: { requirementId: string; opportunityId: string; opportunityName: string; role: string; score: number; probability: number; start: ISODate } | null
  matchCount: number
  riskScore: number
  risk: RiskLevel
  reasons: string[]
  probableNext: string
}

// --- Overview -----------------------------------------------------------------

export interface GradeRow {
  grade: number
  title: string
  headcount: number
  fully: number
  partial: number
  bench: number
  leave: number
  availableFte: number
  demandFte: number
  gapFte: number
}

export interface MonthSupplyDemand {
  month: string
  supplyFte: number
  demandFte: number
  /** Unweighted demand — what lands if every open opportunity is won. */
  demandFteUnweighted: number
  confirmedFte: number
  gapFte: number
}

export type AlertKind = 'bench-60' | 'unmet-requirement' | 'stale-skills' | 'roll-off' | 'data-quality'

export interface Alert {
  id: string
  kind: AlertKind
  severity: 'critical' | 'high' | 'watch'
  title: string
  detail: string
  link: string
  linkLabel: string
}

export interface Overview {
  asOf: ISODate
  horizon: Horizon
  kpis: {
    headcount: number
    fully: number
    partial: number
    bench: number
    onLeave: number
    bench30: number
    bench60: number
    openOpportunities: number
    pipelineValue: number
    weightedPipelineValue: number
    expectedDemandFte: number
    availableFte: number
    gapFte: number
    /** Weighted unmet FTE on requirements nobody available is qualified for. */
    unqualifiedFte: number
    rollingOff: number
  }
  byGrade: GradeRow[]
  supplyDemand: MonthSupplyDemand[]
  alerts: Alert[]
}

// --- Employee 360 -------------------------------------------------------------

export interface ProjectHistoryRow {
  projectCode: string
  projectName: string
  client: string
  kind: AllocationKind
  start: ISODate
  end: ISODate
  peakPct: number
  engagementType: string
  sowStatus: string
  provenance: Provenance
  state: 'past' | 'current' | 'future'
}

export interface Employee360 {
  capacity: EmployeeCapacity
  employee: Employee & { tenureYears: number }
  skills: EmployeeSkill[]
  projects: ProjectHistoryRow[]
  segments: Segment[]
  months: MonthBreakdown[]
  matches: (Candidate & { requirement: RequirementView })[]
  assignments: (Assignment & { requirement: RequirementView })[]
  risk: PersonAtRisk | null
}

// --- Meta ---------------------------------------------------------------------

export interface DataQualityIssue {
  id: string
  file: string
  severity: 'high' | 'watch'
  title: string
  detail: string
  rows: number
}

export interface DataSourceSummary {
  file: string
  provenance: Provenance
  rows: number
  description: string
}

export interface Meta {
  asOf: ISODate
  scope: Scope
  sources: DataSourceSummary[]
  quality: DataQualityIssue[]
  grades: { grade: number; title: string }[]
  skillCatalog: { skill: string; category: SkillCategory }[]
  months: string[]
  counts: { employees: number; sourceEmployees: number; opportunities: number; requirements: number; assignments: number }
}

export const PROFICIENCY_LABEL: Record<number, string> = { 1: 'Basic', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' }
