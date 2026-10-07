// SQLite storage for everything the app reads and writes: the source and synthetic data
// (imported from the CSVs on first start), the edits made in the app, and the change log.
// One file, data/pursuits.db, through Node's built-in node:sqlite driver.

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Assignment, AuditEntry, Client, SkillDef, DataQualityIssue, DataSourceSummary, Employee, EmployeeSkill, Opportunity, Requirement } from '../shared/types'
import { SKILL_CATALOG } from '../shared/catalog'
import { ROOT, loadDataset, type Dataset } from './data/load'
import type { RuntimeState } from './store'

export const DB_FILE = process.env.PURSUITS_DB ?? path.join(ROOT, 'data', 'pursuits.db')

// --- table specs ----------------------------------------------------------------------------
// Each record type maps property ↔ column one to one (camelCase ↔ snake_case). JSON columns hold
// nested values; optional properties are left off the record when their column is NULL.

export type ColType = 'TEXT' | 'INTEGER' | 'REAL' | 'JSON'
export interface Spec {
  table: string
  cols: [prop: string, type: ColType][]
  key?: string
  optional?: string[]
}

export const snake = (prop: string) => prop.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const q = (ident: string) => `"${ident}"`

/** The employee master (dim_employee). */
const EMPLOYEES: Spec = {
  table: 'dim_employee',
  optional: ['name'],
  key: 'code',
  cols: [['code', 'TEXT'], ['title', 'TEXT'], ['grade', 'INTEGER'], ['joiningDate', 'TEXT'], ['status', 'TEXT'], ['provenance', 'TEXT'], ['name', 'TEXT']],
}
const ALLOCATIONS: Spec = {
  table: 'allocations',
  key: 'id',
  optional: ['assignmentId'],
  cols: [
    ['id', 'TEXT'], ['employeeCode', 'TEXT'], ['projectCode', 'TEXT'], ['projectName', 'TEXT'], ['client', 'TEXT'], ['department', 'TEXT'],
    ['vertical', 'TEXT'], ['start', 'TEXT'], ['end', 'TEXT'], ['pct', 'REAL'], ['projectType', 'TEXT'], ['reportAllocation', 'TEXT'],
    ['category', 'TEXT'], ['sowStatus', 'TEXT'], ['engagementType', 'TEXT'], ['kind', 'TEXT'], ['provenance', 'TEXT'], ['assignmentId', 'TEXT'],
  ],
}
const SKILLS: Spec = {
  table: 'employee_skills',
  optional: ['basis'],
  cols: [['employeeCode', 'TEXT'], ['skill', 'TEXT'], ['category', 'TEXT'], ['proficiency', 'INTEGER'], ['lastUpdated', 'TEXT'], ['provenance', 'TEXT'], ['basis', 'TEXT']],
}
const OPPORTUNITIES: Spec = {
  table: 'opportunities',
  key: 'id',
  cols: [
    ['id', 'TEXT'], ['sno', 'INTEGER'], ['account', 'TEXT'], ['name', 'TEXT'], ['type', 'TEXT'], ['stage', 'TEXT'], ['proposalDate', 'TEXT'],
    ['estStartDate', 'TEXT'], ['months', 'INTEGER'], ['value', 'REAL'], ['confWinning', 'REAL'], ['confThisQuarter', 'REAL'],
    ['confNextQuarter', 'REAL'], ['status', 'TEXT'], ['lead', 'TEXT'], ['outcome', 'TEXT'], ['probability', 'REAL'], ['monthly', 'JSON'],
    ['provenance', 'TEXT'], ['fieldProvenance', 'JSON'], ['notes', 'JSON'],
  ],
}
const requirementCols: Spec['cols'] = [
  ['id', 'TEXT'], ['opportunityId', 'TEXT'], ['role', 'TEXT'], ['grade', 'INTEGER'], ['fte', 'REAL'], ['scSkill', 'TEXT'],
  ['techSkill', 'TEXT'], ['start', 'TEXT'], ['end', 'TEXT'], ['provenance', 'TEXT'],
]
const REQUIREMENTS: Spec = { table: 'requirements', key: 'id', cols: requirementCols }
const QUALITY: Spec = {
  table: 'data_quality',
  key: 'id',
  cols: [['id', 'TEXT'], ['file', 'TEXT'], ['severity', 'TEXT'], ['title', 'TEXT'], ['detail', 'TEXT'], ['rows', 'INTEGER']],
}
const SOURCES: Spec = {
  table: 'data_sources',
  key: 'file',
  cols: [['file', 'TEXT'], ['provenance', 'TEXT'], ['rows', 'INTEGER'], ['description', 'TEXT']],
}
const SKILL_ONLY: Spec = { table: 'skill_only_employees', key: 'code', cols: [['code', 'TEXT']] }

