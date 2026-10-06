import type { Issue } from '../../data/types'
import { CYCLE_BY_ID, occurrencesOf } from '../../data'
import { TABLE_ROW, TABLE_TD, TABLE_TD_STRONG, TABLE_TH } from '../ui/table'
import { DomainChip } from './DomainChip'
import { IssueStatusBadge, RecurrenceBadge, SeverityBadge } from './StatusBadges'

interface IssueTableProps {
 issues: Issue[]
 /** Hide domain/owner columns for a narrow placement. */
 compact?: boolean
}

/** Issues, most severe first. Always sits inside a <Card>. */
export function IssueTable({ issues, compact }: IssueTableProps) {
 const order: Record<Issue['severity'], number> = { critical: 0, high: 1, watch: 2 }
 const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity])

 return (
  <div className="scroll-x">
   <table className="w-full border-collapse">
    <thead>
     <tr>
      <th className={TABLE_TH}>Severity</th>
      <th className={TABLE_TH}>Issue</th>
      {!compact && <th className={TABLE_TH}>Domain</th>}
      {!compact && <th className={TABLE_TH}>Owner</th>}
      <th className={TABLE_TH}>Since</th>
      <th className={TABLE_TH}>Status</th>
     </tr>
    </thead>
    <tbody>
     {sorted.map((i) => {
      const occ = occurrencesOf(i)
      return (
       <tr key={i.id} className={TABLE_ROW}>
        <td className={TABLE_TD}>
         <SeverityBadge severity={i.severity} />
        </td>
        <td className={TABLE_TD_STRONG}>
         <div className="flex flex-wrap items-center gap-1.5">
          <span>{i.title}</span>
          <RecurrenceBadge occurrences={occ} />
         </div>
         {!compact && <div className="mt-0.5 max-w-[60ch] text-[11.5px] font-normal text-ink-muted">{i.memoryNote}</div>}
        </td>
        {!compact && (
         <td className={TABLE_TD}>
          <DomainChip domain={i.domain} />
         </td>
        )}
        {!compact && <td className={TABLE_TD}>{i.owner}</td>}
        <td className={`${TABLE_TD} whitespace-nowrap`}>{CYCLE_BY_ID[i.cycleId]?.shortLabel ?? i.cycleId}</td>
        <td className={TABLE_TD}>
         <IssueStatusBadge status={i.status} />
        </td>
       </tr>
      )
     })}
    </tbody>
   </table>
  </div>
 )
}
