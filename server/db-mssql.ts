// Azure SQL Database backend: the same tables, records and behaviour as the SQLite backend (db.ts), in the schema
// created by deploy/azure-sql/01-create-tables.sql (default AIT_SC_Gov). Chosen when AZURE_SQL_SERVER is set.
//
// Settings
//   AZURE_SQL_SERVER    e.g. supply-chain-capability-dev-supplychaindev-mssql-server.database.windows.net
//   AZURE_SQL_DATABASE  e.g. supply-chain-capability-dev-supplychaindev-mssql-db
//   AZURE_SQL_SCHEMA    default AIT_SC_Gov
//   AZURE_SQL_AUTH      'entra' (default): Microsoft Entra — the App Service managed identity, or your `az login`
//                       'sql':             AZURE_SQL_USER + AZURE_SQL_PASSWORD
//   AZURE_SQL_CLIENT_ID optional: a user-assigned managed identity's client id (Entra only)

import sql from 'mssql'
import { SKILL_CATALOG } from '../shared/catalog'
import type { AuditEntry, Client, SkillDef } from '../shared/types'
import { loadDataset, type Dataset } from './data/load'
import { SPECS, emptyRuntime, snake, type Spec } from './db'
import type { RuntimeState } from './store'

// ---------------------------------------------------------------------------------------------------------------
// Connection

export interface AzureSqlConfig {
  server: string
  database: string
  schema: string
  auth: 'entra' | 'sql'
  user?: string
  password?: string
  clientId?: string
}

export function azureSqlConfigFromEnv(env = process.env): AzureSqlConfig | null {
  if (!env.AZURE_SQL_SERVER) return null
  const cfg: AzureSqlConfig = {
    server: env.AZURE_SQL_SERVER.trim(),
    database: (env.AZURE_SQL_DATABASE ?? '').trim(),
    schema: (env.AZURE_SQL_SCHEMA ?? 'AIT_SC_Gov').trim(),
    auth: (env.AZURE_SQL_AUTH ?? 'entra').trim().toLowerCase() === 'sql' ? 'sql' : 'entra',
    user: env.AZURE_SQL_USER,
    password: env.AZURE_SQL_PASSWORD,
    clientId: env.AZURE_SQL_CLIENT_ID,
  }
  if (!cfg.database) throw new Error('AZURE_SQL_DATABASE is required when AZURE_SQL_SERVER is set')
  if (!/^\w+$/.test(cfg.schema)) throw new Error(`AZURE_SQL_SCHEMA must be letters, digits or _ (got "${cfg.schema}")`)
  if (cfg.auth === 'sql' && (!cfg.user || !cfg.password)) throw new Error('AZURE_SQL_AUTH=sql needs AZURE_SQL_USER and AZURE_SQL_PASSWORD')
  return cfg
}