// Edits made in the app.
const ASSIGNMENTS: Spec = {
  table: 'assignments',
  key: 'id',
  cols: [['id', 'TEXT'], ['requirementId', 'TEXT'], ['employeeCode', 'TEXT'], ['fte', 'REAL'], ['status', 'TEXT'], ['createdAt', 'TEXT'], ['updatedAt', 'TEXT']],
}
const REQUIREMENTS_ADDED: Spec = { table: 'requirements_added', key: 'id', cols: requirementCols }
const OPPORTUNITIES_ADDED: Spec = { ...OPPORTUNITIES, table: 'opportunities_added' }
const REQUIREMENT_EDITS: Spec = { table: 'requirement_edits', key: 'requirementId', cols: [['requirementId', 'TEXT'], ['edit', 'JSON']] }
const REQUIREMENTS_DELETED: Spec = { table: 'requirements_deleted', key: 'requirementId', cols: [['requirementId', 'TEXT']] }
const OPPORTUNITY_EDITS: Spec = { table: 'opportunity_edits', key: 'opportunityId', cols: [['opportunityId', 'TEXT'], ['edit', 'JSON']] }
/** The client dimension (dim_client), kept with the app's edits so new clients save in the same transaction. */
const CLIENTS: Spec = { table: 'dim_client', key: 'id', cols: [['id', 'TEXT'], ['name', 'TEXT'], ['source', 'TEXT'], ['createdAt', 'TEXT']] }
/** The skill catalogue (dim_skill), kept with the app's edits so a new skill saves in the same transaction as its log entry. */
const SKILLS_DIM: Spec = { table: 'dim_skill', key: 'skill', cols: [['skill', 'TEXT'], ['category', 'TEXT'], ['family', 'TEXT'], ['source', 'TEXT'], ['createdAt', 'TEXT']] }
const OPPORTUNITY_TIMES: Spec = { table: 'opportunity_times', key: 'opportunityId', cols: [['opportunityId', 'TEXT'], ['createdAt', 'TEXT'], ['modifiedAt', 'TEXT']] }
const SKILL_REVIEWS: Spec = { table: 'skill_reviews', key: 'employeeCode', cols: [['employeeCode', 'TEXT'], ['reviewedOn', 'TEXT']] }
const SKILL_EDITS: Spec = { table: 'skill_edits', key: 'key', cols: [['key', 'TEXT'], ['proficiency', 'INTEGER']] }

const BASE = [EMPLOYEES, ALLOCATIONS, SKILLS, OPPORTUNITIES, REQUIREMENTS, QUALITY, SOURCES, SKILL_ONLY]

/** The table definitions, shared with the Azure SQL backend (db-mssql.ts) so both read and write the same shapes. */
export const SPECS = {
  EMPLOYEES, ALLOCATIONS, SKILLS, OPPORTUNITIES, REQUIREMENTS, QUALITY, SOURCES, SKILL_ONLY,
  ASSIGNMENTS, OPPORTUNITIES_ADDED, REQUIREMENTS_ADDED, REQUIREMENT_EDITS, REQUIREMENTS_DELETED, OPPORTUNITY_EDITS,
  CLIENTS, SKILLS_DIM, OPPORTUNITY_TIMES, SKILL_REVIEWS,
}
const RUNTIME = [CLIENTS, SKILLS_DIM, ASSIGNMENTS, OPPORTUNITIES_ADDED, REQUIREMENTS_ADDED, REQUIREMENT_EDITS, REQUIREMENTS_DELETED, OPPORTUNITY_EDITS, OPPORTUNITY_TIMES, SKILL_REVIEWS, SKILL_EDITS]

