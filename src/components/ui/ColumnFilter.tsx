import { useEffect, useRef, useState } from 'react'
import { UI_ICON } from './icons'

interface ColumnFilterProps {
 label: string
 options: string[]
 selected: Set<string>
 onToggle: (value: string) => void
 onClear: () => void
}

const ChevronDown = UI_ICON.chevronDown
const FilterIcon = UI_ICON.filter

/** A table column header that opens a multi-select filter popover on click. */
export function ColumnFilter({ label, options, selected, onToggle, onClear }: ColumnFilterProps) {
 const [open, setOpen] = useState(false)
 const ref = useRef<HTMLDivElement>(null)
 const active = selected.size > 0

 useEffect(() => {
  if (!open) return
  const onClickOutside = (e: MouseEvent) => {
   if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }
  document.addEventListener('mousedown', onClickOutside)
  return () => document.removeEventListener('mousedown', onClickOutside)
 }, [open])

 return (
  <div className="relative inline-block" ref={ref}>
   <button
    type="button"
    onClick={() => setOpen((o) => !o)}
    aria-expanded={open}
    className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-brand' : 'hover:text-ink-muted'}`}
   >
    {label}
    {active ? (
     <FilterIcon size={11} strokeWidth={2.4} aria-hidden="true" />
    ) : (
     <ChevronDown size={11} strokeWidth={2.4} aria-hidden="true" />
    )}
   </button>
   {open && (
    <div
     role="menu"
     className="normal-case tracking-normal absolute left-0 top-full z-30 mt-1.5 min-w-[190px] rounded-md border border-border bg-surface p-2 font-normal shadow-lg"
    >
     <div className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto">
      {options.map((opt) => (
       <label
        key={opt}
        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-ink hover:bg-surface-sunken"
       >
        <input
         type="checkbox"
         checked={selected.has(opt)}
         onChange={() => onToggle(opt)}
         className="h-3.5 w-3.5 shrink-0 rounded border-border-strong accent-[var(--color-brand)]"
        />
        <span className="capitalize">{opt}</span>
       </label>
      ))}
     </div>
     {active && (
      <button
       type="button"
       onClick={onClear}
       className="mt-1.5 w-full rounded px-1.5 py-1 text-left text-[11px] font-semibold text-brand hover:bg-brand-soft"
      >
       Clear filter
      </button>
     )}
    </div>
   )}
  </div>
 )
}

