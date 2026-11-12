"use client"
import { useId } from "react"
import { cn } from "@/lib/utils"

// lucide-react FolderClosed / FolderOpen path data (ISC, see THIRD_PARTY_NOTICES).
const CLOSED = ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z", "M2 10h20"]
const OPEN = ["m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"]
export type FaultTone = "error" | "warning"

/** Work folder with a cut-out exclamation badge (approved design v3). */
export function FaultedWorkIcon({ tone, open = false, className }: { tone: FaultTone; open?: boolean; className?: string }) {
  const mask = useId()
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" data-fault-icon={tone} className={cn("size-3.5 shrink-0", className)}>
      <defs><mask id={mask} maskUnits="userSpaceOnUse"><rect width="24" height="24" fill="#fff" /><circle cx="18.5" cy="18.5" r="7.2" fill="#000" /></mask></defs>
      <g mask={`url(#${mask})`} stroke="var(--icon-work)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{(open ? OPEN : CLOSED).map(d => <path key={d} d={d} />)}</g>
      <circle cx="18.5" cy="18.5" r="5.6" fill={tone === "error" ? "var(--destructive)" : "var(--warning)"} />
      <path d="M18.5 15.6v3.3" stroke="var(--fault-badge-mark)" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="18.5" cy="21.4" r="1.15" fill="var(--fault-badge-mark)" />
    </svg>
  )
}
