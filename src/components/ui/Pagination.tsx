import { UI_ICON } from './icons'

interface PaginationProps {
 page: number
 pageCount: number
 totalRows: number
 pageSize: number
 onChange: (page: number) => void
}

const ChevronLeft = UI_ICON.chevronLeft
const ChevronRight = UI_ICON.chevronRight

/** Prev/next pager for a table showing pageSize rows at a time. */
export function Pagination({ page, pageCount, totalRows, pageSize, onChange }: PaginationProps) {
 if (pageCount <= 1) return null

 const start = (page - 1) * pageSize + 1
 const end = Math.min(page * pageSize, totalRows)

 return (
  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
   <p className="tabular text-[11px] text-ink-faint">
    {start}–{end} of {totalRows}
   </p>
   <div className="flex items-center gap-1">
    <button
     type="button"
     onClick={() => onChange(page - 1)}
     disabled={page === 1}
     aria-label="Previous page"
     className="flex h-7 w-7 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
    >
     <ChevronLeft size={14} strokeWidth={2.4} aria-hidden="true" />
    </button>
    <span className="tabular px-2 text-xs font-semibold text-ink">
     Page {page} of {pageCount}
    </span>
    <button
     type="button"
     onClick={() => onChange(page + 1)}
     disabled={page === pageCount}
     aria-label="Next page"
     className="flex h-7 w-7 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
    >
     <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
    </button>
   </div>
  </div>
 )
}

