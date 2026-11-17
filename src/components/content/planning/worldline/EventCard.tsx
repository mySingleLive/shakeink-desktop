"use client";
import { createContext, memo, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { resolveTime, type PlanningData, type PlanningEvent } from "@/lib/planning/domain";
import { CATEGORY_VAR, type CalendarAdapter } from "@/lib/planning/worldline-layout";
import s from "./worldline.module.css";

export const IMPORTANCE_LABELS = ["一般", "重要", "关键"] as const;

/** docs/580 §7.1 (N3): values every card reads; built with useMemo so collapsed cards keep their memo. */
export interface WorldlineCardContextValue {
  data: PlanningData;
  adapter: CalendarAdapter;
  readonly: boolean;
  hasDraft: boolean;
  characters: readonly { id: string; name: string; avatarUrl: string | null }[];
  searchTerms: readonly string[];
  frozen: ReadonlySet<string>;
  /** Stable callbacks (one identity for the panel's lifetime). */
  onToggle(id: string, detail: number): void;
  /** docs/584: timeline clicks select (⌘/Ctrl toggles, Shift adds); a double click (detail ≥ 2) edits. */
  onSelect(id: string, detail: number, mods: { toggle: boolean; add: boolean }): void;
  /** Toggles the expanded state at once (the timeline's expand button). */
  onExpand(id: string): void;
  onMenu(action: "quote" | "detail" | "edit" | "locateChildren" | "newChild" | "copy" | "delete" | "fork" | "quoteSelection" | "deleteSelection", id: string): void;
  onStartTimeDrag(event: React.PointerEvent, id: string): void;
  renderRefs(event: PlanningEvent): ReactNode;
}
export const WorldlineCardContext = createContext<WorldlineCardContextValue | null>(null);
/** docs/580 §7.1 (P3): the in-place editor lives in its own context; only the editing card subscribes. */
export const EventEditorContext = createContext<(() => ReactNode) | null>(null);
function EventEditorSlot() {
  const render = useContext(EventEditorContext);
  return <>{render?.()}</>;
}

/** Wraps search hits in <mark> without changing the source text (§7.5 S7). */
export function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  const parts = text.split(pattern);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** docs/577 §12 / 581 WU-66c: wraps search hits in the rendered Markdown body with <mark>, via a TreeWalker over
 * its text nodes (the Markdown renderer owns the markup, so the marks are added after it renders and removed first). */
export function useBodyMarks<T extends HTMLElement>(terms: readonly string[], dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const clear = () => {
      for (const m of [...root.querySelectorAll("mark[data-search-mark]")]) m.replaceWith(document.createTextNode(m.textContent ?? ""));
      root.normalize();
    };
    clear();
    if (!terms.length) return;
    const pattern = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const node of nodes) {
      const text = node.data;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of text.matchAll(pattern)) {
        frag.append(text.slice(last, m.index));
        const mark = document.createElement("mark");
        mark.dataset.searchMark = "";
        mark.textContent = m[0];
        frag.append(mark);
        last = m.index! + m[0].length;
      }
      frag.append(text.slice(last));
      node.replaceWith(frag);
    }
    return clear;
  }, [terms, dep]);
  return ref;
}

/** Marks overflowing titles so CSS fades their last 36px (577 §11, WU-35). */
export function useFade<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.scrollWidth > el.clientWidth + 1) el.setAttribute("data-fade", "");
      else el.removeAttribute("data-fade");
    };
    // No synchronous check: reading scrollWidth in a layout effect forces a reflow per card (≈ 870 ms for the first
    // table render of a 995-event work). ResizeObserver reports every observed element once after layout.
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dep]);
  return ref;
}

export interface EventCardProps {
  event: PlanningEvent;
  expanded: boolean;
  selected: boolean;
  hit: boolean;
  dimmed: boolean;
  editing: boolean;
  childCount: number;
  descendantCount: number;
  folded: boolean;
  placed: boolean;
  /** Avatar limit: 4 in the table, 3 on the timeline (577 §12). */
  maxAvatars: number;
  variant: "table" | "timeline";
  /** docs/584: on the timeline, the number of selected events when this card is one of ≥ 2 (batch menu items). */
  selectionSize?: number;
  onFold?(id: string): void;
}

