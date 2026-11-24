"use client";
import { createContext, memo, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { EventCardEditor, EditorTitle, type EventEditorValue } from "./EventCardEditor";
import { characterHover } from "./CharacterHover";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { resolveTime, type PlanningData, type PlanningEvent } from "@/lib/planning/domain";
import { CATEGORY_VAR, type CalendarAdapter } from "@/lib/planning/worldline-layout";
import s from "./worldline.module.css";
import { renderProbe } from "@/lib/planning/render-probe";

export const IMPORTANCE_LABELS = ["一般", "重要", "关键"] as const;

/** docs/580 §7.1 (N3): values every card reads; built with useMemo so collapsed cards keep their memo. */
export interface WorldlineCardContextValue {
  data: PlanningData;
  adapter: CalendarAdapter;
  readonly: boolean;
  /** docs/599 §7: person pills open the character tab. */
  novelId: string;
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
  /** docs/599 R9: a person pill on an open (not editing) card opens that character's detail tab. */
  onOpenCharacter(id: string, name: string): void;
}
export const WorldlineCardContext = createContext<WorldlineCardContextValue | null>(null);
/** docs/580 §7.1 (P3) / docs/599 §2, §12.7: the in-place editor's draft lives in its own context; only the editing card
 * (EditingEventCard) subscribes, so typing never re-renders the other cards. */
export const EventEditorContext = createContext<EventEditorValue | null>(null);

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

/** Marks overflowing titles so CSS fades their last 36px (577 §11, WU-35); docs/592: a 2-line title that still overflows
 * its fixed 36px fades the end of its second line. */
export function useFade<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) el.setAttribute("data-fade", "");
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
  /** Hovered here or through its rail dot: the card takes its hover border. */
  hot?: boolean;
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
  /** docs/588 §1: event table, the parent card heading its group box (full width, flush with the box top). */
  groupHead?: boolean;
  /** docs/584: on the timeline, the number of selected events when this card is one of ≥ 2 (batch menu items). */
  selectionSize?: number;
  /** docs/592 R1: collapsed title lines decided by the layout (CSS fixes the title height to them). */
  titleLines?: 1 | 2;
  /** docs/592 R5: a parent whose children are folded: drawn as a stacked card. */
  stacked?: boolean;
  onFold?(id: string): void;
}

/** One event card, collapsed (34px pill) or expanded (577 §2). The 「…」 menu keeps the `details[data-card-menu]`
 * structure so the existing CM tests and outside-click/Escape handling keep working (581 §7). */
