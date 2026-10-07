import { PROFICIENCY_LABEL, type AuditEntry } from '../../../shared/types'
import { useApi } from '../../api/client'
import { fmtMoney } from '../../engine/format'
import { Dialog } from '../ui/Dialog'
import { TABLE_ROW, TABLE_TH } from '../ui/table'
import { Loadable } from './common'

const TD = 'px-1.5 py-1 align-top text-[12px] text-(--color-ink-muted)'
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const FIELD_LABEL: Record<AuditEntry['field'], string> = {
  type: 'Type',
  stage: 'Stage',
  estStartDate: 'Start',
  months: 'Months',
  value: 'Value',
  confWinning: 'Win %',
  lead: 'Lead',
  created: 'Created',
  skill: 'Skill',
  'skill-created': 'New skill',
}

function fmtValue(field: AuditEntry['field'], v: string | number | null) {
  if (v === null || v === '') return '—'
  if (field === 'value') return fmtMoney(Number(v))
  if (field === 'confWinning') return `${Math.round(Number(v) * 100)}%`
  if (field === 'skill') return Number(v) ? `${v} ${PROFICIENCY_LABEL[Number(v)]}` : '—'
  if (field === 'estStartDate') return `${MONTH_ABBR[Number(String(v).slice(5, 7)) - 1]} ${String(v).slice(2, 4)}`
  return String(v)
}

/** Every saved change, newest first: when, who (name, address, browser), and the field from → to. */
export function ViewLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const log = useApi<AuditEntry[]>(open ? '/api/audit?limit=500' : null)
  return (
    <Dialog open={open} onClose={onClose} title="View log" eyebrow="Saved changes" variant="panel" wide>
      <p className="mb-3 text-[11.5px] text-ink-muted">
        Each save is logged under the IP address it came from. Everyone using this PC shows as ::1 or 127.0.0.1; hover a row to see the browser.
      </p>
      <Loadable state={log}>
        {(rows) =>
          rows.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-faint">No saved changes yet.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['When', 'IP address', 'Record', 'Change'].map((h) => (
                    <th key={h} className={`${TABLE_TH} px-1.5!`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={TABLE_ROW}>
                    <td className={`${TD} tabular whitespace-nowrap`}>{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={TD} title={r.userAgent}>
                      <div className="tabular font-semibold text-ink">{r.ip}</div>
                      {/* Entries saved before IP-only logging also carry the name typed in then. */}
                      {r.editor !== r.ip && <div className="text-[11px] text-ink-faint">{r.editor}</div>}
                    </td>
                    <td className={TD}>
                      <div className="tabular">{r.opportunityId}</div>
                      <div className="max-w-[200px] truncate text-[11px] text-ink-faint" title={r.opportunityName}>
                        {r.opportunityName}
                      </div>
                    </td>
                    <td className={TD}>
                      {r.field === 'created' ? (
                        <span className="font-semibold text-good">New opportunity added</span>
                      ) : r.field === 'skill-created' ? (
                        <span className="font-semibold text-good">
                          New skill added to the catalogue <span className="font-normal text-ink-faint">({r.to})</span>
                        </span>
                      ) : r.field === 'skill' ? (
                        <>
                          <span className="font-semibold text-ink">Skill · {r.opportunityName}</span>{' '}
                          <span className="text-ink-faint">{fmtValue(r.field, r.from)}</span> → <span className="font-semibold text-ink">{fmtValue(r.field, r.to)}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-ink">{FIELD_LABEL[r.field]}</span>{' '}
                          <span className="text-ink-faint">{fmtValue(r.field, r.from)}</span> → <span className="font-semibold text-ink">{fmtValue(r.field, r.to)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Loadable>
    </Dialog>
  )
}
