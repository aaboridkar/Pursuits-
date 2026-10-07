// Every icon in the app resolves through this file, so the same concept
// can never pick up two glyphs on two screens.
import {
 AlertTriangle,
 ArrowRight,
 Armchair,
 BadgeCheck,
 Briefcase,
 ClipboardList,
 Gauge,
 GraduationCap,
 LayoutDashboard,
 Trash2,
 UserCheck,
 UserPlus,
 UserRound,
 UserSearch,
 Plus,
 Pencil,
 Shuffle,
 ArrowUpRight,
 CalendarSync,
 FileCheck,
 Timer,
 Boxes,
 Building2,
 Calculator,
 CalendarCheck,
 CalendarDays,
 Check,
 CheckCircle2,
 ChevronDown,
 ChevronLeft,
 ChevronRight,
 ClipboardCheck,
 Clock,
 Database,
 Euro,
 Factory,
 FileText,
 Filter,
 Flag,
 FolderOpen,
 Gavel,
 GitCompareArrows,
 History,
 Info,
 Layers,
 Lightbulb,
 ListChecks,
 Lock,
 Mail,
 MessagesSquare,
 Mic,
 Network,
 Package,
 ParkingSquare,
 Pause,
 Play,
 Radar,
 RotateCcw,
 Search,
 ShieldAlert,
 ShoppingCart,
 SkipForward,
 Sparkles,
 Split,
 StepForward,
 Target,
 TrendingUp,
 Truck,
 Upload,
 Users,
 Video,
 X,
 createLucideIcon,
 type LucideIcon,
} from 'lucide-react'

/** Planning domain — the demo's stable categorical dimension. */
export const DOMAIN_ICON: Record<string, LucideIcon> = {
 demand: TrendingUp,
 supply: Truck,
 inventory: Boxes,
 capacity: Factory,
 finance: Euro,
}

/** The five decision-cycle stages (Sense → Decide). */
export const STAGE_ICON: Record<string, LucideIcon> = {
 sense: Radar,
 diagnose: Search,
 simulate: GitCompareArrows,
 recommend: Target,
 decide: CheckCircle2,
}

/** Systems of record / planning / intelligence, named wherever they're read. */
export const SYSTEM_ICON: Record<string, LucideIcon> = {
 'SAP ECC': Database,
 'SAP BW': Database,
 'SAP HANA': Database,
 'SAP APO': Layers,
 'SAP IBP': Layers,
 o9: Layers,
 E2open: Network,
 'Retailer EDI': Network,
 'Promo calendar': CalendarCheck,
 Ariba: ShoppingCart,
 'Teams / Planner': MessagesSquare,
 'IBP Nexus': Sparkles,
}

/** Left-rail destinations. */
export const NAV_ICON: Record<string, LucideIcon> = {
 // Workforce capacity & deployment
 overview: LayoutDashboard,
 pipeline: Briefcase,
 capacity: Gauge,
 risk: Armchair,
 workbench: UserSearch,
 skills: GraduationCap,
 people: UserRound,
 data: Database,
 // IBP
 controlTower: Radar,
 reviewPrep: ClipboardCheck,
 facilitator: MessagesSquare,
 decisions: Gavel,
 governance: ShieldAlert,
}

/** Padlock with a dollar sign — the price is locked in. Drawn on lucide's 24px grid so it matches the set. */
const LockDollar = createLucideIcon('lock-dollar', [
 ['path', { d: 'M7 10V7a5 5 0 0 1 10 0v3', key: 'shackle' }],
 ['rect', { x: '4', y: '10', width: '16', height: '12', rx: '2', key: 'body' }],
 ['path', { d: 'M14 13.5h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3H10', key: 's' }],
 ['path', { d: 'M12 12.5v1M12 19.5v1', key: 'bar' }],
])

/** Commercial model of an opportunity; `other` covers types outside the five standard ones (e.g. retainers). */
export const OPP_TYPE_ICON: Record<'fixed' | 'tm' | 'product' | 'outcome' | 'output' | 'other', LucideIcon> = {
 fixed: LockDollar, // price locked in
 tm: Timer, // billed by time spent
 product: Package,
 outcome: Target, // paid on results achieved
 output: FileCheck, // paid per deliverable
 other: CalendarSync, // e.g. monthly retainers
}

/** The deployment journey — Opportunity › Requirement › Gap › Candidates › Employee. */
export const WORKFLOW_ICON: Record<string, LucideIcon> = {
 opportunity: Briefcase,
 requirement: ClipboardList,
 gap: Split,
 candidates: UserSearch,
 employee: UserRound,
}

/** The IBP journey — Cycle › Review › Meeting › Decision › Governance. */
export const JOURNEY_ICON: Record<string, LucideIcon> = {
 cycle: CalendarDays,
 review: ClipboardCheck,
 meeting: MessagesSquare,
 decision: Gavel,
 governance: ShieldAlert,
}

/** What the facilitator detects in a transcript. */
export const SIGNAL_ICON: Record<string, LucideIcon> = {
 issue: AlertTriangle,
 recurrence: History,
 'action-risk': Clock,
 'potential-decision': Gavel,
 evidence: Database,
 conflict: AlertTriangle,
 parking: ParkingSquare,
}

/** General-purpose chrome. */
export const UI_ICON = {
 chevronRight: ChevronRight,
 chevronDown: ChevronDown,
 chevronLeft: ChevronLeft,
 arrowRight: ArrowRight,
 arrowUpRight: ArrowUpRight,
 check: Check,
 checkCircle: CheckCircle2,
 alert: AlertTriangle,
 clock: Clock,
 mail: Mail,
 building: Building2,
 calc: Calculator,
 list: ListChecks,
 filter: Filter,
 lock: Lock,
 play: Play,
 pause: Pause,
 stepForward: StepForward,
 skipForward: SkipForward,
 mic: Mic,
 video: Video,
 close: X,
 ai: Sparkles,
 calendar: CalendarDays,
 history: History,
 lightbulb: Lightbulb,
 flag: Flag,
 info: Info,
 reset: RotateCcw,
 users: Users,
 fileText: FileText,
 folder: FolderOpen,
 upload: Upload,
 split: Split,
 search: Search,
 plus: Plus,
 edit: Pencil,
 trash: Trash2,
 propose: UserPlus,
 confirm: UserCheck,
 verified: BadgeCheck,
 shuffle: Shuffle,
 bench: Armchair,
 briefcase: Briefcase,
 user: UserRound,
 database: Database,
 target: Target,
 trending: TrendingUp,
} satisfies Record<string, LucideIcon>
