// How an edit to an opportunity flows into its win probability and weighted monthly revenue.
// Shared so the page can preview unsaved edits with exactly the numbers the server will save.

import { stageOutcome } from './catalog'
import { addMonths } from './dates'
import type { Opportunity, OpportunityEdit } from './types'

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7))

export const probabilityOf = (o: Opportunity) => (o.outcome === 'won' ? 1 : o.outcome === 'lost' ? 0 : (o.confWinning ?? 0))

/** Spread the weighted value evenly over the (possibly assumed) duration. */
export function spreadMonthly(o: Opportunity) {
  if (!o.value || !o.estStartDate || !o.months || o.outcome === 'lost') return []
  const per = (o.value * o.probability) / o.months
  return Array.from({ length: o.months }, (_, k) => ({ month: addMonths(o.estStartDate!, k).slice(0, 7), value: Math.round(per) }))
}

/**
 * An opportunity with the app's edits applied. Outcome follows an edited stage (Closed - Won / Lost / Timed Out),
 * and weighted monthly revenue is rescaled to the new value × win probability and shifted with a new start
 * month — or, when the duration changes, spread evenly over the new number of months from the start date.
 */
export function applyOpportunityEdit(o: Opportunity, edit: OpportunityEdit | undefined): Opportunity {
  if (!edit || Object.keys(edit).length === 0) return o
  const fp = { ...o.fieldProvenance }
  for (const k of Object.keys(edit) as (keyof OpportunityEdit)[]) fp[k] = 'app'
  const next: Opportunity = { ...o, ...edit, fieldProvenance: fp }
  if (edit.stage !== undefined) next.outcome = stageOutcome(edit.stage)
  next.probability = probabilityOf(next)
  const valueFactor = o.value && next.value !== null ? next.value / o.value : 1
  const shift = o.estStartDate && next.estStartDate ? monthIndex(next.estStartDate) - monthIndex(o.estStartDate) : null
  if (edit.months === undefined && shift !== null && o.monthly.length > 0 && o.probability > 0) {
    next.monthly = o.monthly.map((m) => ({
      month: addMonths(`${m.month}-01`, shift).slice(0, 7),
      value: Math.round((m.value * valueFactor * next.probability) / o.probability),
    }))
  } else {
    next.monthly = spreadMonthly(next)
    fp.monthly = 'derived'
  }
  return next
}
