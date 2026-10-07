// Everything the app reads and writes lives in one database: the imported source and synthetic data, what
// users change in the app (opportunity, requirement and skill edits, deployment decisions), the dimension
// tables and the change log. Two backends, chosen by the settings (.env or the environment):
//   • Azure SQL Database (db-mssql.ts) when AZURE_SQL_SERVER is set;
//   • otherwise a SQLite file (db.ts), data/pursuits.db by default.
// The CSVs are only read once, to fill an empty database.
//
// Reads are served from an in-memory copy, reloaded whenever the database changes underneath this server
// (another server or a database tool writing to it), checked every 2 seconds — so every open browser sees
// the same live snapshot.

import type { Assignment, AuditEntry, Client, Opportunity, OpportunityEdit, Requirement, SkillDef } from '../shared/types'
import type { Dataset } from './data/load'
import { DB_FILE, dataVersion, emptyRuntime, openDb, ping, readAudit, readDataset, readRuntime, updateRuntime } from './db'
import { AzureSqlBackend, azureSqlConfigFromEnv } from './db-mssql'

export interface RuntimeState {
  version: number
  assignments: Assignment[]
  requirementsAdded: Requirement[]
  /** Opportunities created in the app (provenance 'app'), alongside the imported ones. */
  opportunitiesAdded: Opportunity[]
  requirementEdits: Record<string, Partial<Requirement>>
  requirementsDeleted: string[]
  /** opportunityId → type, stage, start, months, value, win confidence or lead changed in the app. */
  opportunityEdits: Record<string, OpportunityEdit>
  /** opportunityId → when it was created in the database and last saved. */
  opportunityTimes: Record<string, { createdAt: string; modifiedAt: string }>
  /** The client dimension (dim_client). */
  clients: Client[]
  /** The skill catalogue (dim_skill): the shipped skills plus any added in the app. */
  skillCatalog: SkillDef[]
  /** employeeCode → date the profile was last reviewed in the app. */
  skillReviews: Record<string, string>
  /** `${employeeCode}|${skill}` → proficiency set in the app (0 removes the skill). */
  skillEdits: Record<string, number>
}

type AuditInput = AuditEntry[] | ((s: RuntimeState) => AuditEntry[])

/** What the store needs from a database. Both backends provide it. */
interface Backend {
  name: string
  readDataset(): Promise<Dataset>
  readRuntime(): Promise<RuntimeState>
  updateRuntime(fn: (s: RuntimeState) => void, audit?: AuditInput): Promise<RuntimeState>
  readAudit(limit: number): Promise<AuditEntry[]>
  /** Changes when anyone else writes, so this server knows to reload. */
  changeToken(): Promise<string>
  ping(): Promise<void>
}

function sqliteBackend(): Backend {
  const db = openDb()
  return {
    name: `SQLite ${DB_FILE}`,
    readDataset: async () => readDataset(db),
    readRuntime: async () => readRuntime(db),
    updateRuntime: async (fn, audit = []) => updateRuntime(db, fn, audit),
    readAudit: async (limit) => readAudit(db, limit),
    changeToken: async () => String(dataVersion(db)),
    ping: async () => ping(db),
  }
}

let backend: Backend
let state: RuntimeState = emptyRuntime()
let data: Dataset
let seen = ''
/** Bumped whenever data is reloaded from outside, so cached models built on the old copy are dropped. */
let generation = 0

/** Connect to the configured database and load it. Must finish before the server takes requests. */
export async function initStore() {
  const azure = azureSqlConfigFromEnv()
  backend = azure ? await AzureSqlBackend.open(azure) : sqliteBackend()
  data = await backend.readDataset()
  state = await backend.readRuntime()
  seen = await backend.changeToken()
  setInterval(() => {
    refresh()
      .then((changed) => changed && notify())
      .catch((e) => console.error('Database check failed:', (e as Error).message))
  }, 2000).unref()
  return backend.name
}

const listeners = new Set<(version: number) => void>()
/** Called after every saved change, e.g. to tell open browsers to refresh. Returns an unsubscribe. */
export function onChange(fn: (version: number) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = () => listeners.forEach((fn) => fn(state.version))

/** Reload if anything else has committed to the database since we last looked. */
async function refresh() {
  const token = await backend.changeToken()
  if (token === seen) return false
  const [nextData, nextState] = await Promise.all([backend.readDataset(), backend.readRuntime()])
  data = nextData
  state = nextState
  seen = token
  generation++
  return true
}

export const getState = () => state
export const getData = (): Dataset => data
export const getGeneration = () => generation

/**
 * Apply a change and save it, with any change-log entries, in one transaction. Every save bumps the version
 * so computed models are rebuilt and open browsers refresh. Errors thrown by `fn` cancel the save.
 */
export async function mutate(fn: (s: RuntimeState) => void, audit: AuditInput = []) {
  state = await backend.updateRuntime(fn, audit)
  seen = await backend.changeToken()
  notify()
}

export function resetState() {
  return mutate((s) => Object.assign(s, { ...emptyRuntime(), version: s.version, clients: s.clients, skillCatalog: s.skillCatalog, opportunityTimes: s.opportunityTimes }))
}

export const readAuditLog = (limit: number) => backend.readAudit(limit)

/** Database health and the latest created / modified time across all opportunities. */
export async function dbStatus(): Promise<{ ok: true; lastModified: string | null } | { ok: false; error: string }> {
  try {
    await backend.ping()
    const stamps = Object.values(state.opportunityTimes).flatMap((t) => [t.createdAt, t.modifiedAt])
    return { ok: true, lastModified: stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase()
