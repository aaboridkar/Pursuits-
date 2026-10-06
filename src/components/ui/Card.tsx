import type { HTMLAttributes } from 'react'

/** The surface every table, panel and long-form block sits inside. */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
 return (
  <div className={`rounded-lg border border-border bg-surface p-3.5 shadow-sm ${className}`} {...rest} />
 )
}

