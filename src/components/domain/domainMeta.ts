import type { Domain } from '../../data/types'
import { DOMAIN_ICON } from '../ui/icons'

// Planning domain — the demo's stable, non-sequential categorical dimension.
// c1–c5 map here, never to cycle stage or agent (see design-system.md §7).
export const DOMAIN_META: Record<Domain, { label: string; text: string; soft: string; icon: (typeof DOMAIN_ICON)[Domain] }> = {
 demand: { label: 'Demand', text: 'text-c1', soft: 'bg-c1-soft', icon: DOMAIN_ICON.demand },
 supply: { label: 'Supply', text: 'text-c2', soft: 'bg-c2-soft', icon: DOMAIN_ICON.supply },
 inventory: { label: 'Inventory', text: 'text-c3', soft: 'bg-c3-soft', icon: DOMAIN_ICON.inventory },
 capacity: { label: 'Capacity', text: 'text-c4', soft: 'bg-c4-soft', icon: DOMAIN_ICON.capacity },
 finance: { label: 'Finance', text: 'text-c5', soft: 'bg-c5-soft', icon: DOMAIN_ICON.finance },
}

