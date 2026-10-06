import { useLocation } from 'react-router-dom'
import type { Meta } from '../../../shared/types'
import { api, useApi } from '../../api/client'
import { useStore } from '../../state/store'
import { fmtDate } from '../../engine/format'
import { FractalMark } from './FractalMark'
import { Button } from '../ui/Button'
import { UI_ICON } from '../ui/icons'

const ResetIcon = UI_ICON.reset
const DatabaseIcon = UI_ICON.database
const ChevronDown = UI_ICON.chevronDown

const CURRENT_USER = { name: 'Resource Management', role: 'Supply Chain practice', initials: 'RM' }

/** One line of "where am I" context, derived from the route. */
function routeContext(pathname: string): { eyebrow: string; text: string; sub?: string } {
  const [, section, id] = pathname.split('/')
  switch (section) {
    case '':
      return { eyebrow: 'Leadership overview', text: 'Capacity, demand & gaps' }
    case 'opportunities':
      return id ? { eyebrow: 'Opportunity', text: decodeURIComponent(id), sub: 'requirements & coverage' } : { eyebrow: 'Opportunity pipeline', text: 'Demand from the pipeline' }
    case 'capacity':
      return { eyebrow: 'Capacity & availability', text: 'Now and the next six months' }
    case 'risk':
      return { eyebrow: 'People at risk', text: 'Bench exposure' }
    case 'workbench':
      return { eyebrow: 'Deployment workbench', text: 'Match people to requirements' }
    case 'skills':
      return { eyebrow: 'Skills matrix', text: 'Proficiency & freshness' }
    case 'employees':
      return id ? { eyebrow: 'Employee 360', text: decodeURIComponent(id) } : { eyebrow: 'People', text: 'Supply Chain practice' }
    case 'data':
      return { eyebrow: 'Data', text: 'Sources, synthetic data & quality' }
    default:
      return { eyebrow: 'Workforce', text: 'Supply Chain practice' }
  }
}

export function TopBar() {
  const { state, dispatch } = useStore()
  const { pathname } = useLocation()
  const ctx = routeContext(pathname)
  const meta = useApi<Meta>('/api/meta')

  const reset = async () => {
    await api.post('/api/reset')
    dispatch({ type: 'reset' })
    dispatch({ type: 'toast/show', toast: { title: 'Demo reset', body: 'Deployment decisions, requirement edits and skill reviews cleared. Source and synthetic data are unchanged.' } })
  }

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3 py-3 sm:gap-3.5 sm:px-5">
      <FractalMark />
      <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
      <span className="whitespace-nowrap text-[15px] font-extrabold tracking-[-0.01em] text-ink">Workforce Nexus</span>

      <span className="ml-2 hidden h-7 w-px bg-border md:block" aria-hidden="true" />
      <div className="hidden min-w-0 leading-tight md:block">
        <div className="eyebrow truncate">Snapshot</div>
        <div className="tabular truncate text-[11px] font-bold text-ink">{meta.data ? fmtDate(meta.data.asOf) : '…'} · Supply Chain</div>
      </div>

      <span className="hidden h-7 w-px bg-border lg:block" aria-hidden="true" />
      <div className="hidden min-w-0 leading-tight lg:block">
        <div className="eyebrow truncate">{ctx.eyebrow}</div>
        <div className="truncate text-[11px] font-bold text-ink">
          {ctx.text}
          {ctx.sub && <span className="font-medium text-ink-faint"> · {ctx.sub}</span>}
        </div>
      </div>

      <div className="flex-1" />

      {/* Data scope: every figure in the app recomputes from the chosen records. */}
      <label
        className="relative inline-flex items-center"
        title="Source records only hides the synthetic employees and opportunities. Gap-fill data (skills, requirements, assumed dates) stays and is marked est."
      >
        <span className="sr-only">Data scope</span>
        <span className="pointer-events-none absolute left-2.5 text-ink-faint">
          <DatabaseIcon size={13} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <select
          value={state.scope}
          onChange={(e) => dispatch({ type: 'scope/set', scope: e.target.value === 'source' ? 'source' : 'all' })}
          className="min-h-[32px] cursor-pointer appearance-none rounded-md border border-border-strong bg-surface py-1 pl-8 pr-7 text-xs font-semibold text-ink transition-colors hover:bg-surface-sunken"
        >
          <option value="all">Source + synthetic</option>
          <option value="source">Source records only</option>
        </select>
        <span className="pointer-events-none absolute right-2.5 text-ink-faint">
          <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </label>

      <Button variant="ghost" size="sm" onClick={reset} icon={<ResetIcon size={13} strokeWidth={2.2} aria-hidden="true" />} title="Clear deployment decisions and edits made in the app">
        Reset demo
      </Button>

      <div className="hidden text-right leading-tight xl:block">
        <div className="text-xs font-semibold text-ink">{CURRENT_USER.name}</div>
        <div className="text-[11px] text-ink-faint">{CURRENT_USER.role}</div>
      </div>
      <button type="button" aria-label="Account menu" className="h-[34px] w-[34px] shrink-0 rounded-full bg-brand text-2xs font-bold text-brand-ink">
        {CURRENT_USER.initials}
      </button>
    </header>
  )
}
