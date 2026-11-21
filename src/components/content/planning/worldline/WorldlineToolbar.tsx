"use client";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Minus, PanelLeft, Plus, Search } from "lucide-react";
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
  /** docs/586 §4: event-table zoom bounds (the timeline zoom has none). */
  canZoomIn?: boolean;
  canZoomOut?: boolean;
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
        <button type="button" className={`${s.tb} ${s.icon}`} aria-pressed={p.treeOn} aria-label="显示或隐藏事件目录" title="显示或隐藏事件目录" onClick={p.onTree}>
          <PanelLeft aria-hidden />
        </button>
        <span className={s.select}>{p.worldSelect}<ChevronDown aria-hidden /></span>
        <div role="tablist" aria-label="视图" className={s.seg}>
          {(["timeline", "table"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={p.view === v} onClick={() => p.onView(v)}>
              {v === "timeline" ? "时间线" : "事件表"}
            </button>
          ))}
        </div>
      </div>
      <span className={s.sep} />
      <div className={s.group}>
        <span className={`${s.select} ${s.period}`}>{p.periodPicker}<ChevronDown aria-hidden /></span>
        <button type="button" data-toggle-all="" className={`${s.tb} ${s.iconNarrow}`} onClick={p.onToggleAll} title="展开或收起全部事件卡片">
          {p.allExpanded ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
          <span className={s.lbl}>{p.allExpanded ? "全部收起" : "全部展开"}</span>
        </button>
        <div className={s.zoom} title={p.view === "timeline" ? "缩放时间轴间距（也可滚轮）" : "缩放时间轴（也可 Ctrl + 滚轮）"}>
          <button type="button" aria-label="缩小" disabled={p.view === "table" && p.canZoomOut === false} onClick={() => p.onZoom(-1)}><Minus aria-hidden /></button>
          <span className={s.value} data-zoom-value="">{p.zoomLabel}</span>
          <button type="button" aria-label="放大" disabled={p.view === "table" && p.canZoomIn === false} onClick={() => p.onZoom(1)}><Plus aria-hidden /></button>
          <span className={`${s.div} ${s.hideNarrow1}`} aria-hidden />
          <button type="button" className={`${s.reset} ${s.hideNarrow1}`} onClick={() => p.onZoom(0)}>复位</button>
        </div>
      </div>
      <span className={s.spacer} />
      <div className={`${s.search} ${active ? s.active : ""} ${none ? s.none : ""}`} role="search">
        <Search aria-hidden />
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

/** docs/591: the importance key, as [level, label, dot size in px]. */
const IMPORTANCE_KEY = [[1, "一般", 6], [2, "重要", 9], [3, "关键", 13]] as const;
/** docs/577 §8–§9, docs/591: type legend with counts (click hides, double-click solos) and the importance key (click
 * hides). Hidden types and levels are left out of the views, not faded. */
export function WorldlineLegend({ counts, hidden, onToggle, onSolo, hiddenImportance = new Set(), onToggleImportance, shown, onShowAll, range, total, selected = 0, zoomNote }: {
  counts: Record<EventCategory, number>;
  hidden: ReadonlySet<EventCategory>;
  onToggle(c: EventCategory): void;
  onSolo(c: EventCategory): void;
  hiddenImportance?: ReadonlySet<number>;
  onToggleImportance?(importance: number): void;
  /** docs/591: events left after the filter (undefined when nothing is hidden). */
  shown?: number;
  onShowAll?(): void;
  range: React.ReactNode;
  total: number;
  /** docs/584: the timeline multi-selection size (shown from 2). */
  selected?: number;
  /** docs/592 §2.4: the timeline's zoom-level note (subscribes to its own store). */
  zoomNote?: React.ReactNode;
}) {
  renderProbe("WorldlineLegend");
  return (
    <div className={s.status}>
      <span data-range="">{range}</span>
      {/* docs/591 code review 7: the live region is always mounted, and the button sits outside it. */}
      <span data-filter-count={shown === undefined ? undefined : ""} aria-live="polite">
        {shown === undefined ? `${total} 件事件` : `显示 ${shown} / 共 ${total} 件事件`}
      </span>
      {shown !== undefined && onShowAll && <button type="button" data-show-all="" className={s.showAll} onClick={onShowAll}>显示全部</button>}
      {zoomNote}
      {selected >= 2 && <span data-selection-count="">已选 {selected} 个事件</span>}
      <span className={s.legend}>
        <span role="group" aria-label="类型筛选（点击隐藏或显示，双击只看这一类）" className={s.types}>
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
        </span>
        <span className={s.sizes} title="圆点大小表示重要程度；点击隐藏或显示" role="group" aria-label="重要度筛选（点击隐藏或显示）">
          <span>重要度</span>
          {IMPORTANCE_KEY.map(([level, label, size]) => (
            <button key={level} data-legend-importance={level} aria-pressed={!hiddenImportance.has(level)} onClick={() => onToggleImportance?.(level)}>
              <i style={{ width: size, height: size }} />
              {label}
            </button>
          ))}
        </span>
      </span>
    </div>
  );
}
