import type { OpportunityOutcome, SkillCategory } from './types'

/** The snapshot date of the allocation report (its last "Current allocation" row is 2026-10-06 → 2026-10-06). */
export const AS_OF = '2026-10-06'

/** Grade ladder. 3, 7 and 8 are observed in the allocation report; 5 and 6 are synthetic (no source rows). */
export const GRADES: { grade: number; title: string; observed: boolean }[] = [
  { grade: 3, title: 'Client Partner', observed: true },
  { grade: 5, title: 'Engagement Manager', observed: false },
  { grade: 6, title: 'Manager', observed: false },
  { grade: 7, title: 'Senior Consultant', observed: true },
  { grade: 8, title: 'Consultant', observed: true },
]
export const gradeTitle = (g: number) => GRADES.find((x) => x.grade === g)?.title ?? `Grade ${g}`

/**
 * The shipped skill catalogue, in three mutually exclusive sections (MECE):
 *   Supply chain — the planning and operations domain;
 *   Data Science — analysing data and building models (incl. the BI tools that present them);
 *   FDE (Forward Deployed Engineer) — building, integrating and deploying solutions on client platforms.
 * Every skill sits in exactly one section.
 */
export const SKILL_CATALOG: { skill: string; category: SkillCategory; family: string }[] = [
  { skill: 'Demand planning', category: 'Supply Chain', family: 'planning' },
  { skill: 'Supply planning', category: 'Supply Chain', family: 'planning' },
  { skill: 'S&OP', category: 'Supply Chain', family: 'planning' },
  { skill: 'Inventory management', category: 'Supply Chain', family: 'planning' },
  { skill: 'Logistics & transportation', category: 'Supply Chain', family: 'logistics' },
  { skill: 'Network design', category: 'Supply Chain', family: 'logistics' },
  { skill: 'Order management', category: 'Supply Chain', family: 'logistics' },
  { skill: 'Procurement & sourcing', category: 'Supply Chain', family: 'procurement' },
  { skill: 'Spend analytics', category: 'Supply Chain', family: 'procurement' },
  { skill: 'Manufacturing analytics', category: 'Supply Chain', family: 'manufacturing' },
  { skill: 'Quality analytics', category: 'Supply Chain', family: 'manufacturing' },
  { skill: 'Supply chain control tower', category: 'Supply Chain', family: 'visibility' },
  { skill: 'ESG & sustainability', category: 'Supply Chain', family: 'esg' },
  { skill: 'Python', category: 'Data Science', family: 'code' },
  { skill: 'SQL', category: 'Data Science', family: 'code' },
  { skill: 'Power BI', category: 'Data Science', family: 'bi' },
  { skill: 'Tableau', category: 'Data Science', family: 'bi' },
  { skill: 'Azure Data Factory', category: 'FDE', family: 'data-eng' },
  { skill: 'Databricks', category: 'FDE', family: 'data-eng' },
  { skill: 'Machine learning', category: 'Data Science', family: 'ml' },
  { skill: 'Optimization (OR)', category: 'Data Science', family: 'ml' },
  { skill: 'GenAI & agents', category: 'Data Science', family: 'ml' },
  { skill: 'o9 Solutions', category: 'FDE', family: 'platform' },
  { skill: 'SAP S/4HANA', category: 'FDE', family: 'platform' },
  { skill: 'SAP IBP', category: 'FDE', family: 'platform' },
  // Forward Deployed Engineer: working on-site with a client to take an AI/data product from problem to production.
  { skill: 'Customer discovery', category: 'FDE', family: 'fde-client' },
  { skill: 'Solution architecture', category: 'FDE', family: 'fde-client' },
  { skill: 'Full-stack development', category: 'FDE', family: 'fde-build' },
  { skill: 'Data engineering', category: 'FDE', family: 'fde-build' },
  { skill: 'APIs & integrations', category: 'FDE', family: 'fde-build' },
  { skill: 'LLM application development', category: 'FDE', family: 'fde-ai' },
  { skill: 'Agent orchestration', category: 'FDE', family: 'fde-ai' },
  { skill: 'Cloud deployment', category: 'FDE', family: 'fde-ops' },
  { skill: 'MLOps / LLMOps', category: 'FDE', family: 'fde-ops' },
  { skill: 'Rapid prototyping', category: 'FDE', family: 'fde-build' },
]

/** Source spellings → catalog names (Skills.csv uses free text). */
export const SKILL_ALIASES: Record<string, string> = {
  python: 'Python',
  sql: 'SQL',
  'supply planning': 'Supply planning',
  'demand planning': 'Demand planning',
  's&op': 'S&OP',
  'inventory management': 'Inventory management',
}

export const PROFICIENCY_ALIASES: Record<string, number> = { basic: 1, beginner: 1, intermediate: 2, advanced: 3, expert: 4 }

/** How a deal ended. Closed deals drop out of the pipeline table unless the Stage filter asks for them. */
export const CLOSED_STAGES = ['Closed - Won', 'Closed - Lost', 'Closed - Timed Out']

/** Pipeline stages, in the order the stage picker lists them: open stages, then the closed ones. */
export const OPPORTUNITY_STAGES = [
  'Capability Showcase',
  'Pre-Proposal',
  'Preparatory Phase',
  'Pre-Proposal RFI',
  'Primary Research',
  'Problem Understanding',
  'Proposal Submitted',
  'SOW Preparation',
  'SOW Submitted',
  ...CLOSED_STAGES,
]

/** Won, lost or still open, as the stage says. A deal that timed out counts as lost. */
export function stageOutcome(stage: string): OpportunityOutcome {
  if (stage === 'Closed - Won') return 'won'
  if (stage === 'Closed - Lost' || stage === 'Closed - Timed Out') return 'lost'
  return 'open'
}

/** Commercial models the type picker offers. */
export const OPPORTUNITY_TYPES = ['Fixed Bid', 'T&M', 'Product', 'Outcome Based', 'Output Based']

/** Tracker stage names that aren't in OPPORTUNITY_STAGES. */
const STAGE_ALIASES: Record<string, string> = { qualification: 'Problem Understanding' }

/** The tracker's stage as one of OPPORTUNITY_STAGES (case-insensitive), or as written when unknown. */
export function normalizeStage(raw: string): string {
  const k = raw.trim().toLowerCase()
  return OPPORTUNITY_STAGES.find((s) => s.toLowerCase() === k) ?? STAGE_ALIASES[k] ?? raw.trim()
}

/** Win probability assumed from stage when the tracker leaves "Confidence of winning" blank. */
export const STAGE_WIN_DEFAULT: Record<string, number> = {
  'Capability Showcase': 0.1,
  'Primary Research': 0.15,
  'Problem Understanding': 0.25,
  'Pre-Proposal': 0.3,
  'Pre-Proposal RFI': 0.3,
  'Preparatory Phase': 0.3,
  'Proposal Submitted': 0.5,
  'SOW Preparation': 0.65,
  'SOW Submitted': 0.75,
}

/** Allocation-report "Project Categorization" → how the capacity engine treats the row. */
export const CATEGORY_KIND: Record<string, 'internal' | 'bench' | 'blocked' | 'leave'> = {
  Capability: 'internal',
  'Core Delivery': 'internal',
  'Capability Bench': 'bench',
  'Client Bench': 'bench',
  'Fractal Bench': 'bench',
  'Practice Bench': 'bench',
  Blocked: 'blocked',
  'Parental Leaves': 'leave',
}

/** Skills not reviewed within this many days are flagged as outdated. */
export const STALE_SKILL_DAYS = 90
