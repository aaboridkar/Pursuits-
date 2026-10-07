// npm test — checks the engine against facts traced by hand from the source CSVs,
// and that a deployment decision flows through capacity, coverage and risk.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { AuditEntry } from '../../shared/types'
import { applyOpportunityEdit } from '../../shared/opportunityEdit'
import { loadDataset } from '../data/load'
import { openDb, readAudit, readDataset, readRuntime, snake, updateRuntime, type Spec } from '../db'
import { azureSqlConfigFromEnv, fromRow, rowsPerInsert, toParam } from '../db-mssql'
import type { RuntimeState } from '../store'
import { Model } from './model'

const data = loadDataset()
const empty = (): RuntimeState => ({ version: 1, assignments: [], opportunitiesAdded: [], requirementsAdded: [], requirementEdits: {}, requirementsDeleted: [], opportunityEdits: {}, opportunityTimes: {}, clients: [], skillCatalog: [], skillReviews: {}, skillEdits: {} })

test('source population: 11 employees, rows without an employee code excluded', () => {
  const m = new Model(data, empty(), 'source')
  assert.equal(m.employees.length, 11)
  assert.ok(data.quality.some((q) => q.id === 'dq-alloc-missing-code' && q.rows === 2))
  assert.ok(m.employees.every((e) => e.provenance === 'source'))
})

test('bench age and roll-off match the allocation report', () => {
  const m = new Model(data, empty(), 'source')
  const c = (code: string) => m.capacity.get(code)!
  // F17553: billable to 31 Aug, then bench/blocks only → 35 days on 6 Oct.
  assert.equal(c('F17553').status, 'bench')
  assert.equal(c('F17553').benchSince, '2026-09-01')
  assert.equal(c('F17553').benchDays, 35)
  assert.equal(c('F17553').blockedFor, 'Unilever')
  // F07781: parental leave to 15 Sep doesn't count as bench.
  assert.equal(c('F07781').benchSince, '2026-09-16')
  // F00875: 70% internal work in September, 100% bench pools from 1 Oct.
  assert.equal(c('F00875').benchSince, '2026-10-01')
  // F16605: billable on 3M to 9 Oct, client bench from 10 Oct.
  assert.equal(c('F16605').status, 'fully-allocated')
  assert.equal(c('F16605').rollOffDate, '2026-10-10')
  assert.equal(c('F16605').availableFrom, '2026-10-10')
})

test('opportunity fields are derived from monthly revenue before anything is assumed', () => {
  const pepsico = data.opportunities.find((o) => o.id === 'OPP-004')!
  assert.equal(pepsico.estStartDate, '2027-01-04')
  assert.equal(pepsico.months, 2)
  assert.equal(pepsico.confWinning, 0.9) // 103,500 of 115,000
  assert.equal(pepsico.fieldProvenance.confWinning, 'derived')
  const lost = data.opportunities.find((o) => o.id === 'OPP-003')!
  assert.equal(lost.outcome, 'lost')
  assert.equal(lost.probability, 0)
  const philips = data.opportunities.find((o) => o.id === 'OPP-005')!
  assert.equal(philips.value, null) // "$-"
  assert.equal(philips.fieldProvenance.estStartDate, 'synthetic')
})

test('tracker stages map onto the pipeline stage list', () => {
  const oppx104 = data.opportunities.find((o) => o.id === 'OPPX-104')!
  assert.equal(oppx104.stage, 'Problem Understanding') // "Qualification" in the tracker
  assert.equal(oppx104.fieldProvenance.stage, 'derived')
  // The tracker's single "Closed" splits by how the deal ended.
  assert.equal(data.opportunities.find((o) => o.id === 'OPP-001')!.stage, 'Closed - Won') // "SOW signed and WON"
  assert.equal(data.opportunities.find((o) => o.id === 'OPP-003')!.stage, 'Closed - Lost') // "never came through"
})

