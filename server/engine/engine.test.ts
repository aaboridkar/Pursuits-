// npm test — checks the engine against facts traced by hand from the source CSVs,
// and that a deployment decision flows through capacity, coverage and risk.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadDataset } from '../data/load'
import type { RuntimeState } from '../store'
import { Model } from './model'

const data = loadDataset()
const empty = (): RuntimeState => ({ version: 1, assignments: [], requirementsAdded: [], requirementEdits: {}, requirementsDeleted: [], skillReviews: {}, skillEdits: {} })

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
