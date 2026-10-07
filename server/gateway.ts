// Forwarding mode, for running the screens on Azure App Service while the Pursuits server and its SQLite
// database live on a VM. Serves the built UI and passes every /api request — including the live-update
// stream — through to API_UPSTREAM (e.g. http://10.17.131.7:4100). Opens no database of its own.
//
// Started by server/start.ts when API_UPSTREAM is set.

import express from 'express'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const upstream = new URL(process.env.API_UPSTREAM!)
if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error(`API_UPSTREAM must be an http(s) URL (got ${process.env.API_UPSTREAM})`)
/** Shared with the VM's GATEWAY_KEY: the VM only answers requests carrying it. */
const key = process.env.GATEWAY_KEY ?? ''
if (!key) console.warn('GATEWAY_KEY is not set — the VM will accept requests from anyone who can reach it.')

const app = express()

app.use('/api', (req, res) => {
  const target = new URL(req.originalUrl, upstream)
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  // The caller's address for the change log: keep what Azure's front end recorded, else the socket's.
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? ''
  // Only this gateway may vouch for itself; drop any copy a browser sent.
  delete headers['x-pursuits-gateway-key']
  // Signed-in names come from App Service Authentication, which strips forged copies only when it is on
  // (App Service then sets WEBSITE_AUTH_ENABLED). Otherwise drop them, so nobody can log under another name.
  if (process.env.WEBSITE_AUTH_ENABLED?.toLowerCase() !== 'true') {
    for (const h of Object.keys(headers)) if (h.startsWith('x-ms-client-principal')) delete headers[h]
  }
  if (key) headers['x-pursuits-gateway-key'] = key

  const send = (target.protocol === 'https:' ? https : http).request(target, { method: req.method, headers }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
    // Piped as it arrives, so the live-update stream (text/event-stream) reaches the browser unbuffered.
    upstreamRes.pipe(res)
  })
  send.setTimeout(30_000, () => {
    // Long-lived live-update streams are kept alive by the VM's 25s pings; anything else silent for 30s has failed.
    if (!res.headersSent) send.destroy(new Error('timed out'))
  })
  send.on('error', (e: NodeJS.ErrnoException) => {
    if (res.headersSent) return res.end()
    // A refused connection carries its reason in `code` (ECONNREFUSED, ETIMEDOUT…) with an empty message.
    res.status(502).json({ error: `Database server unreachable (${upstream.host}): ${e.code ?? e.message}` })
  })
  // Browser gone (tab closed, page changed): stop the matching request to the VM.
  res.on('close', () => send.destroy())
  req.pipe(send)
})

// The built screens; any other path is a page of the app.
const dist = path.join(ROOT, 'dist')
if (!fs.existsSync(dist)) throw new Error('dist/ is missing — run "npm run build" first')
app.use(express.static(dist))
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))

const port = Number(process.env.PORT ?? 8080)
app.listen(port, () => console.log(`Pursuits gateway on http://localhost:${port} → data from ${upstream.origin}`))
