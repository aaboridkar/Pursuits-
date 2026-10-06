import { Link } from 'react-router-dom'
import type { Decision } from '../../data/types'
import { PEOPLE, REVIEW_BY_ID } from '../../data'
import { fmtDate } from '../../engine/format'
import { TABLE_ROW, TABLE_ROW_HOVER, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../ui/table'
import { DomainChip } from './DomainChip'
import { DecisionStatusBadge } from './StatusBadges'

interface DecisionTableProps {
 decisions: Decision[]
 compact?: boolean
}

const STATUS_ORDER: Record<Decision['status'], number> = { potential: 0, confirmed: 1, implemented: 2 }

/** Decisions, awaiting-confirmation first. Rows link to the decision workspace. */
export function DecisionTable({ decisions, compact }: DecisionTableProps) {
 const rows = [...decisions].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.proposedOn.localeCompare(a.proposedOn))
 return (
  <div className="scroll-x">
   <table className="w-full border-collapse">
    <thead>
     <tr>
      <th className={TABLE_TH}>Decision</th>
      {!compact && <th className={TABLE_TH}>Domain</th>}
      <th className={TABLE_TH}>Review</th>
      {!compact && <th className={TABLE_TH}>Proposed by</th>}
      {!compact && <th className={TABLE_TH}>Confirmed</th>}
      <th className={TABLE_TH}>Status</th>
     </tr>
    </thead>
    <tbody>
     {rows.map((d) => (
      <tr key={d.id} className={`${TABLE_ROW} ${TABLE_ROW_HOVER}`}>
       <td className={TABLE_TD_STRONG}>
        <Link to={`/decisions/${d.id}`} className="hover:text-brand hover:underline">
         {d.title}
        </Link>
        <div className="mt-0.5 text-[11px] font-normal text-ink-faint">{d.id}</div>
       </td>
       {!compact && (
        <td className={TABLE_TD}>
         <DomainChip domain={d.domain} />
        </td>
       )}
       <td className={`${TABLE_TD} whitespace-nowrap`}>{REVIEW_BY_ID[d.reviewId]?.name ?? d.reviewId}</td>
       {!compact && <td className={`${TABLE_TD} whitespace-nowrap`}>{PEOPLE[d.proposedBy]?.name ?? d.proposedBy}</td>}
       {!compact && (
        <td className={`${TABLE_TD} tabular whitespace-nowrap`}>
         {d.confirmedOn ? (
          <>
           {fmtDate(d.confirmedOn)}
           <span className="text-ink-faint"> · {PEOPLE[d.confirmedBy ?? '']?.name}</span>
          </>
         ) : (
          <span className="text-ink-faint">Awaiting human confirmation</span>
         )}
        </td>
       )}
       <td className={TABLE_TD}>
        <DecisionStatusBadge status={d.status} />
       </td>
      </tr>
     ))}
    </tbody>
   </table>
  </div>
 )
}