test('editing an opportunity reweights its revenue and follows its stage', () => {
  const sum = (o: { monthly: { value: number }[] }) => o.monthly.reduce((s, m) => s + m.value, 0)
  const state = empty()
  state.opportunityEdits['OPP-004'] = { confWinning: 0.45, value: 230000 } // Pepsico: 90% of 115,000 = 103,500
  const pepsico = new Model(data, state, 'all').opportunities.find((o) => o.id === 'OPP-004')!
  assert.equal(pepsico.probability, 0.45)
  assert.equal(sum(pepsico), 103500) // half the confidence, twice the value
  assert.equal(pepsico.fieldProvenance.confWinning, 'app')

  state.opportunityEdits['OPP-004'] = { estStartDate: '2027-03-01' } // tracker split Jan 63,000 + Feb 40,500, moved 2 months later
  const moved = new Model(data, state, 'all').opportunities.find((o) => o.id === 'OPP-004')!
  assert.deepEqual(moved.monthly, [{ month: '2027-03', value: 63000 }, { month: '2027-04', value: 40500 }])

  // OPPX-101: tracker split Nov–Mar of 52,889 (680,000 × 70% over 9 months). The page previews
  // unsaved edits with this same function, so these are also the numbers shown before Save.
  const oppx101 = data.opportunities.find((o) => o.id === 'OPPX-101')!
  assert.equal(sum(applyOpportunityEdit(oppx101, { value: 1360000 })), 2 * sum(oppx101)) // value doubled
  assert.ok(Math.abs(sum(applyOpportunityEdit(oppx101, { confWinning: 0.35 })) - sum(oppx101) / 2) <= oppx101.monthly.length) // win halved (each month rounds to a dollar)
  const threeMonths = applyOpportunityEdit(oppx101, { months: 3 }) // re-spread from the start month
  assert.deepEqual(threeMonths.monthly.map((m) => m.month), ['2026-11', '2026-12', '2027-01'])
  assert.equal(threeMonths.monthly[0].value, Math.round((680000 * 0.7) / 3))

  state.opportunityEdits['OPP-004'] = { stage: 'Closed - Won' }
  assert.equal(new Model(data, state, 'all').opportunities.find((o) => o.id === 'OPP-004')!.outcome, 'won')
  state.opportunityEdits['OPP-004'] = { stage: 'Closed - Timed Out' }
  const timedOut = new Model(data, state, 'all').opportunities.find((o) => o.id === 'OPP-004')!
  assert.equal(timedOut.outcome, 'lost')
  assert.equal(timedOut.probability, 0)
  state.opportunityEdits['OPP-003'] = { stage: 'Proposal Submitted', lead: 'A. Lead' } // lost deal reopened
  const reopened = new Model(data, state, 'all').opportunities.find((o) => o.id === 'OPP-003')!
  assert.equal(reopened.outcome, 'open')
  assert.equal(reopened.lead, 'A. Lead')
})

