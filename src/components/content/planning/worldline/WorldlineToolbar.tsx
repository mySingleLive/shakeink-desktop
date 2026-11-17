"use client";
import { Button } from "@/components/ui/button";
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/planning/domain";
import { CATEGORY_VAR } from "@/lib/planning/worldline-layout";
import s from "./worldline.module.css";
import { renderProbe } from "@/lib/planning/render-probe";

/** docs/577 §1, §12, §14 / docs/580 §7.1: one-row toolbar. View switch, periods, expand all, zoom, search, pending /
 * continuing, more, new event. The existing world select and dialogs stay owned by PlanningWorkspace (`slots`). */
export function WorldlineToolbar(p: {
  view: "timeline" | "table";
  onView(v: "timeline" | "table"): void;
  treeOn: boolean;
  onTree(): void;
  worldSelect: React.ReactNode;
  periodPicker: React.ReactNode;
  allExpanded: boolean;
  onToggleAll(): void;
  zoomLabel: React.ReactNode;
  onZoom(dir: -1 | 1 | 0): void;
  query: string;
  /** The hits belong to the current box text (577 §12: they follow 120ms after typing stops). */
  applied: boolean;
  onQuery(q: string): void;
  hitIndex: number;
  hitCount: number;
  onStep(dir: -1 | 1): void;
  pending: number;
  continuing: React.ReactNode;
  continuingZero: boolean;
  onPending(): void;
  onContinuing(): void;
  more: React.ReactNode;
  onNewEvent: React.ReactNode;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const active = p.query.length > 0, none = active && p.applied && p.hitCount === 0;
  return (
    <div className={s.bar} role="toolbar" aria-label="世界线工具栏">
      <div className={s.group}>
        <Button size="icon-sm" variant="ghost" aria-pressed={p.treeOn} aria-label="显示或隐藏事件目录" onClick={p.onTree}>
          ▤
        </Button>
        {p.worldSelect}
        <div role="tablist" aria-label="视图" className="inline-flex h-7 items-center rounded-lg bg-muted p-[3px]">
          {(["timeline", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={p.view === v}
              className={`h-[22px] rounded-md px-2.5 text-[0.8rem] font-medium ${p.view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => p.onView(v)}
            >
              {v === "timeline" ? "时间线" : "事件表"}
            </button>
          ))}
        </div>
      </div>
      <span className={s.sep} />
      <div className={s.group}>
        {p.periodPicker}
        <Button size="sm" variant="outline" data-toggle-all="" className={s.iconNarrow} onClick={p.onToggleAll} title="展开或收起全部事件卡片">
          <span aria-hidden>{p.allExpanded ? "⌃" : "⌄"}</span>
          <span className={s.lbl}>{p.allExpanded ? "全部收起" : "全部展开"}</span>
        </Button>
        <div className="inline-flex h-7 items-center rounded-md border border-input" title="缩放时间轴间距（也可 Ctrl + 滚轮）">
          <Button size="icon-xs" variant="ghost" aria-label="缩小" onClick={() => p.onZoom(-1)}>−</Button>
          <span className="min-w-[46px] text-center text-xs tabular-nums" data-zoom-value="">{p.zoomLabel}</span>
          <Button size="icon-xs" variant="ghost" aria-label="放大" onClick={() => p.onZoom(1)}>＋</Button>
          <Button size="xs" variant="ghost" className={s.hideNarrow1} onClick={() => p.onZoom(0)}>复位</Button>
        </div>
      </div>
      <span className={s.spacer} />
      <div className={`${s.search} ${active ? s.active : ""} ${none ? s.none : ""}`} role="search">
        <span aria-hidden>⌕</span>
        <input
          ref={p.searchRef}
          type="search"
          data-worldline-search=""
          aria-label="搜索事件"
          placeholder="搜索事件"
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); p.onStep(e.shiftKey ? -1 : 1) }
            if (e.key === "Escape") { e.preventDefault(); p.onQuery("") }
          }}
        />
        {active && p.applied && <span className={s.count} data-search-count="" aria-live="polite">{p.hitCount ? `${p.hitIndex + 1} / ${p.hitCount}` : "无结果"}</span>}
        {active && (
          <>
            <button aria-label="上一个结果" disabled={p.hitCount < 2} onClick={() => p.onStep(-1)}>↑</button>
            <button aria-label="下一个结果" disabled={p.hitCount < 2} onClick={() => p.onStep(1)}>↓</button>
            <button aria-label="清除搜索" onClick={() => p.onQuery("")}>×</button>
          </>
        )}
        <kbd>⌘F</kbd>
      </div>
      <button className={`${s.chip} ${s.iconNarrow}`} onClick={p.onPending} title="待定位事件">
        <span className={s.lbl}>待定位</span><b>{p.pending}</b>
      </button>
      <button className={`${s.chip} ${p.continuingZero ? s.zero : ""}`} onClick={p.onContinuing} title="从视窗外延续的事件">
        <span className={s.lbl}>延续事件</span><b>{p.continuing}</b>
      </button>
      {p.more}
      {p.onNewEvent}
    </div>
  );
}

/** docs/577 §8–§9: type legend with counts (click hides, double-click solos) and the importance size key. */
export function WorldlineLegend({ counts, hidden, onToggle, onSolo, range, total }: {
  counts: Record<EventCategory, number>;
  hidden: ReadonlySet<EventCategory>;
  onToggle(c: EventCategory): void;
  onSolo(c: EventCategory): void;
  range: React.ReactNode;
  total: number;
}) {
  renderProbe("WorldlineLegend");
  return (
    <div className={s.status}>
      <span data-range="">{range}</span>
      <span>{total} 件事件</span>
      <span className={s.legend} aria-label="类型图例（点击隐藏或显示，双击只看这一类）">
        <span>类型</span>
        {EVENT_CATEGORIES.map((c) => (
          <button
            key={c}
            data-legend-type={c}
            aria-pressed={!hidden.has(c)}
            style={{ "--ec": `var(${CATEGORY_VAR[c]})` } as React.CSSProperties}
            onClick={() => onToggle(c)}
            onDoubleClick={() => onSolo(c)}
          >
            <i />
            {c} {counts[c]}
          </button>
        ))}
        <span className={s.sizes} title="圆点大小表示重要程度">
          重要度 <i style={{ width: 6, height: 6 }} />一般 <i style={{ width: 9, height: 9 }} />重要 <i style={{ width: 13, height: 13 }} />关键
        </span>
      </span>
    </div>
  );
}
