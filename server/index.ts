import express, { type NextFunction, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GRADES, OPPORTUNITY_STAGES, OPPORTUNITY_TYPES, SKILL_CATALOG, stageOutcome } from '../shared/catalog'
import { probabilityOf, spreadMonthly } from '../shared/opportunityEdit'
import type { Assignment, AssignmentStatus, AuditEntry, Horizon, Opportunity, OpportunityEdit, Requirement, Scope } from '../shared/types'
import { ROOT } from './data/load'
import { DB_FILE } from './db'
import { Model } from './engine/model'
import { dbStatus, getData, getGeneration, getState, mutate, newId, onChange, readAudit, resetState } from './store'

const cache = new Map<string, Model>()

/** The model for this request's scope, rebuilt only when the data in the database has changed. */
function model(req: Request): Model {
  const scope: Scope = req.query.scope === 'source' ? 'source' : 'all'
  const key = `${scope}:${getState().version}:${getGeneration()}`
  let m = cache.get(key)
  if (!m) {
    for (const k of cache.keys()) if (k.startsWith(`${scope}:`)) cache.delete(k)
    m = new Model(getData(), getState(), scope)
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
// Behind a reverse proxy (Azure App Service, a load balancer) the caller's address arrives in X-Forwarded-For.
// Set TRUST_PROXY=1 there; never on a server reached directly, or anyone could forge the header.
const behindProxy = ['1', 'true'].includes(String(process.env.TRUST_PROXY).toLowerCase())
if (behindProxy) app.set('trust proxy', true)
app.use(express.json())

// When the screens are served by a gateway (App Service in forwarding mode) set the same GATEWAY_KEY on both:
// this server then answers only requests the gateway forwarded, so nobody can reach the data — or forge the
// signed-in name the change log records — by calling this machine directly.
const gatewayKey = process.env.GATEWAY_KEY ?? ''
if (gatewayKey) {
  const expected = Buffer.from(gatewayKey)
  app.use('/api', (req, res, next) => {
    const given = Buffer.from(String(req.headers['x-pursuits-gateway-key'] ?? ''))
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next()
    res.status(401).json({ error: 'Only the Pursuits gateway may call this server' })
  })
}

app.get('/api/meta', (req, res) => res.json(model(req).meta()))
app.get('/api/overview', (req, res) => res.json(model(req).overview(horizon(req))))
app.get('/api/opportunities', (req, res) => res.json(model(req).opportunityViews()))
app.get('/api/opportunities/:id', (req, res) => {
  const o = model(req).opportunityViews().find((x) => x.id === req.params.id)
  need(o, 404, 'Opportunity not found')
  res.json(o)
})
/** A checked, normalised opportunity edit, or a 400 naming the first bad field. */
function validateOpportunityEdit(body: Record<string, unknown>): OpportunityEdit {
  const { type, stage, estStartDate, months, value, confWinning, lead } = body
  need(estStartDate === undefined || isDate(estStartDate), 400, 'Start date must be YYYY-MM-DD')
  need(type === undefined || OPPORTUNITY_TYPES.includes(type as string), 400, 'Unknown opportunity type')
  need(stage === undefined || OPPORTUNITY_STAGES.includes(stage as string), 400, 'Unknown stage')
  need(months === undefined || (Number.isInteger(months) && (months as number) >= 1 && (months as number) <= 60), 400, 'Months must be a whole number from 1 to 60')
  need(value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0), 400, 'Value must be a positive amount')
  need(confWinning === undefined || (typeof confWinning === 'number' && confWinning >= 0 && confWinning <= 1), 400, 'Win probability must be between 0 and 1')
  need(lead === undefined || lead === null || (typeof lead === 'string' && lead.length <= 80), 400, 'Lead must be at most 80 characters')
  return {
    ...(type !== undefined && { type: type as string }),
    ...(stage !== undefined && { stage: stage as string }),
    ...(estStartDate !== undefined && { estStartDate: estStartDate as string }),
    ...(months !== undefined && { months: months as number }),
    ...(value !== undefined && { value: value as number | null }),
    ...(confWinning !== undefined && { confWinning: confWinning as number }),
    ...(lead !== undefined && { lead: (lead as string | null)?.trim() || null }),
  }
}

/** The caller's address; IPv4 clients arrive IPv4-mapped (::ffff:10.0.0.5) on a dual-stack socket. */
const clientIp = (req: Request) =>
  (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '').replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1') // Azure adds the client's port

/**
 * Who to record in the change log: the signed-in user's name when App Service Authentication (Easy Auth)
 * sits in front and vouches for it — only trusted behind the proxy — otherwise the IP address.
 */
const editorOf = (req: Request) => {
  const principal = behindProxy ? req.headers['x-ms-client-principal-name'] : undefined
  return typeof principal === 'string' && principal.trim() ? principal.trim() : clientIp(req)
}

// Saves a batch of opportunity edits together, and logs every changed field with who made it.
app.post('/api/opportunities/edits', (req, res) => {
  const raw = req.body?.edits
  need(raw && typeof raw === 'object' && Object.keys(raw).length > 0, 400, 'Nothing to save')
  const current = new Map(model(req).opportunities.map((o) => [o.id, o]))
  // Validate everything before writing anything, so a bad field never leaves a half-saved batch.
  const edits = Object.entries(raw as Record<string, Record<string, unknown>>).map(([id, body]) => {
    need(current.has(id), 404, `Opportunity ${id} not found`)
    return [id, validateOpportunityEdit(body ?? {})] as const
  })
  const at = new Date().toISOString()
  // Saves are attributed to the caller's IP address; no name is asked for.
  const ip = clientIp(req)
  const who = { editor: editorOf(req), ip, userAgent: String(req.headers['user-agent'] ?? '') }
  const log: AuditEntry[] = []
  for (const [id, edit] of edits) {
    const o = current.get(id)!
    for (const [field, to] of Object.entries(edit) as [keyof OpportunityEdit, string | number | null][]) {
      const from = (o[field] ?? null) as string | number | null
      if (from !== to) log.push({ at, ...who, opportunityId: id, opportunityName: o.name, field, from, to })
    }
  }
  mutate((s) => {
    for (const [id, edit] of edits) {
      s.opportunityEdits[id] = { ...s.opportunityEdits[id], ...edit }
      s.opportunityTimes[id] = { createdAt: s.opportunityTimes[id]?.createdAt ?? at, modifiedAt: at }
    }
  }, log)
  res.json({ ok: true, changes: log.length })
})
// A new opportunity entered in the app. Its ID continues the tracker's numbering (OPP-007, …).
app.post('/api/opportunities', (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const account = text(b.account)
  const name = text(b.name)
  need(account.length > 0 && account.length <= 80, 400, 'Account is required (up to 80 characters)')
  need(name.length > 0 && name.length <= 120, 400, 'Opportunity name is required (up to 120 characters)')
  need(b.type !== undefined && b.stage !== undefined && b.estStartDate !== undefined && b.months !== undefined && b.confWinning !== undefined && b.value !== undefined, 400, 'Type, stage, start month, months, value and win % are required')
  // The lead is picked from the employee master (dim_employee) by code.
  need(getData().employees.some((e) => e.code === text(b.lead)), 400, 'Lead must be an employee from the employee master')
  need(text(b.status).length > 0, 400, 'Description is required')
  const edit = validateOpportunityEdit(b)
  const status = text(b.status).slice(0, 300)
  const ip = clientIp(req)
  const at = new Date().toISOString()

  let created: Opportunity | undefined
  mutate((s) => {
    // Numbered inside the save, so two people adding at once can't get the same ID.
    const taken = [...getData().opportunities, ...s.opportunitiesAdded].map((o) => /^OPP-(\d+)$/.exec(o.id)?.[1]).filter(Boolean).map(Number)
    const id = `OPP-${String(Math.max(0, ...taken) + 1).padStart(3, '0')}`
    // The account comes from the client dimension; a client not in it yet is added (CL-0NN, source 'app').
    let client = s.clients.find((c) => c.name.toLowerCase() === account.toLowerCase())
    if (!client) {
      const n = Math.max(0, ...s.clients.map((c) => Number(/^CL-(\d+)$/.exec(c.id)?.[1] ?? 0))) + 1
      client = { id: `CL-${String(n).padStart(3, '0')}`, name: account, source: 'app', createdAt: at }
      s.clients.push(client)
    }
    const base: Opportunity = {
      id, sno: null, account: client.name, name, type: edit.type!, stage: edit.stage!, proposalDate: null, estStartDate: edit.estStartDate!,
      months: edit.months!, value: edit.value ?? 0, confWinning: edit.confWinning!, confThisQuarter: null, confNextQuarter: null,
      status, lead: edit.lead ?? null, outcome: stageOutcome(edit.stage!), probability: 0, monthly: [], provenance: 'app', fieldProvenance: {}, notes: [],
    }
    base.probability = probabilityOf(base)
    base.monthly = spreadMonthly(base)
    created = base
    s.opportunitiesAdded.push(base)
    s.opportunityTimes[id] = { createdAt: at, modifiedAt: at }
  }, () => [{ at, editor: editorOf(req), ip, userAgent: String(req.headers['user-agent'] ?? ''), opportunityId: created!.id, opportunityName: name, field: 'created', from: null, to: name }])
  res.status(201).json(created)
})
// Saves a batch of skill levels together (`${employeeCode}|${skill}` → 0 none … 4 Expert), logging each
// change with the caller's IP — the same staged Save as opportunity edits.
app.post('/api/skills/edits', (req, res) => {
  const raw = req.body?.edits
  need(raw && typeof raw === 'object' && !Array.isArray(raw), 400, 'Edits must be an object of "employeeCode|skill" → level')
  const entries = Object.entries(raw as Record<string, unknown>)
  need(entries.length > 0, 400, 'Nothing to save')
  need(entries.length <= 500, 400, 'Too many changes in one save (500 at most)')
  const m = model(req)
  // Everyone in the employee master, plus people known only from Skills.csv.
  const codes = new Set([...getData().employees.map((e) => e.code), ...getData().skillOnlyEmployees])
  // Everything is checked before anything is written, so a bad entry never leaves a half-saved batch.
  const edits = entries.map(([key, level]) => {
    const parts = key.split('|')
    need(parts.length === 2 && parts[0].trim() !== '' && parts[1].trim() !== '', 400, `"${key}" is not an "employeeCode|skill" key`)
    const [code, skill] = parts
    need(codes.has(code), 404, `Employee ${code} is not in the employee master`)
    need(m.catalog.some((s) => s.skill === skill), 400, `"${skill}" is not a skill in the catalogue`)
    need(typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= 4, 400, `Level for ${code} · ${skill} must be a whole number from 0 (remove) to 4`)
    const current = m.skillsByEmp.get(code)?.find((s) => s.skill === skill)?.proficiency ?? 0
    return { key, code, skill, level: level as number, current }
  })
  const at = new Date().toISOString()
  const ip = clientIp(req)
  const log: AuditEntry[] = edits
    .filter((e) => e.level !== e.current)
    .map((e) => ({ at, editor: editorOf(req), ip, userAgent: String(req.headers['user-agent'] ?? ''), opportunityId: e.code, opportunityName: e.skill, field: 'skill', from: e.current, to: e.level }))
  mutate((s) => {
    for (const e of edits) s.skillEdits[e.key] = e.level
  }, log)
  res.json({ ok: true, changes: log.length })
})
// Adds a skill to the catalogue (dim_skill). It becomes a matrix column for everyone; people are rated on it
// in the Skill rating tab. Names are unique ignoring case; the category is one of the three sections.
app.post('/api/skills', (req, res) => {
  const skill = typeof req.body?.skill === 'string' ? req.body.skill.trim().replace(/\s+/g, ' ') : ''
  const category = req.body?.category
  need(skill.length >= 2 && skill.length <= 60, 400, 'Skill name must be 2–60 characters')
  need(!/[|<>]/.test(skill), 400, 'Skill name cannot contain | < or >')
  need(['Supply Chain', 'Data Science', 'FDE'].includes(category), 400, 'Category must be Supply chain, Data Science or FDE')
  need(!model(req).catalog.some((s) => s.skill.toLowerCase() === skill.toLowerCase()), 409, `"${skill}" is already in the catalogue`)
  const at = new Date().toISOString()
  const ip = clientIp(req)
  mutate(
    (s) => {
      need(!s.skillCatalog.some((x) => x.skill.toLowerCase() === skill.toLowerCase()), 409, `"${skill}" is already in the catalogue`)
      s.skillCatalog.push({ skill, category, family: `app:${skill.toLowerCase()}`, source: 'app', createdAt: at })
    },
    [{ at, editor: editorOf(req), ip, userAgent: String(req.headers['user-agent'] ?? ''), opportunityId: 'Catalogue', opportunityName: skill, field: 'skill-created', from: null, to: category }],
  )
  res.status(201).json({ skill, category })
})
// The client dimension (dim_client), A–Z — the Account choices when adding an opportunity.
app.get('/api/clients', (_req, res) => res.json([...getState().clients].sort((a, b) => a.name.localeCompare(b.name))))
// Database health and the latest created / modified time of any opportunity, for the top bar.
app.get('/api/status', (_req, res) => {
  const s = dbStatus()
  res.status(s.ok ? 200 : 503).json(s)
})
app.get('/api/audit', (req, res) => res.json(readAudit(Math.min(1000, Number(req.query.limit) || 200))))
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
  // mutate hands over a fresh copy read from the database, so change the assignment found in it.
  let updated: Assignment | undefined
  mutate((s) => {
    updated = s.assignments.find((x) => x.id === req.params.id)
    need(updated, 404, 'Assignment not found')
    if (status) updated!.status = status
    if (fte !== undefined) updated!.fte = Number(fte)
    updated!.updatedAt = new Date().toISOString()
  })
  res.json(updated)
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
  check('techSkill', SKILL_CATALOG.some((s) => s.skill === body.techSkill && s.category !== 'Supply Chain'), 'Unknown technical skill')
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
  const o = model(req).opportunities.find((x) => x.id === req.params.id)
  need(o, 404, 'Opportunity not found')
  validateRequirement(req.body ?? {}, false)
  const r: Requirement = { id: newId(`${o!.id}-R`), opportunityId: o!.id, ...(pickReq(req.body) as Omit<Requirement, 'id' | 'opportunityId' | 'provenance'>), provenance: 'app' }
  mutate((s) => s.requirementsAdded.push(r))
  res.status(201).json(r)
})
app.patch('/api/requirements/:id', (req, res) => {
  const exists = getData().requirements.some((r) => r.id === req.params.id) || getState().requirementsAdded.some((r) => r.id === req.params.id)
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
    if (getData().requirements.some((r) => r.id === req.params.id)) s.requirementsDeleted.push(req.params.id)
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

// Live updates: each open browser holds one of these streams and refetches when told data changed.
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  res.write(`event: hello\ndata: ${getState().version}\n\n`)
  const off = onChange((version) => res.write(`event: changed\ndata: ${version}\n\n`))
  // A comment line every 25s keeps proxies and idle timeouts from closing the stream.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    off()
    clearInterval(ping)
  })
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

// In dev the Vite proxy targets API_PORT (default 4100), so an inherited PORT must not move the API.
const isDev = process.argv.includes('--dev')
const port = Number(process.env.API_PORT ?? (isDev ? undefined : process.env.PORT) ?? 4100)
app.listen(port, () => console.log(`Workforce API on http://localhost:${port} · ${getData().employees.length} employees · ${getData().opportunities.length} opportunities · database ${DB_FILE}`))
