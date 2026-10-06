interface StatBarProps {
 /** Current value, 0–100. */
 value: number
 /** Optional comparison mark, 0–100 (a target or threshold). */
 target?: number
 fill?: string
 track?: string
 mark?: string
 className?: string
}

/** A meter. Never the only place a number appears — it sits under a printed value. */
export function StatBar({ value, target, fill, track, mark, className = '' }: StatBarProps) {
 const clamped = Math.min(100, Math.max(0, value))
 const targetClamped = target === undefined ? undefined : Math.min(100, Math.max(0, target))

 return (
  <div
   className={`relative h-1.5 w-full overflow-visible rounded-full ${className}`}
   style={{ background: track ?? 'var(--color-meter-track)' }}
   role="img"
   aria-label={`${value}${target !== undefined ? ` of ${target} target` : ''}`}
  >
   <div
    className="absolute inset-y-0 left-0 rounded-full"
    style={{ width: `${clamped}%`, background: fill ?? 'var(--color-meter-fill)' }}
   />
   {targetClamped !== undefined && (
    <div
     className="absolute top-1/2 h-[9px] w-[2px] -translate-y-1/2 rounded-full ring-1 ring-surface"
     style={{ left: `${targetClamped}%`, background: mark ?? 'var(--color-meter-mark)' }}
    />
   )}
  </div>
 )
}

