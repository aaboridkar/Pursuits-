import { NavLink, useLocation } from 'react-router-dom'
import { NAV_ICON } from '../ui/icons'
import { useApi } from '../../api/client'
import type { Overview, PersonAtRisk } from '../../../shared/types'

/** Every destination in the app is reachable here — no screen is URL-only. */
export function LeftRail() {
  const { pathname } = useLocation()
  const overview = useApi<Overview>('/api/overview?horizon=3m')
  const risk = useApi<PersonAtRisk[]>('/api/risk')

  const critical = overview.data?.alerts.filter((a) => a.severity === 'critical').length ?? 0
  const highRisk = risk.data?.filter((r) => r.risk === 'high').length ?? 0

  const destinations = [
    // The Overview badge counts critical alerts: what needs leadership right now.
    { to: '/', prefix: '/', label: 'Overview', icon: NAV_ICON.overview, badge: critical },
    { to: '/opportunities', prefix: '/opportunities', label: 'Pipeline', icon: NAV_ICON.pipeline, badge: 0 },
    { to: '/capacity', prefix: '/capacity', label: 'Capacity', icon: NAV_ICON.capacity, badge: 0 },
    // At Risk counts people at high risk of staying on the bench.
    { to: '/risk', prefix: '/risk', label: 'At Risk', icon: NAV_ICON.risk, badge: highRisk },
    { to: '/workbench', prefix: '/workbench', label: 'Workbench', icon: NAV_ICON.workbench, badge: 0 },
    { to: '/skills', prefix: '/skills', label: 'Skills', icon: NAV_ICON.skills, badge: 0 },
    { to: '/employees', prefix: '/employees', label: 'People', icon: NAV_ICON.people, badge: 0 },
    { to: '/data', prefix: '/data', label: 'Data', icon: NAV_ICON.data, badge: 0 },
  ]

  // Collapsed to icons; expands over the page (not pushing it) while hovered or keyboard-focused, and
  // collapses again on its own. The short delay on expanding stops it flickering open when the
  // pointer only passes across.
  return (
    <div className="relative w-[52px] shrink-0">
      <nav className="group absolute inset-y-0 left-0 z-40 flex w-[52px] flex-col gap-1 overflow-y-auto overflow-x-hidden border-r border-border bg-surface py-3 transition-[width,box-shadow] delay-0 duration-150 hover:w-[184px] hover:shadow-lg hover:delay-150 has-focus-visible:w-[184px] has-focus-visible:shadow-lg">
        {destinations.map((d) => {
          const Icon = d.icon
          const isActive = d.prefix === '/' ? pathname === '/' : pathname.startsWith(d.prefix)
          return (
            <NavLink
              key={d.to}
              to={d.to}
              aria-current={isActive ? 'page' : undefined}
              className={`mx-1.5 flex h-10 shrink-0 items-center gap-3 rounded-md px-[9px] text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                isActive ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-surface-sunken hover:text-ink-muted'
              }`}
            >
              <span className="relative shrink-0">
                <Icon size={19} strokeWidth={2} aria-hidden="true" />
                {d.badge > 0 && (
                  <span className="tabular absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-bad px-[3px] text-[9px] font-bold text-white">
                    {d.badge}
                  </span>
                )}
              </span>
              <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-150 group-has-focus-visible:opacity-100">{d.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