/** One event card, collapsed (34px pill) or expanded (577 §2). The 「…」 menu keeps the `details[data-card-menu]`
 * structure so the existing CM tests and outside-click/Escape handling keep working (581 §7). */
export const EventCard = memo(function EventCard(p: EventCardProps) {
  const ctx = useContext(WorldlineCardContext)!;
  const e = p.event;
  const titleRef = useFade<HTMLHeadingElement>(`${e.title}/${p.expanded}`);
  const press = useRef<{ x: number; y: number } | null>(null);
  const factRef = useBodyMarks<HTMLDivElement>(ctx.searchTerms, `${e.fact}/${p.expanded}/${p.editing}`);
  const frozen = ctx.frozen.has(e.id);
  const people = e.people.map((id) => ctx.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const shown = people.slice(0, p.maxAvatars);
  const time = timeText(e, ctx);
  return (
    <article
      data-event-card=""
      data-event-id={e.id}
      data-importance={e.importance}
      {...(p.placed ? { "data-placed": "" } : {})}
      {...(p.selected ? { "data-selected": "" } : {})}
      {...(p.hit ? { "data-hit": "" } : {})}
      aria-label={e.title}
      aria-expanded={p.expanded || p.editing}
      className={`${s.card} ${p.expanded || p.editing ? s.open : ""} ${p.dimmed ? s.dim : ""} ${p.selected ? s.selected : ""} ${p.hit ? s.hit : ""}`}
      style={{ "--ec": `var(${CATEGORY_VAR[e.category]})` } as React.CSSProperties}
      onPointerDownCapture={(ev) => { press.current = { x: ev.clientX, y: ev.clientY }; }}
      onClick={(ev) => {
        if ((ev.target as Element).closest("button,summary,a,input,select,textarea,label,[data-card-menu]")) return;
        if (p.editing) return;
        // 581 WU-39c: a press that travelled past 4px was a time drag, not a click.
        const at = press.current;
        press.current = null;
        if (at && Math.hypot(ev.clientX - at.x, ev.clientY - at.y) > 4) return;
        if (p.variant === "timeline") ctx.onSelect(e.id, ev.detail, { toggle: ev.metaKey || ev.ctrlKey, add: ev.shiftKey });
        else ctx.onToggle(e.id, ev.detail);
      }}
    >
      <div className={s.head}>
        {p.childCount > 0 && p.onFold && (
          <button
            type="button"
            data-fold=""
            className={`${s.fold} ${p.folded ? s.foldClosed : ""}`}
            aria-label={`${p.folded ? "展开" : "折叠"}${e.title}的子事件`}
            onClick={() => p.onFold!(e.id)}
          >
            ▾
          </button>
        )}
        <span className={`${s.dot} ${s[`i${e.importance}`]} ${e.time.kind === "window" ? s.dotWindow : ""}`} aria-hidden />
        <h3
          ref={titleRef}
          data-card-title=""
          className={s.title}
          title={e.title}
          onPointerDown={(ev) => ev.button === 0 && !frozen && !ctx.readonly && ctx.onStartTimeDrag(ev, e.id)}
        >
          <Highlight text={e.title} terms={ctx.searchTerms} />
        </h3>
        {!p.expanded && !p.editing && shown.length > 0 && (
          <span data-avatars="" className={s.avatars} title={people.map((c) => c.name).join("、")}>
            {shown.map((c) => (
              <i key={c.id}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</i>
            ))}
            {people.length > shown.length && <i className={s.more}>+{people.length - shown.length}</i>}
          </span>
        )}
        {p.childCount > 0 && (
          <span className={s.kids} title={`${p.descendantCount} 个子事件`}>
            {p.expanded ? `${p.childCount} 个子事件` : `▸ ${p.descendantCount}`}
          </span>
        )}
        {p.variant === "timeline" && (
          <button
            type="button"
            data-card-expand=""
            className={s.expand}
            aria-label={`${p.expanded ? "收起" : "展开"}${e.title}`}
            aria-expanded={p.expanded}
            onClick={() => ctx.onExpand(e.id)}
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden className={p.expanded ? s.expandUp : undefined} />
          </button>
        )}
        <details data-card-menu="" className={s.menuHost} onClick={(ev) => {
          if ((ev.target as Element).closest("button")) (ev.currentTarget as HTMLDetailsElement).open = false;
        }}>
          <summary aria-label={`${e.title}更多操作`}>
            <MoreHorizontal size={16} />
          </summary>
          <div className={s.menu}>
            <button onClick={() => ctx.onMenu("quote", e.id)}>引用到对话</button>
            {(p.selectionSize ?? 0) >= 2 && <button onClick={() => ctx.onMenu("quoteSelection", e.id)}>引用所选 {p.selectionSize} 个事件到对话</button>}
            <button onClick={() => ctx.onMenu("detail", e.id)}>详情</button>
            <button disabled={ctx.readonly || frozen || ctx.hasDraft} onClick={() => ctx.onMenu("edit", e.id)}>编辑</button>
            {p.childCount > 0 && <button onClick={() => ctx.onMenu("locateChildren", e.id)}>定位子事件</button>}
            <button disabled={ctx.readonly || frozen || ctx.hasDraft} onClick={() => ctx.onMenu("newChild", e.id)}>新建子事件</button>
            <button disabled={ctx.readonly || frozen || ctx.hasDraft} onClick={() => ctx.onMenu("copy", e.id)}>复制</button>
            <button disabled={ctx.readonly || frozen || ctx.hasDraft} onClick={() => ctx.onMenu("delete", e.id)}>删除</button>
            {(p.selectionSize ?? 0) >= 2 && <button disabled={ctx.readonly || ctx.hasDraft || frozen} onClick={() => ctx.onMenu("deleteSelection", e.id)}>删除所选 {p.selectionSize} 个事件</button>}
            <button disabled={ctx.readonly} onClick={() => ctx.onMenu("fork", e.id)}>从此分叉</button>
          </div>
        </details>
      </div>
      {p.editing ? (
        <EventEditorSlot />
      ) : (
        p.expanded && (
          <div className={s.body}>
            <div className={s.meta}>
              <span data-card-tag="" className={s.tag}>{e.category}</span>
              <small data-card-time="" className={s.when}>{time}</small>
              <span>{IMPORTANCE_LABELS[e.importance - 1]}</span>
            </div>
            <div data-markdown-preview="" className={s.fact} ref={factRef}>
              <MarkdownPreview source={e.fact} />
            </div>
            {people.length > 0 && (
              <div className={s.people}>
                {people.map((c) => (
                  <span key={c.id} className={s.who}>
                    <i>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</i>
                    {c.name}
                  </span>
                ))}
              </div>
            )}
            {e.changes.map((c) => (
              <div key={c.id} className={s.change}>
                <b>{ctx.characters.find((x) => x.id === c.character)?.name ?? "未知角色"}</b>
                {c.dimension}
                <span>{c.before}</span>→<span>{c.after}</span>
              </div>
            ))}
            {ctx.renderRefs(e)}
          </div>
        )
      )}
    </article>
  );
});

/** Card time row, same text as the old card (WT-55, EC-73): the start cut to the event precision, the source time words,
 * then 时点 / window / duration. The span no longer reads the window (§7.1 R4): day or coarser precision uses 48 hours
 * (date only), hour precision 1 hour (keeps the minute). */
function timeText(e: PlanningEvent, ctx: WorldlineCardContextValue) {
  let t: ReturnType<typeof resolveTime>;
  try { t = resolveTime(ctx.data, e); } catch { return "待定位"; }
  const unit = ctx.adapter.calendar.kind === "years" ? "年" : "小时";
  let out = t.start === null ? "待定位" : ctx.adapter.label(t.start, e.time.precision !== "hour" ? 48 : 1, e.time.precision);
  if (e.time.kind === "exact" && e.time.label) out += ` · ${e.time.label}`;
  if (e.time.kind === "window") out += `～${t.windowEnd} ${unit} · ${e.time.label || "时间窗口"}`;
  else if (e.duration === 0) out += " · 时点";
  else if (e.duration === null) out += ` · ${e.ongoing ? "持续中" : "结束未定"}`;
  else out += ` · 持续 ${+e.duration.toFixed(3)} ${unit}`;
  if (e.duration === null) out += " · 宽度仅供阅读";
  if (ctx.frozen.has(e.id)) out += " · 冻结前史";
  return out;
}