const ddl = (s: Spec) =>
  `CREATE TABLE IF NOT EXISTS ${q(s.table)} (${s.cols
    .map(([p, t]) => `${q(snake(p))} ${t === 'JSON' ? 'TEXT' : t}${p === s.key ? ' PRIMARY KEY' : ''}`)
    .join(', ')})`

type Row = Record<string, unknown>
type Value = string | number | null

function insertAll(db: DatabaseSync, s: Spec, records: object[]) {
  const stmt = db.prepare(`INSERT INTO ${q(s.table)} (${s.cols.map(([p]) => q(snake(p))).join(', ')}) VALUES (${s.cols.map(() => '?').join(', ')})`)
  for (const r of records as Row[]) {
    stmt.run(...s.cols.map(([p, t]): Value => (r[p] === undefined || r[p] === null ? null : t === 'JSON' ? JSON.stringify(r[p]) : (r[p] as Value))))
  }
}

function selectAll<T>(db: DatabaseSync, s: Spec): T[] {
  // rowid keeps the order records were imported in, which is the order the CSVs list them.
  const rows = db.prepare(`SELECT * FROM ${q(s.table)} ORDER BY rowid`).all() as Row[]
  return rows.map((row) => {
    const out: Row = {}
    for (const [p, t] of s.cols) {
      const v = row[snake(p)]
      if (v === null && s.optional?.includes(p)) continue
      out[p] = v === null ? null : t === 'JSON' ? JSON.parse(v as string) : v
    }
    return out as T
  })
}

// --- opening, schema and first-run import ---------------------------------------------------

