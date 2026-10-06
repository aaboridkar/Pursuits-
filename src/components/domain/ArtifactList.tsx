import type { Artifact, ArtifactKind } from '../../data/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { UI_ICON } from '../ui/icons'

const LockIcon = UI_ICON.lock
const FolderIcon = UI_ICON.folder

const KIND_ICON: Record<ArtifactKind, typeof UI_ICON.fileText> = {
 minutes: UI_ICON.fileText,
 transcript: UI_ICON.mic,
 recording: UI_ICON.video,
 'decision-record': UI_ICON.checkCircle,
 'write-back': UI_ICON.upload,
}

const ROADMAP_NOTE = 'Opening and downloading artifacts is a roadmap capability — they are listed to show what the facilitator generated.'

/**
 * What the facilitator produced from a meeting. The artifacts exist in the
 * data; opening them is a roadmap capability, so every link is rendered
 * disabled with a lock — visibly present, deliberately inert.
 */
export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
 return (
  <div>
   <ul className="divide-y divide-border" title={ROADMAP_NOTE}>
    {artifacts.map((a) => {
     const Icon = KIND_ICON[a.kind]
     return (
      <li key={a.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
       <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint" aria-hidden="true">
        <Icon size={15} strokeWidth={2.2} />
       </span>
       <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink">{a.title}</div>
        <div className="truncate text-[11px] text-ink-faint">
         {a.detail} · generated {a.generatedAt}
        </div>
       </div>
       <a
        href="#"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        tabIndex={-1}
        className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 text-[11.5px] font-semibold text-ink-faint opacity-70"
       >
        <LockIcon size={11} strokeWidth={2.4} aria-hidden="true" />
        Open
       </a>
      </li>
     )
    })}
   </ul>
   <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
    <Button size="sm" disabled icon={<FolderIcon size={13} strokeWidth={2.2} aria-hidden="true" />} title={ROADMAP_NOTE}>
     Open artifact folder
    </Button>
    <Badge tone="neutral" dot>
     Artifact access · roadmap
    </Badge>
   </div>
  </div>
 )
}
