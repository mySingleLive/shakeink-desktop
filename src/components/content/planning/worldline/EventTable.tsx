"use client";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CARD_HEAD,
  CATEGORY_VAR,
  railMarks,
  tableLayout,
  descendants,
  type EventTree,
  type TableLayout,
  type TreeNode,
} from "@/lib/planning/worldline-layout";
import { EventCard, WorldlineCardContext } from "./EventCard";
import s from "./worldline.module.css";

/** docs/577 §3 / docs/580 §5.1: the event table — a time rail and grouped cards in one scroller. Positions come from
 * the DOM-free height model (tableLayout); ResizeObserver only feeds measured heights of expanded cards. */
export function EventTable({
  tree,
  expanded,
  folded,
  selected,
  editing,
  hitId,
  dimmed,
  zoom,
  periods,
  onFold,
  onZoom,
  onScrollTop,
  scrollerRef,
}: {
  tree: EventTree;
  expanded: ReadonlySet<string>;
  folded: ReadonlySet<string>;
  selected: string | null;
  editing: string | null;
  hitId: string | null;
  dimmed: (id: string) => boolean;
  zoom: number;
  periods: readonly { id: string; start: number; end: number | null }[];
  onFold(id: string): void;
  onZoom(next: number, anchor: { id: string; offset: number } | null): void;
  onScrollTop(firstVisibleId: string | null): void;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ctx = useContext(WorldlineCardContext)!;
  const [heights, setHeights] = useState<Record<string, number>>({});
  const open = useMemo(() => new Set([...expanded, ...(editing ? [editing] : [])]), [expanded, editing]);
  const layout: TableLayout = useMemo(
    () => tableLayout(tree, heights, zoom, ctx.adapter, { expanded: open, folded }),
    [tree, heights, zoom, ctx.adapter, open, folded],
  );
  const marks = useMemo(
    () => railMarks(layout, layout.segments, ctx.adapter, { selected, periods }),
    [layout, ctx.adapter, selected, periods],
  );
  // Measured heights of expanded cards, at most one state update per frame; scroll anchoring keeps the first visible
  // card in place when a card above it changes height (§5.1 R3).
  const cardsRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const root = cardsRef.current;
    if (!root) return;
    let frame = 0;
    const pending: Record<string, number> = {};
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.measureId!;
        pending[id] = Math.ceil((entry.target as HTMLElement).getBoundingClientRect().height);
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sc = scrollerRef.current;
        const first = sc ? firstVisible(layout, sc.scrollTop) : null;
        anchor.current = first ? { id: first, top: (layout.byId.get(first)?.top ?? 0) - (sc?.scrollTop ?? 0) } : null;
        setHeights((old) => {
          let changed = false;
          const next = { ...old };
          for (const [id, h] of Object.entries(pending)) if (next[id] !== h) { next[id] = h; changed = true; }
          return changed ? next : old;
        });
      });
    });
    root.querySelectorAll<HTMLElement>("[data-measure-id]").forEach((el) => observer.observe(el));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [layout, scrollerRef]);
  useLayoutEffect(() => {
    const sc = scrollerRef.current, a = anchor.current;
    if (!sc || !a) return;
    const card = layout.byId.get(a.id);
    if (card) sc.scrollTop = card.top - a.top;
    anchor.current = null;
  }, [layout, scrollerRef]);

  const node = (id: string) => tree.byId.get(id) ?? tree.pending.find((p) => p.id === id);
  const leadX = 210 + 12;
  return (
    <div
      ref={scrollerRef}
      data-table-scroller=""
      className={s.scroller}
      title="Ctrl + 滚轮缩放时间轴间距"
      onScroll={(e) => onScrollTop(firstVisible(layout, e.currentTarget.scrollTop))}
      onWheel={(e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const sc = e.currentTarget, rect = sc.getBoundingClientRect(), y = e.clientY - rect.top + sc.scrollTop;
        const under = layout.cards.find((c) => c.top + c.height > y) ?? null;
        onZoom(zoom * (e.deltaY > 0 ? 1 / 1.15 : 1.15), under ? { id: under.id, offset: under.top - sc.scrollTop } : null);
      }}
    >
      {/* Bottom room of at least 2/3 of the viewport, so locate can bring the last card to the upper third (WU-62). */}
      <div data-event-table="" style={{ position: "relative", height: `calc(${layout.height}px + max(80px, 67%))` }}>
        <div className={s.rail} style={{ height: layout.height }} aria-hidden={false}>
          {marks.lines.map((l) => (
            <div key={`l${l.segment}`} className={s.railLine} style={{ top: l.top, height: l.height }} />
          ))}
          {marks.periods.map((p, i) => (
            <div key={`p${p.id}${i}`} data-rail-period={p.id} className={s.railPeriod} style={{ top: p.y0, height: Math.max(2, p.y1 - p.y0) }} />
          ))}
          {marks.ticks.map((t, i) => (
            <span key={`t${i}`}>
              <i className={s.railTick} style={{ top: t.y }} />
              {t.label && <span className={s.railTickLabel} style={{ top: t.y }}>{t.label}</span>}
            </span>
          ))}
          {marks.badges.map((b, i) => (
            <div key={`b${i}`} data-rail-badge={b.kind} className={s.railBadge} style={{ top: b.y }}>{b.text}</div>
          ))}
          {layout.breaks.map((b, i) => (
            <div key={`k${i}`} data-rail-break={b.kind} className={s.railBreak} style={{ top: b.top, height: b.height }}>
              {b.kind === "gap" ? `相隔 ${gapText(b.gap, ctx.adapter)}` : "时间待定位"}
            </div>
          ))}
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={240} height={layout.height}>
            {[...marks.points].map(([id, y]) => {
              const card = layout.byId.get(id), n = node(id);
              if (!card || !n) return null;
              const x1 = leadX + card.left, yh = card.top + CARD_HEAD;
              return (
                <path
                  key={id}
                  data-rail-lead={id}
                  className={`${s.lead} ${n.parent ? s.child : ""} ${selected === id ? s.hot : ""}`}
                  style={{ "--ec": `var(${CATEGORY_VAR[n.event.category]})` } as React.CSSProperties}
                  d={`M165 ${y} C 190 ${y}, ${x1 - 30} ${yh}, ${x1} ${yh}`}
                />
              );
            })}
          </svg>
          {marks.dots.map((d) => {
            const lead = node(d.lead)!;
            const allDim = d.ids.every(dimmed);
            return (
              <b
                key={d.ids.join(",")}
                data-rail-dot=""
                data-event-id={d.lead}
                data-importance={d.importance}
                {...(d.cluster ? { "data-cluster": "" } : {})}
                className={`${s.railDot} ${d.cluster ? s.cluster : s[`d${d.importance}`]} ${allDim ? s.dim : ""} ${d.ids.includes(selected ?? "") ? s.hot : ""}`}
                style={{ top: d.y, "--ec": `var(${CATEGORY_VAR[lead.event.category]})` } as React.CSSProperties}
                aria-label={`${lead.event.title} ${ctx.adapter.label(d.t, 1, lead.event.time.precision)} ${["一般", "重要", "关键"][d.importance - 1]}`}
                title={d.cluster ? d.ids.map((id) => node(id)?.event.title).join("\n") : undefined}
              >
                {d.cluster ? d.count : null}
              </b>
            );
          })}
          {marks.labels.map((l, i) =>
            l.visible ? (
              <span key={`lb${i}`} className={`${s.railLabel} ${l.ids.includes(selected ?? "") ? s.hot : ""}`} style={{ top: l.y }}>{l.text}</span>
            ) : null,
          )}
        </div>
        <div ref={cardsRef} className={s.cards} style={{ height: layout.height }}>
          {renderLevel(layout, 0, layout.height, null, 0, 0, (c, top, left) => {
            const n = node(c.id)!;
            const open = c.expanded;
            return (
              <div
                key={c.id}
                data-measure-id={open ? c.id : undefined}
                className={`${s.slot} ${open ? s.slotOpen : ""}`}
                style={{ top, marginLeft: left }}
              >
                <EventCard
                  event={n.event}
                  expanded={expanded.has(c.id)}
                  selected={selected === c.id}
                  hit={hitId === c.id}
                  dimmed={dimmed(c.id)}
                  editing={editing === c.id}
                  childCount={n.children.length}
                  descendantCount={descendants(n).length}
                  folded={folded.has(c.id)}
                  placed={c.start !== null}
                  maxAvatars={4}
                  variant="table"
                  onFold={onFold}
                />
              </div>
            );
          }, (g, top, left, inner) => {
            const n = node(g.id)!;
            return (
              <div
                key={`g${g.id}`}
                data-event-group=""
                data-parent-title={n.event.title}
                className={s.groupBox}
                style={{ top, height: g.bottom - g.top, marginLeft: left, "--ec": `var(${CATEGORY_VAR[n.event.category]})` } as React.CSSProperties}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Card = TableLayout["cards"][number];
type Group = TableLayout["groups"][number];
/** Renders cards and group boxes as a DOM tree: each group holds the cards and inner groups inside its range, with
 * coordinates relative to the group, so a parent's family is one subtree (WU-41). */
function renderLevel(
  layout: TableLayout, top: number, bottom: number, owner: Group | null, originTop: number, originLeft: number,
  card: (c: Card, top: number, left: number) => React.ReactNode,
  group: (g: Group, top: number, left: number, inner: React.ReactNode) => React.ReactNode,
): React.ReactNode[] {
  // Inside a group of depth d: its own header card (depth d) and everything one level down (depth d + 1).
  const depth = owner ? owner.depth + 1 : 0;
  const out: React.ReactNode[] = [];
  const groups = layout.groups.filter((g) => g !== owner && g.depth === depth && g.top >= top && g.bottom <= bottom);
  const inGroup = (y: number) => groups.some((g) => y >= g.top && y < g.bottom);
  for (const c of layout.cards) {
    if (c.top < top || c.top >= bottom) continue;
    const header = owner && c.id === owner.id;
    if (header || (c.depth === depth && !inGroup(c.top))) out.push(card(c, c.top - originTop, c.left - originLeft));
  }
  for (const g of groups)
    out.push(group(g, g.top - originTop, g.left - originLeft, renderLevel(layout, g.top, g.bottom, g, g.top, g.left, card, group)));
  return out;
}

function firstVisible(layout: TableLayout, scrollTop: number) {
  return layout.cards.find((c) => c.top + c.height > scrollTop + 8)?.id ?? null;
}
function gapText(gap: number, adapter: { dayHours: number }) {
  const days = gap / adapter.dayHours;
  if (days >= 365) return `约 ${Math.round(days / 365.2425).toLocaleString()} 年`;
  if (days >= 30) return `约 ${Math.round(days / 30)} 个月`;
  return `${Math.round(days)} 天`;
}
export type { TreeNode };
