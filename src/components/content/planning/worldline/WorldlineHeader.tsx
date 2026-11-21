"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type WorldlineSaveState = "idle" | "saving" | "saved" | "failed";
const SAVE_LABELS: Record<Exclude<WorldlineSaveState, "idle">, string> = {
  saving: "保存中",
  saved: "已保存",
  failed: "保存失败",
};

/** docs/580 §7.1 (S9): the worldline panel header, matching ThemePanel / CharactersPanel (h2 text-lg font-medium,
 * status on the right). Only mode="world" renders it; the narrative and outline headers are unchanged (WU-39b). */
export function WorldlineHeader({
  version,
  readonly,
  saveState,
  canUndo,
  onUndo,
}: {
  version: number | undefined;
  readonly: boolean;
  saveState: WorldlineSaveState;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <header
      data-worldline-header=""
      className="mb-4 flex items-center justify-between gap-3"
    >
      <h2 className="text-lg font-medium">世界线</h2>
      <div className="flex items-center gap-3">
        {saveState !== "idle" && (
          <span
            data-save-state=""
            role="status"
            className={`text-xs ${saveState === "failed" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {SAVE_LABELS[saveState]}
          </span>
        )}
        {readonly && <Badge variant="outline">只读</Badge>}
        {version !== undefined && (
          <Badge variant="secondary" data-version-badge="">
            v{version}
          </Badge>
        )}
        <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo}>
          撤销上次规划修改
        </Button>
      </div>
    </header>
  );
}
