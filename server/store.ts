// What users change in the app: deployment decisions, requirements added or
// edited on an opportunity, and skill-profile reviews. Persisted as JSON in
// data/runtime/ so it survives restarts; the CSVs are never written to.

import fs from 'node:fs'
import path from 'node:path'
import type { Assignment, Requirement } from '../shared/types'
import { ROOT } from './data/load'

const FILE = process.env.WCD_STATE_FILE ?? path.join(ROOT, 'data', 'runtime', 'state.json')

export interface RuntimeState {
  version: number
  assignments: Assignment[]
  requirementsAdded: Requirement[]
  requirementEdits: Record<string, Partial<Requirement>>
  requirementsDeleted: string[]
  /** employeeCode → date the profile was last reviewed in the app. */
  skillReviews: Record<string, string>
  /** `${employeeCode}|${skill}` → proficiency set in the app (0 removes the skill). */
  skillEdits: Record<string, number>
}

const empty = (): RuntimeState => ({
  version: 1,
  assignments: [],
  requirementsAdded: [],
  requirementEdits: {},
  requirementsDeleted: [],
  skillReviews: {},
  skillEdits: {},
})

let state: RuntimeState = read()

function read(): RuntimeState {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }
  } catch {
    return empty()
  }
}

function persist() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2))
}

export const getState = () => state

/** Apply a change and persist it. Every mutation bumps the version so computed models are invalidated. */
export function mutate(fn: (s: RuntimeState) => void) {
  fn(state)
  state.version++
  persist()
}

export function resetState() {
  state = { ...empty(), version: state.version + 1 }
  persist()
}

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase()
