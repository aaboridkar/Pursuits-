import type { HTMLAttributes, ReactNode } from 'react'

type Tone = 'neutral' | 'blue' | 'yellow' | 'success' | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
 tone?: Tone
 dot?: boolean
 solid?: boolean
 icon?: ReactNode
}

// Soft tint background + full-strength ink by default. Yellow always uses
// --color-warn as its ink — raw accent-yellow text fails contrast.
const SOFT: Record<Tone, string> = {
 neutral: 'bg-surface-sunken text-ink-faint',
 blue: 'bg-brand-soft text-brand-active',
 yellow: 'bg-warn-soft text-warn',
 success: 'bg-good-soft text-good',
 danger: 'bg-bad-soft text-bad',
}

const SOLID: Record<Tone, string> = {
 neutral: 'bg-ink-faint text-white',
 blue: 'bg-brand text-brand-ink',
 yellow: 'bg-accent text-accent-ink',
 success: 'bg-good text-white',
 danger: 'bg-bad text-white',
}

/** Compact status pill. Colour is reinforcement — always paired with a label. */
export function Badge({ tone = 'neutral', dot, solid, icon, className = '', children, ...rest }: BadgeProps) {
 return (
  <span
   className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[2.5px] text-[11.5px] font-semibold whitespace-nowrap ${
    solid ? SOLID[tone] : SOFT[tone]
   } ${className}`}
   {...rest}
  >
   {dot && <span className="h-[6px] w-[6px] rounded-full bg-current" aria-hidden="true" />}
   {icon}
   {children}
  </span>
 )
}

