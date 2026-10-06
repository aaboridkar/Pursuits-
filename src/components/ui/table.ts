// Shared table treatment. No outer border, no filled header row — column
// labels sit above a bottom-only rule, rows separated by a single hairline.
// A table never carries its own chrome: it always sits inside a <Card>.

export const TABLE_TH =
 'px-3 pb-1.5 text-left align-top text-[11px] font-bold uppercase tracking-[.09em] text-(--color-ink-faint) whitespace-nowrap'
export const TABLE_ROW = 'border-t border-(--color-border)'
export const TABLE_ROW_HOVER = 'transition-colors hover:bg-(--color-surface-sunken)'
export const TABLE_TD = 'px-3 py-1.5 align-top text-[12.5px] text-(--color-ink-muted)'
export const TABLE_TD_STRONG = 'px-3 py-1.5 align-top text-[12.5px] font-semibold text-(--color-ink)'

