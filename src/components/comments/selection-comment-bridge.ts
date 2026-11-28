import type { selectionSnapshot } from "@/lib/comment-selection"

/**
 * docs/612 §4.4: lets the manuscript selection AI toolbar open the existing comment composer (preview or Monaco)
 * for a given selection, and learn whether a composer is open. The comment hosts keep their own composer state.
 */
export type SelectionCommentSnapshot = ReturnType<typeof selectionSnapshot> & { blockIndex?: number; line?: number }
export interface SelectionCommentBridge {
  /**
   * One opener per view (split shows both). Each host sets and clears only its own entry, so an unmounting preview
   * never removes the Monaco opener (code review 4). Returns false when commenting is unavailable.
   */
  openers: { edit?: (snapshot: SelectionCommentSnapshot) => boolean; preview?: (snapshot: SelectionCommentSnapshot) => boolean }
  /** Called by the host whenever its composer opens or closes. */
  onComposerChange?: (view: "edit" | "preview", open: boolean) => void
  /** Hide the per-selection 「添加评论」 round button (paragraph and gutter buttons stay). */
  hideSelectionButton?: boolean
}