export const EventCard = memo(function EventCard(p: EventCardProps) {
  renderProbe("EventCard");
  return p.editing ? <EditingEventCard {...p} /> : <CardView {...p} editor={null} />;
});
/** docs/599 §12.7: the editing card reads the draft from EventEditorContext and draws it (dot, colour, title). */
function EditingEventCard(p: EventCardProps) {
  const editor = useContext(EventEditorContext);
  if (!editor || editor.draft.id !== p.event.id) return <CardView {...p} editing={false} editor={null} />;
  return <CardView {...p} event={editor.draft} savedTitle={p.event.title} editor={editor} />;
}
function CardView(p: EventCardProps & { editor: EventEditorValue | null; savedTitle?: string }) {
  const ctx = useContext(WorldlineCardContext)!;
  const e = p.event;
  const lines = p.expanded || p.editing ? 1 : (p.titleLines ?? 1);
  const stacked = !!p.stacked && !p.expanded && !p.editing;
  const titleRef = useFade<HTMLHeadingElement>(`${e.title}/${p.expanded}/${lines}`);
  const press = useRef<{ x: number; y: number } | null>(null);
  const factRef = useBodyMarks<HTMLDivElement>(ctx.searchTerms, `${e.fact}/${p.expanded}/${p.editing}`);
  const frozen = ctx.frozen.has(e.id);
  const people = e.people.map((id) => ctx.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const shown = people.slice(0, p.maxAvatars);
  const time = timeText(e, ctx);
  const card = (
    <article
      data-event-card=""
      data-event-id={e.id}
      data-title-lines={lines}
      {...(stacked ? { "data-stacked": "" } : {})}
      data-importance={e.importance}
      {...(p.placed ? { "data-placed": "" } : {})}
      {...(p.selected ? { "data-selected": "" } : {})}
      {...(p.hit ? { "data-hit": "" } : {})}
      {...(p.hot ? { "data-hot": "" } : {})}
      aria-label={p.savedTitle ?? e.title}
      aria-expanded={p.expanded || p.editing}
      {...(p.editor ? { "data-editing": "", tabIndex: -1, ref: p.editor.cardRef } : {})}
      className={`${s.card} ${p.expanded || p.editing ? s.open : ""} ${p.editor ? s.editing : ""} ${p.dimmed ? s.dim : ""} ${p.selected ? s.selected : ""} ${p.hot ? s.hot : ""} ${p.hit ? s.hit : ""} ${p.groupHead ? s.groupHead : ""} ${stacked ? s.stack : ""}`}
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
          <span className={s.ln}><button
            type="button"
            data-fold=""
            className={`${s.fold} ${p.folded ? s.foldClosed : ""}`}
            aria-label={`${p.folded ? "展开" : "折叠"}${e.title}的子事件`}
            aria-expanded={!p.folded}
            onClick={() => p.onFold!(e.id)}
          >
            <ChevronDown size={14} strokeWidth={2.25} aria-hidden />
          </button></span>
        )}
        <span className={s.ln}><span className={`${s.dot} ${s[`i${e.importance}`]} ${e.time.kind === "window" ? s.dotWindow : ""}`} aria-hidden /></span>
        <h3
          ref={titleRef}
          data-card-title=""
          data-lines={lines}
          className={s.title}
          title={p.editor ? undefined : e.title}
          onPointerDown={(ev) => !p.editor && ev.button === 0 && !frozen && !ctx.readonly && ctx.onStartTimeDrag(ev, e.id)}
        >
          {p.editor ? <EditorTitle editor={p.editor} /> : <Highlight text={e.title} terms={ctx.searchTerms} />}
        </h3>
        {!p.expanded && !p.editing && shown.length > 0 && (
          <span className={s.ln}><span data-avatars="" className={s.avatars} title={people.map((c) => c.name).join("、")}>
            {shown.map((c) => (
              <i key={c.id}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</i>
            ))}
            {people.length > shown.length && <i className={s.more}>+{people.length - shown.length}</i>}
          </span></span>
        )}
        {p.childCount > 0 && (
          <span className={s.ln}><span className={s.kids} title={`${p.descendantCount} 个子事件`}>
            {p.expanded ? `${p.childCount} 个子事件` : `▸ ${p.descendantCount}`}
          </span></span>
        )}
        {/* docs/599 R14 / §6.1: 新建子事件 on every card; the editing card's own button is disabled. */}
        <span className={s.ln}><button
          type="button"
          data-add-child=""
          className={s.addKid}
          aria-label="新建子事件"
          title={p.editor ? "先保存或取消当前编辑" : "新建子事件"}
          disabled={ctx.readonly || frozen || !!p.editor}
          onClick={() => ctx.onMenu("newChild", e.id)}
        >
          {/* A CSS-mask icon, not an SVG element: one node per card (CP-07: 885 cards mount on a zoom step). */}
          <i className={s.addKidIcon} aria-hidden />
        </button></span>
        {p.variant === "timeline" && (
          <span className={s.ln}><button
            type="button"
            data-card-expand=""
            disabled={!!p.editor}
            className={s.expand}
            aria-label={`${p.expanded ? "收起" : "展开"}${e.title}`}
            aria-expanded={p.expanded}
            onClick={() => ctx.onExpand(e.id)}
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden className={p.expanded ? s.expandUp : undefined} />
          </button></span>
        )}
        <span className={s.ln}><details data-card-menu="" className={s.menuHost} onClick={(ev) => {
          if ((ev.target as Element).closest("button")) (ev.currentTarget as HTMLDetailsElement).open = false;
        }}>
          <summary aria-label={`${e.title}更多操作`}>
            <MoreHorizontal size={16} />
          </summary>
          <div className={s.menu}>
            <button onClick={() => ctx.onMenu("quote", e.id)}>引用到对话</button>
            {(p.selectionSize ?? 0) >= 2 && <button onClick={() => ctx.onMenu("quoteSelection", e.id)}>引用所选 {p.selectionSize} 个事件到对话</button>}
            <button onClick={() => ctx.onMenu("detail", e.id)}>详情</button>
            <button disabled={ctx.readonly || frozen || !!p.editor} onClick={() => ctx.onMenu("edit", e.id)}>编辑</button>
            {p.childCount > 0 && <button onClick={() => ctx.onMenu("locateChildren", e.id)}>定位子事件</button>}
            <button disabled={ctx.readonly || frozen || !!p.editor} onClick={() => ctx.onMenu("newChild", e.id)}>新建子事件</button>
            <button disabled={ctx.readonly || frozen || !!p.editor} onClick={() => ctx.onMenu("copy", e.id)}>复制</button>
            <button disabled={ctx.readonly || frozen || !!p.editor || p.childCount > 0} title={p.childCount > 0 ? "先删除子事件" : undefined} onClick={() => ctx.onMenu("delete", e.id)}>删除</button>
            {(p.selectionSize ?? 0) >= 2 && <button disabled={ctx.readonly || frozen || !!p.editor} onClick={() => ctx.onMenu("deleteSelection", e.id)}>删除所选 {p.selectionSize} 个事件</button>}
            <button disabled={ctx.readonly} onClick={() => ctx.onMenu("fork", e.id)}>从此分叉</button>
          </div>
        </details></span>
      </div>
      {p.editor ? (
        <EventCardEditor editor={p.editor} variant={p.variant} renderRefs={() => ctx.renderRefs(e)} />
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
              <div data-people="" className={s.people}>
                {people.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    data-character-pill={c.id}
                    className={`${s.who} ${s.whoLink}`}
                    aria-label={`打开角色 ${c.name}`}
                    onClick={() => { characterHover.close(); ctx.onOpenCharacter(c.id, c.name); }}
                    onPointerEnter={(ev) => characterHover.enter(c.id, ev.currentTarget)}
                    onPointerLeave={() => characterHover.leave()}
                  >
                    <i>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.name.slice(0, 1)}</i>
                    {c.name}
                  </button>
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
  // docs/592 R5: two layers peek out below the stacked card (the wrapper's ::before / ::after, isolation keeps them under it).
  return stacked ? <div data-stack-wrap="" className={s.stackWrap} style={{ "--ec": `var(${CATEGORY_VAR[e.category]})` } as React.CSSProperties}>{card}</div> : card;
}

/** Card time row, same text as the old card (WT-55, EC-73): the start cut to the event precision, the source time words,
 * then 时点 / window / duration. The span no longer reads the window (§7.1 R4): day or coarser precision uses 48 hours
 * (date only), hour precision 1 hour (keeps the minute). */
export function timeText(e: PlanningEvent, ctx: Pick<WorldlineCardContextValue, "data" | "adapter" | "frozen">) {
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
