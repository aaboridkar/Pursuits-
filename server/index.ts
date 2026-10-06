import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { GRADES, SKILL_CATALOG } from '../shared/catalog'
import type { Assignment, AssignmentStatus, Horizon, Requirement, Scope } from '../shared/types'
import { ROOT, loadDataset } from './data/load'
import { Model } from './engine/model'
import { getState, mutate, newId, resetState } from './store'

const data = loadDataset()
const cache = new Map<string, Model>()

/** The model for this request's scope, rebuilt only when app state has changed. */
function model(req: Request): Model {
  const scope: Scope = req.query.scope === 'source' ? 'source' : 'all'
  const key = `${scope}:${getState().version}`
  let m = cache.get(key)
  if (!m) {
    for (const k of cache.keys()) if (k.startsWith(`${scope}:`)) cache.delete(k)
    m = new Model(data, getState(), scope)
    cache.set(key, m)
  }
  return m
}
const horizon = (req: Request): Horizon => (['now', '1m', '3m', '6m'].includes(String(req.query.horizon)) ? (req.query.horizon as Horizon) : '3m')

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
const need = (cond: unknown, status: number, msg: string) => {
  if (!cond) throw new HttpError(status, msg)
}
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

const app = express()
app.use(express.json())

app.get('/api/meta', (req, res) => res.json(model(req).meta()))
app.get('/api/overview', (req, res) => res.json(model(req).overview(horizon(req))))
app.get('/api/opportunities', (req, res) => res.json(model(req).opportunityViews()))
app.get('/api/opportunities/:id', (req, res) => {
  const o = model(req).opportunityViews().find((x) => x.id === req.params.id)
  need(o, 404, 'Opportunity not found')
  res.json(o)
})
app.get('/api/requirements', (req, res) => res.json(model(req).requirementViews()))
app.get('/api/requirements/:id/candidates', (req, res) => {
  const m = model(req)
  const r = m.requirementViews().find((x) => x.id === req.params.id)
  need(r, 404, 'Requirement not found')
  res.json({ requirement: r, candidates: m.candidates(r!.id) })
})
app.get('/api/capacity', (req, res) => {
  const m = model(req)
  const h = horizon(req)
  res.json({ asOf: m.asOf, horizon: h, rows: m.capacityRows(h), supplyDemand: m.supplyDemand() })
})
app.get('/api/risk', (req, res) => res.json(model(req).risk()))
app.get('/api/skills', (req, res) => res.json(model(req).skillsMatrix()))
app.get('/api/employees', (req, res) => res.json([...model(req).capacity.values()]))
app.get('/api/employees/:code', (req, res) => {
  const e = model(req).employee360(req.params.code)
  need(e, 404, 'Employee not found')
  res.json(e)
})

// --- deployment decisions ---------------------------------------------------------------

app.post('/api/assignments', (req, res) => {
  const { requirementId, employeeCode, fte, status } = req.body ?? {}
  const m = model(req)
  const r = m.requirements.find((x) => x.id === requirementId)
  need(r, 400, 'Unknown requirement')
  need(m.employees.some((e) => e.code === employeeCode), 400, 'Unknown employee')
  need(['proposed', 'confirmed'].includes(status ?? 'proposed'), 400, 'Status must be proposed or confirmed')
  const f = Number(fte ?? r!.fte)
  need(f > 0 && f <= 1, 400, 'FTE must be between 0 and 1')
  need(!getState().assignments.some((a) => a.requirementId === requirementId && a.employeeCode === employeeCode), 409, 'Already assigned to this requirement')
  const now = new Date().toISOString()
  const a: Assignment = { id: newId('ASG'), requirementId, employeeCode, fte: f, status: (status ?? 'proposed') as AssignmentStatus, createdAt: now, updatedAt: now }
  mutate((s) => s.assignments.push(a))
  res.status(201).json(a)
})
app.patch('/api/assignments/:id', (req, res) => {
  const a = getState().assignments.find((x) => x.id === req.params.id)
  need(a, 404, 'Assignment not found')
  const { status, fte } = req.body ?? {}
  need(status === undefined || ['proposed', 'confirmed'].includes(status), 400, 'Status must be proposed or confirmed')
  need(fte === undefined || (Number(fte) > 0 && Number(fte) <= 1), 400, 'FTE must be between 0 and 1')
  mutate(() => {
    if (status) a!.status = status
    if (fte !== undefined) a!.fte = Number(fte)
    a!.updatedAt = new Date().toISOString()
  })
  res.json(a)
})
app.delete('/api/assignments/:id', (req, res) => {
  need(getState().assignments.some((x) => x.id === req.params.id), 404, 'Assignment not found')
  mutate((s) => (s.assignments = s.assignments.filter((x) => x.id !== req.params.id)))
  res.status(204).end()
})