/** `importLegacy` carries over data/runtime/state.json and audit.jsonl on first start; tests turn it off. */
export function openDb(file = DB_FILE, { importLegacy = true } = {}): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // WAL is fastest on a local disk. On a network share (Azure App Service's /home) set PURSUITS_DB_JOURNAL=DELETE:
  // WAL needs shared memory that network file systems don't provide.
  const journal = (process.env.PURSUITS_DB_JOURNAL ?? 'WAL').toUpperCase()
  if (!['WAL', 'DELETE', 'TRUNCATE'].includes(journal)) throw new Error(`PURSUITS_DB_JOURNAL must be WAL, DELETE or TRUNCATE (got ${journal})`)
  db.exec(`PRAGMA journal_mode = ${journal}; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`)
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  // The employee table became the employee master, dim_employee: rename it before the tables below
  // are created, so its rows carry over, and add the name column it gained.
  const hasTable = (t: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
  if (hasTable('employees') && !hasTable('dim_employee')) db.exec('ALTER TABLE employees RENAME TO dim_employee')
  if (hasTable('dim_employee') && !(db.prepare('PRAGMA table_info(dim_employee)').all() as { name: string }[]).some((c) => c.name === 'name'))
    db.exec('ALTER TABLE dim_employee ADD COLUMN name TEXT')
  for (const s of [...BASE, ...RUNTIME]) db.exec(ddl(s))
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, editor TEXT NOT NULL, ip TEXT NOT NULL, user_agent TEXT NOT NULL,
    opportunity_id TEXT NOT NULL, opportunity_name TEXT NOT NULL, field TEXT NOT NULL, from_value TEXT, to_value TEXT)`)
  if (!getMeta(db, 'seeded_at')) seed(db, importLegacy)
  migrate(db)
  return db
}

/** One-off upgrades to a database seeded by an earlier version of the app. Each is safe to re-run. */
function migrate(db: DatabaseSync) {
  // The single "Closed" stage became Closed - Won / Closed - Lost, by how the deal ended.
  transaction(db, () => {
    const base = db.prepare("UPDATE opportunities SET stage = CASE WHEN outcome = 'lost' THEN 'Closed - Lost' ELSE 'Closed - Won' END WHERE stage = 'Closed'").run().changes
    const edits = db
      .prepare(
        `UPDATE opportunity_edits SET edit = json_set(edit, '$.stage',
           CASE WHEN (SELECT outcome FROM opportunities o WHERE o.id = opportunity_id) = 'lost' THEN 'Closed - Lost' ELSE 'Closed - Won' END)
         WHERE json_extract(edit, '$.stage') = 'Closed'`,
      )
      .run().changes
    // Every opportunity has created / last-modified times. Ones without yet get created = when the
    // database was seeded (or when the change log saw them added) and modified = their latest logged save.
    const seededAt = getMeta(db, 'seeded_at') ?? new Date().toISOString()
    const times = db
      .prepare(
        `INSERT OR IGNORE INTO opportunity_times (opportunity_id, created_at, modified_at)
         SELECT id,
           COALESCE((SELECT MIN(at) FROM audit_log a WHERE a.opportunity_id = o.id AND a.field = 'created'), ?),
           COALESCE((SELECT MAX(at) FROM audit_log a WHERE a.opportunity_id = o.id), (SELECT MIN(at) FROM audit_log a WHERE a.opportunity_id = o.id AND a.field = 'created'), ?)
         FROM (SELECT id FROM opportunities UNION SELECT id FROM opportunities_added) o`,
      )
      .run(seededAt, seededAt).changes
    // The client dimension: every account in the opportunities and every client in the allocation
    // report, numbered CL-001… in alphabetical order. Runs once, while dim_client is empty.
    let clients = 0
    if (!(db.prepare('SELECT 1 FROM dim_client LIMIT 1').get())) {
      const names = db
        .prepare(
          `SELECT name, MIN(src) AS src FROM (
             SELECT TRIM(account) AS name, 'opportunity' AS src FROM opportunities
             UNION ALL SELECT TRIM(account), 'opportunity' FROM opportunities_added
             UNION ALL SELECT TRIM(client), 'allocation' FROM allocations
           ) WHERE name <> '' GROUP BY LOWER(name) ORDER BY LOWER(name)`,
        )
        .all() as { name: string; src: 'opportunity' | 'allocation' }[]
      insertAll(db, CLIENTS, names.map((n, i) => ({ id: `CL-${String(i + 1).padStart(3, '0')}`, name: n.name, source: n.src, createdAt: seededAt })))
      clients = names.length
    }
    // The skill catalogue (dim_skill): every shipped skill, added if missing (so skills shipped later
    // appear too); skills added in the app are kept as they are.
    const addSkill = db.prepare("INSERT OR IGNORE INTO dim_skill (skill, category, family, source, created_at) VALUES (?, ?, ?, 'catalog', ?)")
    let skills = 0
    for (const s of SKILL_CATALOG) skills += Number(addSkill.run(s.skill, s.category, s.family, seededAt).changes)
    // Technical was split into Data Science and FDE (MECE): shipped skills follow the catalogue's section,
    // skills added in the app under Technical move to Data Science, and people's skills follow their skill.
    const setSection = db.prepare("UPDATE dim_skill SET category = ? WHERE skill = ? AND source = 'catalog' AND category <> ?")
    for (const s of SKILL_CATALOG) skills += Number(setSection.run(s.category, s.skill, s.category).changes)
    skills += Number(db.prepare("UPDATE dim_skill SET category = 'Data Science' WHERE category = 'Technical'").run().changes)
    skills += Number(
      db.prepare("UPDATE employee_skills SET category = (SELECT d.category FROM dim_skill d WHERE d.skill = employee_skills.skill) WHERE category = 'Technical'").run().changes,
    )
    if (base || edits || times || clients || skills) setMeta(db, 'version', String(Number(getMeta(db, 'version') ?? 1) + 1))
  })
}

/** Proves the database answers: a trivial query that fails if the file is unreadable or locked. */
export function ping(db: DatabaseSync) {
  db.prepare('SELECT 1').get()
}

const getMeta = (db: DatabaseSync, key: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
const setMeta = (db: DatabaseSync, key: string, value: string) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)

function transaction(db: DatabaseSync, fn: () => void) {
  db.exec('BEGIN IMMEDIATE')
  try {
    fn()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/**
 * First start: import the CSVs, then carry over anything saved before the app used a
 * database (data/runtime/state.json and audit.jsonl). Those files are renamed, not deleted.
 */
function seed(db: DatabaseSync, importLegacy: boolean) {
  const data = loadDataset()
  const legacyDir = path.join(ROOT, 'data', 'runtime')
  const legacyState = path.join(legacyDir, 'state.json')
  const legacyAudit = path.join(legacyDir, 'audit.jsonl')
  transaction(db, () => {
    insertAll(db, EMPLOYEES, data.employees)
    insertAll(db, ALLOCATIONS, data.allocations)
    insertAll(db, SKILLS, data.skills)
    insertAll(db, OPPORTUNITIES, data.opportunities)
    insertAll(db, REQUIREMENTS, data.requirements)
    insertAll(db, QUALITY, data.quality)
    insertAll(db, SOURCES, data.sources)
    insertAll(db, SKILL_ONLY, data.skillOnlyEmployees.map((code) => ({ code })))
    setMeta(db, 'version', '1')
    if (importLegacy && fs.existsSync(legacyState)) writeRuntimeRows(db, { ...emptyRuntime(), ...JSON.parse(fs.readFileSync(legacyState, 'utf8')) })
    if (importLegacy && fs.existsSync(legacyAudit)) {
      const entries = fs.readFileSync(legacyAudit, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as AuditEntry)
      insertAudit(db, entries)
    }
    setMeta(db, 'seeded_at', new Date().toISOString())
  })
  if (importLegacy) for (const f of [legacyState, legacyAudit]) if (fs.existsSync(f)) fs.renameSync(f, `${f}.imported`)
}

// --- reading and writing ----------------------------------------------------------------------

export function readDataset(db: DatabaseSync): Dataset {
  return {
    employees: selectAll<Employee>(db, EMPLOYEES),
    allocations: selectAll(db, ALLOCATIONS),
    skills: selectAll<EmployeeSkill>(db, SKILLS),
    opportunities: selectAll<Opportunity>(db, OPPORTUNITIES),
    requirements: selectAll<Requirement>(db, REQUIREMENTS),
    quality: selectAll<DataQualityIssue>(db, QUALITY),
    sources: selectAll<DataSourceSummary>(db, SOURCES),
    skillOnlyEmployees: selectAll<{ code: string }>(db, SKILL_ONLY).map((r) => r.code),
  }
}

export const emptyRuntime = (): RuntimeState => ({
  version: 1,
  assignments: [],
  opportunitiesAdded: [],
  requirementsAdded: [],
  requirementEdits: {},
  requirementsDeleted: [],
  opportunityEdits: {},
  opportunityTimes: {},
  clients: [],
  skillCatalog: [],
  skillReviews: {},
  skillEdits: {},
})

export function readRuntime(db: DatabaseSync): RuntimeState {
  const pairs = <V>(s: Spec, k: string, v: string) => Object.fromEntries(selectAll<Row>(db, s).map((r) => [r[k] as string, r[v] as V]))
  return {
    version: Number(getMeta(db, 'version') ?? 1),
    assignments: selectAll<Assignment>(db, ASSIGNMENTS),
    opportunitiesAdded: selectAll<Opportunity>(db, OPPORTUNITIES_ADDED),
    requirementsAdded: selectAll<Requirement>(db, REQUIREMENTS_ADDED),
    requirementEdits: pairs(REQUIREMENT_EDITS, 'requirementId', 'edit'),
    requirementsDeleted: selectAll<{ requirementId: string }>(db, REQUIREMENTS_DELETED).map((r) => r.requirementId),
    clients: selectAll<Client>(db, CLIENTS),
    skillCatalog: selectAll<SkillDef>(db, SKILLS_DIM),
    opportunityEdits: pairs(OPPORTUNITY_EDITS, 'opportunityId', 'edit'),
    opportunityTimes: Object.fromEntries(selectAll<{ opportunityId: string; createdAt: string; modifiedAt: string }>(db, OPPORTUNITY_TIMES).map(({ opportunityId, ...t }) => [opportunityId, t])),
    skillReviews: pairs(SKILL_REVIEWS, 'employeeCode', 'reviewedOn'),
    skillEdits: pairs(SKILL_EDITS, 'key', 'proficiency'),
  }
}

function writeRuntimeRows(db: DatabaseSync, s: RuntimeState) {
  for (const spec of RUNTIME) db.exec(`DELETE FROM ${q(spec.table)}`)
  insertAll(db, ASSIGNMENTS, s.assignments)
  insertAll(db, OPPORTUNITIES_ADDED, s.opportunitiesAdded)
  insertAll(db, REQUIREMENTS_ADDED, s.requirementsAdded)
  insertAll(db, REQUIREMENT_EDITS, Object.entries(s.requirementEdits).map(([requirementId, edit]) => ({ requirementId, edit })))
  insertAll(db, REQUIREMENTS_DELETED, [...new Set(s.requirementsDeleted)].map((requirementId) => ({ requirementId })))
  insertAll(db, OPPORTUNITY_EDITS, Object.entries(s.opportunityEdits).map(([opportunityId, edit]) => ({ opportunityId, edit })))
  insertAll(db, CLIENTS, s.clients)
  insertAll(db, SKILLS_DIM, s.skillCatalog)
  insertAll(db, OPPORTUNITY_TIMES, Object.entries(s.opportunityTimes).map(([opportunityId, t]) => ({ opportunityId, ...t })))
  insertAll(db, SKILL_REVIEWS, Object.entries(s.skillReviews).map(([employeeCode, reviewedOn]) => ({ employeeCode, reviewedOn })))
  insertAll(db, SKILL_EDITS, Object.entries(s.skillEdits).map(([key, proficiency]) => ({ key, proficiency })))
  setMeta(db, 'version', String(s.version))
}

/**
 * Read the latest edits, apply a change, write them back with the change-log entries — all in
 * one write transaction, so two servers saving at once can't overwrite each other's edits.
 */
export function updateRuntime(db: DatabaseSync, fn: (s: RuntimeState) => void, audit: AuditEntry[] | ((s: RuntimeState) => AuditEntry[]) = []): RuntimeState {
  let next!: RuntimeState
  transaction(db, () => {
    next = readRuntime(db)
    fn(next)
    next.version++
    writeRuntimeRows(db, next)
    insertAudit(db, typeof audit === 'function' ? audit(next) : audit)
  })
  return next
}

function insertAudit(db: DatabaseSync, entries: AuditEntry[]) {
  const stmt = db.prepare(
    'INSERT INTO audit_log (at, editor, ip, user_agent, opportunity_id, opportunity_name, field, from_value, to_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const e of entries) stmt.run(e.at, e.editor, e.ip, e.userAgent, e.opportunityId, e.opportunityName, e.field, JSON.stringify(e.from), JSON.stringify(e.to))
}

/** Newest first. */
export function readAudit(db: DatabaseSync, limit: number): AuditEntry[] {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as Row[]
  return rows.map((r) => ({
    at: r.at as string,
    editor: r.editor as string,
    ip: r.ip as string,
    userAgent: r.user_agent as string,
    opportunityId: r.opportunity_id as string,
    opportunityName: r.opportunity_name as string,
    field: r.field as AuditEntry['field'],
    from: JSON.parse(r.from_value as string),
    to: JSON.parse(r.to_value as string),
  }))
}

/** Changes whenever another connection or process commits to the file — how this server notices outside writes. */
export const dataVersion = (db: DatabaseSync) => (db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version
