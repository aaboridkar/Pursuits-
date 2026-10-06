import { UI_ICON } from './icons'

const Sparkles = UI_ICON.ai

/**
 * Marks content the facilitator produced. Always paired with its provenance
 * (when, from which sources) so "AI-generated" never appears as a bare claim.
 */
export function AiBadge({ label = 'AI-generated', detail }: { label?: string; detail?: string }) {
 return (
  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-active">
   <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-soft">
    <Sparkles size={11} strokeWidth={2.4} aria-hidden="true" />
   </span>
   {label}
   {detail && <span className="font-medium text-ink-faint">· {detail}</span>}
  </span>
 )
}
