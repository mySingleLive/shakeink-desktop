import { ArrowRight, List, Maximize2, Minimize2, RotateCw, Sparkles } from "lucide-react"
import type { SelectionAiAction } from "@/lib/selection-ai"

const ICONS = { polish: Sparkles, expand: Maximize2, shrink: Minimize2, continue: ArrowRight, rewrite: RotateCw, summary: List } as const

export function ActionIcon({ action, className = "size-3.5" }: { action: SelectionAiAction; className?: string }) {
  const Icon = ICONS[action]
  return <Icon aria-hidden="true" className={className} />
}
