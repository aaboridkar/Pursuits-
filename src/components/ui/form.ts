// Field/dialog constants — so a field in one dialog can't have a different
// height from the same field in the next.

export const FIELD =
 'w-full rounded-md border border-(--color-border-strong) bg-(--color-surface) px-3 min-h-[38px] text-sm text-(--color-ink) placeholder:text-(--color-ink-faint) transition-colors focus:border-(--color-brand)'
export const FIELD_LABEL = 'block mb-1.5 text-xs font-semibold text-(--color-ink-muted)'
export const DIALOG_SCRIM = 'fixed inset-0 z-50 bg-black/35'
export const DIALOG_PANEL =
 'fixed right-0 top-0 z-50 h-full w-[420px] max-w-[92vw] overflow-y-auto border-l border-(--color-border) bg-(--color-surface) shadow-lg'