export async function connect(cfg: AzureSqlConfig): Promise<sql.ConnectionPool> {
  const base = {
    server: cfg.server,
    database: cfg.database,
    port: 1433,
    options: { encrypt: true, trustServerCertificate: false, useUTC: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 30_000,
    requestTimeout: 60_000,
  }
  const config: sql.config =
    cfg.auth === 'sql'
      ? { ...base, user: cfg.user, password: cfg.password }
      : {
          ...base,
          authentication: {
            // DefaultAzureCredential: the App Service managed identity in Azure, `az login` on a laptop.
            type: 'azure-active-directory-default',
            options: cfg.clientId ? { clientId: cfg.clientId } : {},
          },
        }
  return new sql.ConnectionPool(config).connect()
}

// ---------------------------------------------------------------------------------------------------------------
// Records ↔ rows. Same property ↔ column mapping as SQLite; SQL Server adds real DATE / DATETIME2 types.

/** Properties stored as DATE (read back as YYYY-MM-DD). */
const DATE_PROPS = new Set(['joiningDate', 'proposalDate', 'estStartDate', 'start', 'end', 'lastUpdated', 'reviewedOn'])
/** Properties stored as DATETIME2 (read back as ISO timestamps). */
const TIMESTAMP_PROPS = new Set(['createdAt', 'updatedAt', 'modifiedAt', 'at'])

type Row = Record<string, unknown>
type Param = { type: sql.ISqlType | (() => sql.ISqlType); value: unknown }

export function toParam(prop: string, colType: Spec['cols'][number][1], value: unknown): Param {
  if (value === undefined || value === null) return { type: sql.NVarChar(sql.MAX), value: null }
  if (colType === 'JSON') return { type: sql.NVarChar(sql.MAX), value: JSON.stringify(value) }
  if (TIMESTAMP_PROPS.has(prop)) return { type: sql.DateTime2(3), value: new Date(value as string) }
  if (DATE_PROPS.has(prop)) return { type: sql.Date, value: new Date(`${String(value).slice(0, 10)}T00:00:00Z`) }
  if (colType === 'INTEGER') return { type: sql.Int, value }
  if (colType === 'REAL') return { type: sql.Float, value }
  return { type: sql.NVarChar(sql.MAX), value: String(value) }
}

export function fromRow<T>(row: Row, s: Spec): T {
  const out: Row = {}
  for (const [p, t] of s.cols) {
    let v = row[snake(p)]
    if (v === null || v === undefined) {
      if (s.optional?.includes(p)) continue
      out[p] = null
      continue
    }
    if (v instanceof Date) v = DATE_PROPS.has(p) ? v.toISOString().slice(0, 10) : v.toISOString()
    else if (t === 'JSON') v = JSON.parse(v as string)
    else if (t === 'INTEGER' || t === 'REAL') v = Number(v)
    out[p] = v
  }
  return out as T
}

/** Rows per INSERT so one statement stays under SQL Server's 2,100-parameter and 1,000-row limits. */
export const rowsPerInsert = (columns: number) => Math.max(1, Math.min(1000, Math.floor(2000 / columns)))

// ---------------------------------------------------------------------------------------------------------------
// The backend

type Requester = () => sql.Request

export class AzureSqlBackend {
  readonly name: string
  private constructor(
    private readonly pool: sql.ConnectionPool,
    private readonly schema: string,
    cfg: AzureSqlConfig,
  ) {
    this.name = `Azure SQL ${cfg.server}/${cfg.database} [${cfg.schema}]`
  }

  /** Connect, check the tables exist, and on first use fill them from the project's CSVs. */
  static async open(cfg: AzureSqlConfig, { seedFromCsv = true } = {}): Promise<AzureSqlBackend> {
    const b = new AzureSqlBackend(await connect(cfg), cfg.schema, cfg)
    await b.checkTables()
    if (seedFromCsv && (await b.isEmpty())) await b.seed(loadDataset())
    await b.migrate()
    return b
  }

  /** For tools (db:check, db:copy-to-azure): connect and check the tables, nothing else. */
  static async openBare(cfg: AzureSqlConfig): Promise<AzureSqlBackend> {
    const b = new AzureSqlBackend(await connect(cfg), cfg.schema, cfg)
    await b.checkTables()
    return b
  }

  close() {
    return this.pool.close()
  }

  private t = (table: string) => `[${this.schema}].[${table}]`
  private req: Requester = () => this.pool.request()

  static readonly TABLES = [
    ...Object.values(SPECS).map((s) => s.table),
    'skill_edits', 'audit_log', 'meta',
  ]

  async checkTables() {
    const r = await this.req().input('schema', sql.NVarChar, this.schema).query<{ name: string }>(
      'SELECT t.name FROM sys.tables t WHERE t.schema_id = SCHEMA_ID(@schema)',
    )
    const have = new Set(r.recordset.map((x) => x.name))
    const missing = AzureSqlBackend.TABLES.filter((t) => !have.has(t))
    if (missing.length)
      throw new Error(`Schema [${this.schema}] is missing ${missing.length} table(s): ${missing.join(', ')} — run deploy/azure-sql/01-create-tables.sql first`)
  }

  async counts(): Promise<Record<string, number>> {
    const parts = AzureSqlBackend.TABLES.map((t) => `SELECT '${t}' AS t, COUNT(*) AS n FROM ${this.t(t)}`).join(' UNION ALL ')
    const r = await this.req().query<{ t: string; n: number }>(parts)
    return Object.fromEntries(r.recordset.map((x) => [x.t, x.n]))
  }

  async isEmpty() {
    const r = await this.req().query<{ n: number }>(`SELECT (SELECT COUNT(*) FROM ${this.t('opportunities')}) + (SELECT COUNT(*) FROM ${this.t('dim_employee')}) AS n`)
    return r.recordset[0].n === 0
  }

  // -- low-level reads / writes ------------------------------------------------------------------------------

  private async selectAll<T>(r: Requester, s: Spec): Promise<T[]> {
    // employee_skills has an identity id: its order is the import order. Other tables order by their key.
    const order = s.table === 'employee_skills' ? 'id' : s.key ? `[${snake(s.key)}]` : '(SELECT NULL)'
    const res = await r().query<Row>(`SELECT * FROM ${this.t(s.table)} ORDER BY ${order}`)
    return res.recordset.map((row) => fromRow<T>(row, s))
  }

  private async insertAll(r: Requester, s: Spec, records: object[]) {
    if (!records.length) return
    const cols = s.cols.map(([p]) => p)
    const chunk = rowsPerInsert(cols.length)
    for (let i = 0; i < records.length; i += chunk) {
      const request = r()
      const values = (records.slice(i, i + chunk) as Row[]).map((rec, j) => {
        const names = s.cols.map(([p, type], k) => {
          const name = `p${j}_${k}`
          const { type: sqlType, value } = toParam(p, type, rec[p])
          request.input(name, sqlType, value)
          return `@${name}`
        })
        return `(${names.join(', ')})`
      })
      await request.query(`INSERT INTO ${this.t(s.table)} (${cols.map((c) => `[${snake(c)}]`).join(', ')}) VALUES ${values.join(', ')}`)
    }
  }

  private async insertAudit(r: Requester, entries: AuditEntry[]) {
    for (const e of entries) {
      await r()
        .input('at', sql.DateTime2(3), new Date(e.at))
        .input('editor', sql.NVarChar(256), e.editor)
        .input('ip', sql.NVarChar(64), e.ip)
        .input('ua', sql.NVarChar(512), e.userAgent.slice(0, 512))
        .input('oid', sql.NVarChar(40), e.opportunityId)
        .input('oname', sql.NVarChar(200), e.opportunityName.slice(0, 200))
        .input('field', sql.NVarChar(20), e.field)
        .input('fromv', sql.NVarChar(sql.MAX), JSON.stringify(e.from))
        .input('tov', sql.NVarChar(sql.MAX), JSON.stringify(e.to))
        .query(
          `INSERT INTO ${this.t('audit_log')} (at, editor, ip, user_agent, opportunity_id, opportunity_name, field, from_value, to_value)
           VALUES (@at, @editor, @ip, @ua, @oid, @oname, @field, @fromv, @tov)`,
        )
    }
  }

  private async getMeta(r: Requester, key: string) {
    const res = await r().input('k', sql.NVarChar(40), key).query<{ value: string }>(`SELECT value FROM ${this.t('meta')} WHERE [key] = @k`)
    return res.recordset[0]?.value
  }

  private async setMeta(r: Requester, key: string, value: string) {
    await r()
      .input('k', sql.NVarChar(40), key)
      .input('v', sql.NVarChar(200), value)
      .query(
        `UPDATE ${this.t('meta')} SET value = @v WHERE [key] = @k;
         IF @@ROWCOUNT = 0 INSERT INTO ${this.t('meta')} ([key], value) VALUES (@k, @v);`,
      )
  }

  /** Runs `fn` in one SERIALIZABLE transaction; rolls back on any error. */
  private async transaction<T>(fn: (r: Requester) => Promise<T>): Promise<T> {
    const tx = new sql.Transaction(this.pool)
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    try {
      const out = await fn(() => new sql.Request(tx))
      await tx.commit()
      return out
    } catch (e) {
      await tx.rollback().catch(() => {})
      throw e
    }
  }

  // -- the backend interface (same as SQLite's) ---------------------------------------------------------------

  async readDataset(): Promise<Dataset> {
    const r = this.req
    return {
      employees: await this.selectAll(r, SPECS.EMPLOYEES),
      allocations: await this.selectAll(r, SPECS.ALLOCATIONS),
      skills: await this.selectAll(r, SPECS.SKILLS),
      opportunities: await this.selectAll(r, SPECS.OPPORTUNITIES),
      requirements: await this.selectAll(r, SPECS.REQUIREMENTS),
      quality: await this.selectAll(r, SPECS.QUALITY),
      sources: await this.selectAll(r, SPECS.SOURCES),
      skillOnlyEmployees: (await this.selectAll<{ code: string }>(r, SPECS.SKILL_ONLY)).map((x) => x.code),
    }
  }

  private async readRuntimeWith(r: Requester): Promise<RuntimeState> {
    const pairs = async <V>(s: Spec, k: string, v: string) =>
      Object.fromEntries((await this.selectAll<Row>(r, s)).map((x) => [x[k] as string, x[v] as V]))
    const skillEdits = await r().query<{ employee_code: string; skill: string; proficiency: number }>(`SELECT employee_code, skill, proficiency FROM ${this.t('skill_edits')}`)
    return {
      version: Number((await this.getMeta(r, 'version')) ?? 1),
      assignments: await this.selectAll(r, SPECS.ASSIGNMENTS),
      opportunitiesAdded: await this.selectAll(r, SPECS.OPPORTUNITIES_ADDED),
      requirementsAdded: await this.selectAll(r, SPECS.REQUIREMENTS_ADDED),
      requirementEdits: await pairs(SPECS.REQUIREMENT_EDITS, 'requirementId', 'edit'),
      requirementsDeleted: (await this.selectAll<{ requirementId: string }>(r, SPECS.REQUIREMENTS_DELETED)).map((x) => x.requirementId),
      opportunityEdits: await pairs(SPECS.OPPORTUNITY_EDITS, 'opportunityId', 'edit'),
      opportunityTimes: Object.fromEntries(
        (await this.selectAll<{ opportunityId: string; createdAt: string; modifiedAt: string }>(r, SPECS.OPPORTUNITY_TIMES)).map(({ opportunityId, ...t }) => [opportunityId, t]),
      ),
      clients: await this.selectAll<Client>(r, SPECS.CLIENTS),
      skillCatalog: await this.selectAll<SkillDef>(r, SPECS.SKILLS_DIM),
      skillReviews: await pairs(SPECS.SKILL_REVIEWS, 'employeeCode', 'reviewedOn'),
      skillEdits: Object.fromEntries(skillEdits.recordset.map((x) => [`${x.employee_code}|${x.skill}`, x.proficiency])),
    }
  }

  readRuntime() {
    return this.readRuntimeWith(this.req)
  }

  /** Replace every app-change table with `s`. skill_edits goes first (it references dim_skill) and comes back last. */
  private async writeRuntimeRows(r: Requester, s: RuntimeState) {
    await r().query(`DELETE FROM ${this.t('skill_edits')}`)
    const tables = [SPECS.CLIENTS, SPECS.SKILLS_DIM, SPECS.ASSIGNMENTS, SPECS.OPPORTUNITIES_ADDED, SPECS.REQUIREMENTS_ADDED, SPECS.REQUIREMENT_EDITS, SPECS.REQUIREMENTS_DELETED, SPECS.OPPORTUNITY_EDITS, SPECS.OPPORTUNITY_TIMES, SPECS.SKILL_REVIEWS]
    for (const spec of tables) await r().query(`DELETE FROM ${this.t(spec.table)}`)
    await this.insertAll(r, SPECS.CLIENTS, s.clients)
    await this.insertAll(r, SPECS.SKILLS_DIM, s.skillCatalog)
    await this.insertAll(r, SPECS.ASSIGNMENTS, s.assignments)
    await this.insertAll(r, SPECS.OPPORTUNITIES_ADDED, s.opportunitiesAdded)
    await this.insertAll(r, SPECS.REQUIREMENTS_ADDED, s.requirementsAdded)
    await this.insertAll(r, SPECS.REQUIREMENT_EDITS, Object.entries(s.requirementEdits).map(([requirementId, edit]) => ({ requirementId, edit })))
    await this.insertAll(r, SPECS.REQUIREMENTS_DELETED, [...new Set(s.requirementsDeleted)].map((requirementId) => ({ requirementId })))
    await this.insertAll(r, SPECS.OPPORTUNITY_EDITS, Object.entries(s.opportunityEdits).map(([opportunityId, edit]) => ({ opportunityId, edit })))
    await this.insertAll(r, SPECS.OPPORTUNITY_TIMES, Object.entries(s.opportunityTimes).map(([opportunityId, t]) => ({ opportunityId, ...t })))
    await this.insertAll(r, SPECS.SKILL_REVIEWS, Object.entries(s.skillReviews).map(([employeeCode, reviewedOn]) => ({ employeeCode, reviewedOn })))
    const edits = Object.entries(s.skillEdits).map(([key, proficiency]) => {
      const [employeeCode, skill] = key.split('|')
      return { employeeCode, skill, proficiency }
    })
    await this.insertAll(r, { table: 'skill_edits', cols: [['employeeCode', 'TEXT'], ['skill', 'TEXT'], ['proficiency', 'INTEGER']] }, edits)
    await this.setMeta(r, 'version', String(s.version))
  }

  /**
   * Read the latest edits, apply a change, write them back with the change-log entries — one transaction.
   * The first statement locks the version row, so two servers saving at once queue instead of overwriting.
   */
  async updateRuntime(fn: (s: RuntimeState) => void, audit: AuditEntry[] | ((s: RuntimeState) => AuditEntry[]) = []): Promise<RuntimeState> {
    return this.transaction(async (r) => {
      await r().query(`UPDATE ${this.t('meta')} SET value = value WHERE [key] = 'version'`)
      const next = await this.readRuntimeWith(r)
      fn(next)
      next.version++
      await this.writeRuntimeRows(r, next)
      await this.insertAudit(r, typeof audit === 'function' ? audit(next) : audit)
      return next
    })
  }

  async readAudit(limit: number): Promise<AuditEntry[]> {
    const res = await this.req().input('n', sql.Int, limit).query<Row>(`SELECT TOP (@n) * FROM ${this.t('audit_log')} ORDER BY id DESC`)
    return res.recordset.map((x) => ({
      at: (x.at as Date).toISOString(),
      editor: x.editor as string,
      ip: x.ip as string,
      userAgent: x.user_agent as string,
      opportunityId: x.opportunity_id as string,
      opportunityName: x.opportunity_name as string,
      field: x.field as AuditEntry['field'],
      from: x.from_value === null ? null : JSON.parse(x.from_value as string),
      to: x.to_value === null ? null : JSON.parse(x.to_value as string),
    }))
  }

  /** Changes whenever anyone saves (the version row), so other servers notice and reload. */
  async changeToken() {
    return (await this.getMeta(this.req, 'version')) ?? '0'
  }

  async ping() {
    await this.req().query('SELECT 1')
  }

  // -- first use and data copies ---------------------------------------------------------------------------

  /** Fill the imported-data tables (and optionally the app's edits and log) in one transaction. */
  async seed(data: Dataset, runtime?: RuntimeState, audit: AuditEntry[] = []) {
    await this.transaction(async (r) => {
      await this.insertAll(r, SPECS.EMPLOYEES, data.employees)
      await this.insertAll(r, SPECS.ALLOCATIONS, data.allocations)
      await this.insertAll(r, SPECS.SKILLS, data.skills)
      await this.insertAll(r, SPECS.OPPORTUNITIES, data.opportunities)
      await this.insertAll(r, SPECS.REQUIREMENTS, data.requirements)
      await this.insertAll(r, SPECS.QUALITY, data.quality)
      await this.insertAll(r, SPECS.SOURCES, data.sources)
      await this.insertAll(r, SPECS.SKILL_ONLY, data.skillOnlyEmployees.map((code) => ({ code })))
      if (runtime) await this.writeRuntimeRows(r, runtime)
      // Oldest first, so the identity ids keep the original order.
      await this.insertAudit(r, [...audit].reverse())
      if (!(await this.getMeta(r, 'seeded_at'))) await this.setMeta(r, 'seeded_at', new Date().toISOString())
    })
  }

  /**
   * Fill in what an older or freshly seeded database lacks, as the SQLite backend does: the shipped skills,
   * the client dimension, and created / modified times for every opportunity.
   */
  async migrate() {
    const data = await this.readDataset()
    const state = await this.readRuntime()
    const seededAt = (await this.getMeta(this.req, 'seeded_at')) ?? new Date().toISOString()
    const missingSkills = SKILL_CATALOG.filter((c) => !state.skillCatalog.some((s) => s.skill === c.skill))
    const allOpps = [...data.opportunities, ...state.opportunitiesAdded]
    const needTimes = allOpps.filter((o) => !state.opportunityTimes[o.id])
    const needClients = state.clients.length === 0
    if (!missingSkills.length && !needTimes.length && !needClients) return

    const lastSaved = new Map<string, string>()
    for (const e of await this.readAudit(100_000)) if (!lastSaved.has(e.opportunityId)) lastSaved.set(e.opportunityId, e.at)
    await this.updateRuntime((s) => {
      for (const c of missingSkills) s.skillCatalog.push({ ...c, source: 'catalog', createdAt: seededAt })
      for (const o of needTimes) s.opportunityTimes[o.id] = { createdAt: seededAt, modifiedAt: lastSaved.get(o.id) ?? seededAt }
      if (needClients) {
        const names = new Map<string, { name: string; source: Client['source'] }>()
        for (const [name, source] of [
          ...allOpps.map((o) => [o.account, 'opportunity'] as const),
          ...data.allocations.map((a) => [a.client, 'allocation'] as const),
        ]) {
          const n = name.trim()
          const k = n.toLowerCase()
          if (!n) continue
          const seen = names.get(k)
          // Same rule as SQLite's migration: the alphabetically first source wins.
          if (!seen || source < seen.source) names.set(k, { name: seen?.name ?? n, source })
        }
        s.clients = [...names.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([, c], i) => ({ id: `CL-${String(i + 1).padStart(3, '0')}`, name: c.name, source: c.source, createdAt: seededAt }))
      }
    })
  }
}

export { emptyRuntime }
