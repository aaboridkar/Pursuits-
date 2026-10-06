import type { SkillCategory } from './types'

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
  { skill: 'Python', category: 'Technical', family: 'code' },
  { skill: 'SQL', category: 'Technical', family: 'code' },
  { skill: 'Power BI', category: 'Technical', family: 'bi' },
  { skill: 'Tableau', category: 'Technical', family: 'bi' },
  { skill: 'Azure Data Factory', category: 'Technical', family: 'data-eng' },
  { skill: 'Databricks', category: 'Technical', family: 'data-eng' },
  { skill: 'Machine learning', category: 'Technical', family: 'ml' },
  { skill: 'Optimization (OR)', category: 'Technical', family: 'ml' },
  { skill: 'GenAI & agents', category: 'Technical', family: 'ml' },
  { skill: 'o9 Solutions', category: 'Technical', family: 'platform' },
  { skill: 'SAP S/4HANA', category: 'Technical', family: 'platform' },
  { skill: 'SAP IBP', category: 'Technical', family: 'platform' },
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

/** Win probability assumed from stage when the tracker leaves "Confidence of winning" blank. */
export const STAGE_WIN_DEFAULT: Record<string, number> = {
  Qualification: 0.25,
  'Preparatory phase': 0.3,
  'Proposal Submitted': 0.5,
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
