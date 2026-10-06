import type { HTMLAttributes } from 'react'

interface TileProps extends HTMLAttributes<HTMLDivElement> {
 /** Optional 3px accent bar on the left edge — a category or status colour token. */
 accent?: string
 interactive?: boolean
 /** No own border/radius/shadow — for a strip of tiles sharing a divider between them. */
 plain?: boolean
}

/** The dense counterpart to Card, for a screenful of small scannable units. */
export function Tile({ className = '', accent, interactive, plain, style, ...rest }: TileProps) {
 return (
  <div
   className={`bg-surface p-2.5 ${
    plain ? '' : 'rounded-md border border-border shadow-tile'
   } ${interactive ? 'tile-hover cursor-pointer' : ''} ${className}`}
   style={accent ? { borderLeft: `3px solid ${accent}`, ...style } : style}
   {...rest}
  />
 )
}

