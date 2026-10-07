// Everything the app reads and writes lives in SQLite (see db.ts): the imported source and
// synthetic data, what users change in the app (deployment decisions, requirement and
// opportunity edits, skill reviews), and the change log. The CSVs are only read once, to seed it.
//
// Reads are served from an in-memory copy that is reloaded whenever the database file changes
// underneath this server (another server or a database tool writing to it), checked on every
// read and every 2 seconds — so every open browser sees the same live snapshot.

import type { Assignment, AuditEntry, Client, Opportunity, SkillDef, OpportunityEdit, Requirement } from '../shared/types'
import type { Dataset } from './data/load'
import { dataVersion, emptyRuntime, openDb, ping, readAudit as readAuditRows, readDataset, readRuntime, updateRuntime } from './db'

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

const db = openDb()
let state = readRuntime(db)
let data = readDataset(db)
let seen = dataVersion(db)
/** Bumped whenever data is reloaded from outside, so cached models built on the old copy are dropped. */
let generation = 0

const listeners = new Set<(version: number) => void>()
/** Called after every saved change, e.g. to tell open browsers to refresh. Returns an unsubscribe. */
export function onChange(fn: (version: number) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = () => listeners.forEach((fn) => fn(state.version))

/** Reload if anything else has committed to the database since we last looked. */
function refresh() {
  const v = dataVersion(db)
  if (v === seen) return false
  seen = v
  state = readRuntime(db)
  data = readDataset(db)
  generation++
  return true
}
setInterval(() => refresh() && notify(), 2000).unref()

export function getState() {
  refresh()
  return state
}
export function getData(): Dataset {
  refresh()
  return data
}
export const getGeneration = () => generation

/**
 * Apply a change and save it, with any change-log entries, in one transaction. Every save bumps
 * the version so computed models are rebuilt and open browsers refresh.
 */
export function mutate(fn: (s: RuntimeState) => void, audit: AuditEntry[] | ((s: RuntimeState) => AuditEntry[]) = []) {
  state = updateRuntime(db, fn, audit)
  notify()
}

export function resetState() {
  mutate((s) => Object.assign(s, { ...emptyRuntime(), version: s.version }))
}

export const readAudit = (limit: number) => readAuditRows(db, limit)

/** Database health and the latest created / modified time across all opportunities. */
export function dbStatus(): { ok: true; lastModified: string | null } | { ok: false; error: string } {
  try {
    ping(db)
    const s = getState()
    const stamps = Object.values(s.opportunityTimes).flatMap((t) => [t.createdAt, t.modifiedAt])
    return { ok: true, lastModified: stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase()
