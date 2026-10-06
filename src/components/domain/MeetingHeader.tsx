import type { Meeting, Person } from '../../data/types'
import { REVIEW_BY_ID } from '../../data'
import { fmtClock } from '../../engine/format'
import type { MeetingStatus } from '../../state/store'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { UI_ICON } from '../ui/icons'

const MicIcon = UI_ICON.mic
const VideoIcon = UI_ICON.video
const PlayIcon = UI_ICON.play
const PauseIcon = UI_ICON.pause
const StepIcon = UI_ICON.stepForward
const SkipIcon = UI_ICON.skipForward
const AiIcon = UI_ICON.ai

interface MeetingHeaderProps {
 meeting: Meeting
 participants: Person[]
 status: MeetingStatus
 elapsedSec: number
 speakingId?: string
 revealed: number
 total: number
 onStart: () => void
 onPause: () => void
 onResume: () => void
 onNext: () => void
 onSkip: () => void
}

/**
 * Looks like the strip of a Teams meeting the facilitator has joined:
 * meeting name, live/recording indicators, participant avatars with the
 * current speaker ringed — plus the demo's playback controls.
 */
export function MeetingHeader({ meeting, participants, status, elapsedSec, speakingId, revealed, total, onStart, onPause, onResume, onNext, onSkip }: MeetingHeaderProps) {
 const review = REVIEW_BY_ID[meeting.reviewId]
 const live = status === 'live'
 const ended = status === 'ended'

 return (
  <div className="rounded-lg border border-border bg-surface shadow-sm">
   <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
    <div className="flex items-center gap-2.5">
     <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#5b5fc7] text-white" aria-hidden="true">
      <VideoIcon size={15} strokeWidth={2.2} />
     </span>
     <div className="leading-tight">
      <div className="text-sm font-extrabold tracking-[-0.01em] text-ink">{meeting.name}</div>
      <div className="text-[11px] text-ink-faint">
       {meeting.channel} · simulated · {review.name} · {meeting.durationMin} min
      </div>
     </div>
    </div>

    <span className="hidden h-6 w-px bg-border md:block" aria-hidden="true" />

    <div className="flex items-center gap-2">
     {live ? (
      <Badge tone="danger" solid icon={<span className="h-[6px] w-[6px] animate-pulse rounded-full bg-white" aria-hidden="true" />}>
       REC
      </Badge>
     ) : (
      <Badge tone="neutral" dot>
       {ended ? 'Recording saved' : status === 'paused' ? 'Paused' : 'Not started'}
      </Badge>
     )}
     <Badge tone={live ? 'success' : 'neutral'} icon={<MicIcon size={11} strokeWidth={2.4} aria-hidden="true" />}>
      Live transcript {live ? 'on' : ended ? 'complete' : 'ready'}
     </Badge>
     <Badge tone="blue" icon={<AiIcon size={11} strokeWidth={2.4} aria-hidden="true" />}>
      Facilitator joined
     </Badge>
     <span className="tabular ml-1 text-sm font-extrabold text-ink" aria-label="Meeting timer">
      {fmtClock(elapsedSec)}
     </span>
    </div>

    <div className="flex-1" />

    <div className="flex items-center gap-1.5">
     {status === 'idle' && (
      <Button variant="primary" size="sm" onClick={onStart} icon={<PlayIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
       Start meeting
      </Button>
     )}
     {live && (
      <Button variant="secondary" size="sm" onClick={onPause} icon={<PauseIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
       Pause
      </Button>
     )}
     {status === 'paused' && (
      <Button variant="primary" size="sm" onClick={onResume} icon={<PlayIcon size={13} strokeWidth={2.4} aria-hidden="true" />}>
       Resume
      </Button>
     )}
     {!ended && (
      <>
       <Button variant="secondary" size="sm" onClick={onNext} disabled={status === 'idle'} icon={<StepIcon size={13} strokeWidth={2.4} aria-hidden="true" />} title="Reveal the next transcript line">
        Next
       </Button>
       <Button variant="ghost" size="sm" onClick={onSkip} icon={<SkipIcon size={13} strokeWidth={2.4} aria-hidden="true" />} title="Jump to the end of the meeting">
        Skip to end
       </Button>
      </>
     )}
     {ended && (
      <Badge tone="success" dot>
       Meeting ended
      </Badge>
     )}
    </div>
   </div>

   <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
    <span className="eyebrow">Participants</span>
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Participants">
     {participants.map((p) => {
      const speaking = p.id === speakingId
      return (
       <li key={p.id} className="flex items-center gap-1.5" title={`${p.name} · ${p.role}`}>
        <span
         className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-shadow ${
          p.isAi ? 'bg-brand-soft text-brand-active' : 'bg-ink-muted text-white'
         } ${speaking ? 'ring-2 ring-good ring-offset-2 ring-offset-surface' : ''}`}
        >
         {p.isAi ? <AiIcon size={13} strokeWidth={2.4} aria-hidden="true" /> : p.initials}
        </span>
        <span className={`hidden text-[11px] xl:inline ${speaking ? 'font-bold text-ink' : 'text-ink-muted'}`}>{p.name.split(' ')[0]}</span>
       </li>
      )
     })}
    </ul>
    <div className="flex-1" />
    <span className="tabular text-[11px] text-ink-faint">
     Transcript {revealed} / {total} segments
    </span>
   </div>
  </div>
 )
}
