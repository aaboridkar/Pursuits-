import type { Domain } from '../../data/types'
import { DOMAIN_META } from './domainMeta'

/**
 * Domain identity — always icon + spelled label, soft tint only, never a
 * solid fill and never placed on an interactive control (c1 is brand blue;
 * a filled Demand chip would read as "act here"). Never shares a table
 * cell with a status Badge — see design-system.md §7, collision 1 & 2.
 */
export function DomainChip({ domain }: { domain: Domain }) {
 const meta = DOMAIN_META[domain]
 const Icon = meta.icon
 return (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold whitespace-nowrap ${meta.soft} ${meta.text}`}>
   <Icon size={12} strokeWidth={2.3} aria-hidden="true" />
   {meta.label}
  </span>
 )
}

