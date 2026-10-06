import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
 variant?: Variant
 size?: Size
 icon?: ReactNode
}

const VARIANT: Record<Variant, string> = {
 primary: 'bg-brand border-brand text-brand-ink hover:bg-brand-hover hover:border-brand-hover active:bg-brand-active',
 accent: 'bg-accent border-accent text-accent-ink hover:bg-accent-hover hover:border-accent-hover',
 secondary: 'bg-surface border-border-strong text-ink hover:bg-surface-sunken',
 ghost: 'bg-transparent border-transparent text-brand hover:bg-brand-soft',
 danger: 'bg-surface border-bad-border text-bad hover:bg-bad-soft',
}

const SIZE: Record<Size, string> = {
 sm: 'min-h-[26px] px-2.5 text-2xs gap-1.5',
 md: 'min-h-[32px] px-3.5 text-xs gap-2',
 lg: 'min-h-[40px] px-5 text-sm gap-2',
}

/** Sentence-case label, one shape everywhere. */
export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }: ButtonProps) {
 return (
  <button
   className={`inline-flex items-center justify-center rounded-md border font-semibold transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${VARIANT[variant]} ${SIZE[size]} ${className}`}
   {...rest}
  >
   {icon}
   {children}
  </button>
 )
}

