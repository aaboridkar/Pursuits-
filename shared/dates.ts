// Date helpers. All dates are ISO YYYY-MM-DD strings handled in UTC so a
// day is always a day, whatever the machine's timezone.

const DAY = 86_400_000

export const toDay = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY)
export const fromDay = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => fromDay(toDay(iso) + n)
export const diffDays = (a: string, b: string): number => toDay(a) - toDay(b)

/** Excel serial date (1900 system) → ISO. 45658 = 2025-01-01. */
export const fromExcelSerial = (serial: number): string => fromDay(serial - 25569)

export const monthKey = (iso: string): string => iso.slice(0, 7)
export const monthStart = (key: string): string => `${key}-01`
export const monthEnd = (key: string): string => {
  const [y, m] = key.split('-').map(Number)
  return fromDay(Math.floor(Date.UTC(y, m, 0) / DAY))
}
export const addMonths = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}
export const monthsBetween = (fromKey: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => addMonths(monthStart(fromKey), i).slice(0, 7))

/** Days of [a1,a2] ∩ [b1,b2], inclusive. */
export const overlapDays = (a1: string, a2: string, b1: string, b2: string): number =>
  Math.max(0, Math.min(toDay(a2), toDay(b2)) - Math.max(toDay(a1), toDay(b1)) + 1)

/** Fiscal year runs April–March: Jul–Sep is Q2, Oct–Dec Q3, Jan–Mar Q4 (as in the opportunity tracker). */
export const fiscalQuarter = (iso: string): string => {
  const m = Number(iso.slice(5, 7))
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4
  const fy = m >= 4 ? Number(iso.slice(0, 4)) + 1 : Number(iso.slice(0, 4))
  return `Q${q} FY${String(fy).slice(2)}`
}