// --- requirements ----------------------------------------------------------------------------

function validateRequirement(body: Partial<Requirement>, partial: boolean) {
  const check = (k: keyof Requirement, ok: boolean, msg: string) => need(partial && body[k] === undefined ? true : ok, 400, msg)
  check('role', typeof body.role === 'string' && body.role.trim().length > 0, 'Role is required')
  check('grade', GRADES.some((g) => g.grade === Number(body.grade)), 'Unknown grade')
  check('fte', Number(body.fte) > 0 && Number(body.fte) <= 10, 'FTE must be between 0 and 10')
  check('scSkill', SKILL_CATALOG.some((s) => s.skill === body.scSkill && s.category === 'Supply Chain'), 'Unknown supply chain skill')
  check('techSkill', SKILL_CATALOG.some((s) => s.skill === body.techSkill && s.category === 'Technical'), 'Unknown technical skill')
  check('start', isDate(body.start), 'Start date must be YYYY-MM-DD')
  check('end', isDate(body.end), 'End date must be YYYY-MM-DD')
  if (body.start && body.end) need(body.end >= body.start, 400, 'End date must be on or after start date')
}
const pickReq = (b: Partial<Requirement>) => ({
  ...(b.role !== undefined && { role: String(b.role).trim() }),
  ...(b.grade !== undefined && { grade: Number(b.grade) }),
  ...(b.fte !== undefined && { fte: Number(b.fte) }),
  ...(b.scSkill !== undefined && { scSkill: b.scSkill }),
  ...(b.techSkill !== undefined && { techSkill: b.techSkill }),
  ...(b.start !== undefined && { start: b.start }),
  ...(b.end !== undefined && { end: b.end }),
})

app.post('/api/opportunities/:id/requirements', (req, res) => {
  const o = data.opportunities.find((x) => x.id === req.params.id)
  need(o, 404, 'Opportunity not found')
  validateRequirement(req.body ?? {}, false)
  const r: Requirement = { id: newId(`${o!.id}-R`), opportunityId: o!.id, ...(pickReq(req.body) as Omit<Requirement, 'id' | 'opportunityId' | 'provenance'>), provenance: 'app' }
  mutate((s) => s.requirementsAdded.push(r))
  res.status(201).json(r)
})
app.patch('/api/requirements/:id', (req, res) => {
  const exists = data.requirements.some((r) => r.id === req.params.id) || getState().requirementsAdded.some((r) => r.id === req.params.id)
  need(exists, 404, 'Requirement not found')
  validateRequirement(req.body ?? {}, true)
  const patch = pickReq(req.body)
  mutate((s) => {
    const added = s.requirementsAdded.find((r) => r.id === req.params.id)
    if (added) Object.assign(added, patch)
    else s.requirementEdits[req.params.id] = { ...s.requirementEdits[req.params.id], ...patch }
  })
  res.json({ ok: true })
})
app.delete('/api/requirements/:id', (req, res) => {
  mutate((s) => {
    s.requirementsAdded = s.requirementsAdded.filter((r) => r.id !== req.params.id)
    if (data.requirements.some((r) => r.id === req.params.id)) s.requirementsDeleted.push(req.params.id)
    s.assignments = s.assignments.filter((a) => a.requirementId !== req.params.id)
  })
  res.status(204).end()
})

// --- skills ------------------------------------------------------------------------------------

app.post('/api/employees/:code/skills/review', (req, res) => {
  const m = model(req)
  need(m.skillsByEmp.has(req.params.code), 404, 'No skill profile for this employee')
  mutate((s) => (s.skillReviews[req.params.code] = m.asOf))
  res.json({ ok: true, reviewedOn: m.asOf })
})
app.put('/api/employees/:code/skills/:skill', (req, res) => {
  const level = Number(req.body?.proficiency)
  need(SKILL_CATALOG.some((s) => s.skill === req.params.skill), 400, 'Unknown skill')
  need([0, 1, 2, 3, 4].includes(level), 400, 'Proficiency must be 0 (remove) to 4')
  mutate((s) => {
    s.skillEdits[`${req.params.code}|${req.params.skill}`] = level
    s.skillReviews[req.params.code] = model(req).asOf
  })
  res.json({ ok: true })
})

app.post('/api/reset', (_req, res) => {
  resetState()
  res.json({ ok: true })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500
  if (status === 500) console.error(err)
  res.status(status).json({ error: err.message })
})

// Serve the built UI when present (npm run build && npm start).
const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4100)
app.listen(port, () => console.log(`Workforce API on http://localhost:${port} · ${data.employees.length} employees · ${data.opportunities.length} opportunities`))
