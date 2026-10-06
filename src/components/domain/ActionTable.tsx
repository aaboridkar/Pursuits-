import { Link } from 'react-router-dom'
import type { Action } from '../../data/types'
import { CYCLE_BY_ID } from '../../data'
import { fmtDate } from '../../engine/format'
import { Badge } from '../ui/Badge'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../ui/table'
import { ActionStatusBadge } from './StatusBadges'

interface ActionTableProps {
 /** Actions with their effective status already applied (see selectors). */
 actions: Action[]
 /** Hide the owner column for a narrow placement (owner moves into the sub-line). */
 compact?: boolean
}

const STATUS_ORDER: Record<Action['status'], number> = { overdue: 0, open: 1, 'in-progress': 2, done: 3 }

/** A short list of actions — newest-generated first, then by urgency. Always sits inside a <Card>. */
export function ActionTable({ actions, compact }: ActionTableProps) {
 const rows = [...actions].sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.dueDate.localeCompare(b.dueDate))

 return (
  <div className="scroll-x">
   <table className="w-full border-collapse">
    <thead>
     <tr>
      <th className={TABLE_TH}>Action</th>
      {!compact && <th className={TABLE_TH}>Owner</th>}
      <th className={TABLE_TH}>Due</th>
      <th className={TABLE_TH}>Status</th>
     </tr>
    </thead>
    <tbody>
     {rows.map((a) => (
      <tr key={a.id} className={`${TABLE_ROW} ${a.isNew ? 'bg-warn-soft/60' : ''}`}>
       <td className={TABLE_TD_STRONG}>
        <div className="flex flex-wrap items-center gap-1.5">
         <span>{a.title}</span>
         {a.isNew && (
          <Badge tone="yellow" solid>
           New
          </Badge>
         )}
        </div>
        <div className="mt-0.5 text-[11px] font-normal text-ink-faint">
         {a.id}
         {compact && <> · {a.owner}</>}
         {a.linkedDecisionId && (
          <>
           {' '}
           · from{' '}
           <Link to={`/decisions/${a.linkedDecisionId}`} className="font-semibold text-brand hover:underline">
            {a.linkedDecisionId}
           </Link>
          </>
         )}
         {a.carriedFromCycleId && <> · carried from {CYCLE_BY_ID[a.carriedFromCycleId]?.shortLabel ?? a.carriedFromCycleId}</>}
        </div>
       </td>
       {!compact && <td className={TABLE_TD}>{a.owner}</td>}
       <td className={`${TABLE_TD} tabular whitespace-nowrap ${a.status === 'overdue' ? 'font-semibold text-bad' : ''}`}>{fmtDate(a.dueDate)}</td>
       <td className={TABLE_TD}>
        <ActionStatusBadge status={a.status} />
       </td>
      </tr>
     ))}
    </tbody>
   </table>
  </div>
 )
}
