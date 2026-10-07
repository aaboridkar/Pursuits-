import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ViewLog } from '../workforce/ViewLog'
import { api } from '../../api/client'
import { useStore } from '../../state/store'
import { FractalMark } from './FractalMark'

const CURRENT_USER = { name: 'Resource Management', role: 'Supply Chain practice', initials: 'RM' }

/** One line of "where am I" context, derived from the route. */
function routeContext(pathname: string): { eyebrow: string; text: string; sub?: string } | null {
  const [, section, id] = pathname.split('/')
  switch (section) {
    case '':
      return { eyebrow: 'Leadership overview', text: 'Capacity, demand & gaps' }
    case 'opportunities':
      return id ? { eyebrow: 'Opportunity', text: decodeURIComponent(id), sub: 'requirements & coverage' } : null
    case 'capacity':
      return { eyebrow: 'Capacity & availability', text: 'Now and the next six months' }
    case 'risk':
      return { eyebrow: 'People at risk', text: 'Bench exposure' }
    case 'workbench':
      return { eyebrow: 'Deployment workbench', text: 'Match people to requirements' }
    case 'skills':
      return { eyebrow: 'Skills matrix', text: 'Proficiency' }
    case 'employees':
      return id ? { eyebrow: 'Employee 360', text: decodeURIComponent(id) } : { eyebrow: 'People', text: 'Supply Chain practice' }
    case 'data':
      return { eyebrow: 'Data', text: 'Sources, synthetic data & quality' }
    default:
      return { eyebrow: 'Workforce', text: 'Supply Chain practice' }
  }
}

export function TopBar() {
  const { pathname } = useLocation()
  const [logOpen, setLogOpen] = useState(false)
  const ctx = routeContext(pathname)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3 py-3 sm:gap-3.5 sm:px-5">
      <FractalMark />
      <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
      <span className="whitespace-nowrap text-[15px] font-extrabold tracking-[-0.01em] text-ink">Pursuits</span>

      <span className="ml-2 hidden h-7 w-px bg-border md:block" aria-hidden="true" />
      <DatabaseStatus />

      {ctx && (
        <>
          <span className="hidden h-7 w-px bg-border lg:block" aria-hidden="true" />
          <div className="hidden min-w-0 leading-tight lg:block">
            <div className="eyebrow truncate">{ctx.eyebrow}</div>
            <div className="truncate text-[11px] font-bold text-ink">
              {ctx.text}
              {ctx.sub && <span className="font-medium text-ink-faint"> · {ctx.sub}</span>}
            </div>
          </div>
        </>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setLogOpen(true)}
        aria-label="View log"
        title="View log — who saved what"
        className="h-[34px] w-[34px] shrink-0 rounded-full bg-brand text-2xs font-bold text-brand-ink transition-colors hover:bg-brand-hover"
      >
        {CURRENT_USER.initials}
      </button>
      <ViewLog open={logOpen} onClose={() => setLogOpen(false)} />
    </header>
  )
}

type Status = { ok: true; lastModified: string | null } | { ok: false; error: string }

/**
 * When the data last changed (the latest created or modified time of any opportunity in the
 * database) and whether the app is connected to it: green when the database answers and live
 * updates are flowing, amber while reconnecting, red when the database can't be reached.
 */
function DatabaseStatus() {
  const { state } = useStore()
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let live = true
    const check = () =>
      api
        .get<Status>('/api/status')
        .then((s) => live && setStatus(s))
        .catch((e: Error) => live && setStatus({ ok: false, error: e.message }))
    check()
    // Re-checked on every save (dataVersion) and every 30s, so a dropped database shows up even when idle.
    const timer = setInterval(check, 30_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [state.dataVersion, state.live])

  const tone = !status ? 'checking' : !status.ok ? 'down' : state.live === 'open' ? 'up' : 'reconnecting'
  const look = {
    checking: { dot: 'bg-ink-faint', label: 'Checking database…' },
    up: { dot: 'bg-good', label: 'Database connected' },
    reconnecting: { dot: 'bg-accent animate-pulse', label: 'Reconnecting…' },
    down: { dot: 'bg-bad', label: 'Database unavailable' },
  }[tone]
  const updated = status?.ok && status.lastModified ? new Date(status.lastModified) : null

  // One line: the dot carries the connection state (spelled out on hover), then when data last changed.
  return (
    <div
      className="hidden min-w-0 items-center gap-1.5 md:flex"
      title={status && !status.ok ? `${look.label}: ${status.error}` : updated ? `${look.label} · last change saved ${updated.toLocaleString()}` : look.label}
      role="status"
      aria-label={look.label}
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} aria-hidden="true" />
      <span className="tabular truncate text-[11px] font-bold text-ink">
        {updated ? `Updated ${updated.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : look.label}
      </span>
    </div>
  )
}