test('the database holds exactly what the CSVs load, and saves edits with their change log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pursuits-'))
  const db = openDb(path.join(dir, 'test.db'), { importLegacy: false })
  try {
    assert.deepEqual(readDataset(db), data)
    const entry: AuditEntry = { at: '2026-10-07T09:00:00.000Z', editor: 'Tester', ip: '10.0.0.5', userAgent: 'test', opportunityId: 'OPP-006', opportunityName: 'x', field: 'value', from: 32000, to: 45000 }
    const before = readRuntime(db)
    assert.ok(before.opportunityTimes['OPP-006']?.createdAt, 'every imported opportunity gets a created time')
    const saved = updateRuntime(db, (s) => (s.opportunityEdits['OPP-006'] = { value: 45000, lead: 'A. Lead' }), [entry])
    assert.deepEqual(readRuntime(db), saved)
    assert.equal(saved.version, before.version + 1)
    assert.deepEqual(readAudit(db, 10), [entry])
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Azure SQL settings, row conversion and batching', () => {
  // Settings: off unless AZURE_SQL_SERVER is set; Entra by default; SQL login needs both user and password.
  assert.equal(azureSqlConfigFromEnv({}), null)
  const entra = azureSqlConfigFromEnv({ AZURE_SQL_SERVER: 'srv.database.windows.net', AZURE_SQL_DATABASE: 'db' })!
  assert.deepEqual([entra.auth, entra.schema], ['entra', 'AIT_SC_Gov'])
  assert.throws(() => azureSqlConfigFromEnv({ AZURE_SQL_SERVER: 's', AZURE_SQL_DATABASE: 'db', AZURE_SQL_AUTH: 'sql', AZURE_SQL_USER: 'u' }), /AZURE_SQL_PASSWORD/)
  assert.throws(() => azureSqlConfigFromEnv({ AZURE_SQL_SERVER: 's', AZURE_SQL_DATABASE: 'db', AZURE_SQL_SCHEMA: 'x; DROP' }), /AZURE_SQL_SCHEMA/)

  // A record survives the trip to SQL Server types and back: DATE, DATETIME2, JSON, numbers, optional columns.
  const spec = { table: 't', cols: [['estStartDate', 'TEXT'], ['createdAt', 'TEXT'], ['monthly', 'JSON'], ['value', 'REAL'], ['basis', 'TEXT']] as Spec['cols'], optional: ['basis'] }
  const rec = { estStartDate: '2026-11-01', createdAt: '2026-10-07T09:34:41.582Z', monthly: [{ month: '2026-11', value: 52889 }], value: 680000 }
  const asStored = Object.fromEntries(spec.cols.map(([p, t]) => [snake(p), toParam(p, t, (rec as Record<string, unknown>)[p]).value]))
  assert.ok(asStored.est_start_date instanceof Date && asStored.created_at instanceof Date)
  assert.equal(typeof asStored.monthly, 'string')
  assert.deepEqual(fromRow(asStored, spec), rec) // 'basis' was NULL and is optional, so it is left off

  // One INSERT stays under SQL Server's 2,100 parameters and 1,000 rows.
  assert.equal(rowsPerInsert(21), 95)
  assert.equal(rowsPerInsert(1), 1000)
  assert.ok(rowsPerInsert(18) * 18 <= 2100)
})

test('a one-person seat on a multi-FTE requirement is judged per seat', () => {
  const m = new Model(data, empty(), 'all')
  const c = m.candidates('OPP-002-R3').find((x) => x.code === 'FX20010')! // on bench, 2-FTE requirement
  assert.equal(c.availability, 100)
})

test('confirming a deployment updates coverage, capacity and risk', () => {
  const before = new Model(data, empty(), 'all')
  const req = before.requirementViews().find((r) => r.id === 'OPP-002-R4')! // Planning analyst G8, from 19 Nov
  assert.equal(req.coverage, 'unfilled')
  const freeBefore = before.supplyDemand().find((x) => x.month === '2026-12')!.supplyFte

  const state = empty()
  state.assignments.push({ id: 'T1', requirementId: 'OPP-002-R4', employeeCode: 'FX20026', fte: 1, status: 'confirmed', createdAt: '', updatedAt: '' })
  const after = new Model(data, state, 'all')
  const r = after.requirementViews().find((x) => x.id === 'OPP-002-R4')!
  assert.equal(r.coverage, 'filled')
  assert.equal(r.unmetFte, 0)
  const freeAfter = after.supplyDemand().find((x) => x.month === '2026-12')!.supplyFte
  assert.ok(Math.abs(freeBefore - freeAfter - 1) < 0.05, `December supply should drop by 1 FTE (${freeBefore} → ${freeAfter})`)
  const risk = after.risk().find((x) => x.code === 'FX20026')!
  assert.ok(risk.reasons.some((x) => x.startsWith('Confirmed for')))
  assert.ok(after.employee360('FX20026')!.projects.some((p) => p.provenance === 'app'))
})

test('a proposal holds no capacity', () => {
  const state = empty()
  state.assignments.push({ id: 'T2', requirementId: 'OPP-002-R4', employeeCode: 'FX20026', fte: 1, status: 'proposed', createdAt: '', updatedAt: '' })
  const m = new Model(data, state, 'all')
  const r = m.requirementViews().find((x) => x.id === 'OPP-002-R4')!
  assert.equal(r.coverage, 'proposed')
  assert.equal(r.unmetFte, 1)
})

test('source scope drops synthetic opportunities and their requirements', () => {
  const m = new Model(data, empty(), 'source')
  assert.ok(m.opportunities.every((o) => o.provenance === 'source'))
  assert.ok(m.requirements.every((r) => r.opportunityId.startsWith('OPP-')))
})
