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

  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border bg-surface py-4">
      {destinations.map((d) => {
        const Icon = d.icon
        const isActive = d.prefix === '/' ? pathname === '/' : pathname.startsWith(d.prefix)
        return (
          <NavLink
            key={d.to}
            to={d.to}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex w-[62px] flex-col items-center gap-1 rounded-md py-2 text-center text-[10.5px] font-semibold transition-colors ${
              isActive ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-surface-sunken hover:text-ink-muted'
            }`}
          >
            <span className="relative">
              <Icon size={19} strokeWidth={2} aria-hidden="true" />
              {d.badge > 0 && (
                <span className="tabular absolute -right-1.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-bad px-[3px] text-[9px] font-bold text-white">
                  {d.badge}
                </span>
              )}
            </span>
            <span className="leading-[1.15]">{d.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
