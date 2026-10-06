const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (iso: string) => iso.split('-').map(Number)

/** 6 Oct 2026 */
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
/** 6 Oct */
export const fmtDayMonth = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1]}`
}
/** Oct 26 — for a YYYY-MM key */
export const fmtMonth = (key: string) => {
  const [y, m] = parts(key)
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}
/** $2.0M · $350K · — */
export const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}
export const fmtFte = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} FTE`
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`)
export const fmtSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))}`
