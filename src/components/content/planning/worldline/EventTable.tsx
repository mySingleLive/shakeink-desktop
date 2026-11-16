"use client";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CARD_HEAD,
  CATEGORY_VAR,
  railMarks,
  tableLayout,
  descendants,
  ZOOM_MAX,
  ZOOM_MIN,
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
  // §5.1 [R3]: virtualize when the worldline has more than VIRTUAL_MIN events in total (pending included, folding
  // ignored), so folding never switches modes. The window is one screen above and below the viewport, in steps.
  const virtual = tree.byId.size > VIRTUAL_MIN;
  const [win, setWin] = useState<readonly [number, number]>([-Infinity, Infinity]);
  const [sticky, setSticky] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const live = useRef({ layout, zoom, virtual, marks });
  live.current = { layout, zoom, virtual, marks };
  const sync = useRef(() => {});
  sync.current = () => {
    const sc = scrollerRef.current;
    if (!sc) return;
    // WU-46: the last year badge scrolled past; empty near the top. Only a text change re-renders.
    const top = sc.scrollTop;
    setSticky(top <= 20 ? "" : (live.current.marks.badges.filter((b) => b.kind === "year" && b.y < top).at(-1)?.text ?? ""));
    if (!live.current.virtual) return setWin((w) => (w[0] === -Infinity && w[1] === Infinity ? w : [-Infinity, Infinity]));
    const h = Math.max(200, sc.clientHeight), step = Math.max(100, h / 4);
    const lo = Math.floor((sc.scrollTop - h) / step) * step, hi = Math.ceil((sc.scrollTop + 2 * h) / step) * step;
    setWin((w) => (w[0] === lo && w[1] === hi ? w : [lo, hi]));
  };
  useLayoutEffect(() => {
    sync.current();
    const sc = scrollerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => sync.current());
    ro.observe(sc);
    return () => ro.disconnect();
  }, [scrollerRef, virtual]);
  // One anchor for both height corrections and Ctrl + wheel: a card id and its screen offset to restore once the new
  // layout is committed (§5.1 R3). While a wheel zoom is recent, the card under the pointer stays the anchor.
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const zoomAnchor = useRef<{ id: string; until: number } | null>(null);
  const anchorNow = (id: string | null) => {
    const sc = scrollerRef.current, c = id ? live.current.layout.byId.get(id) : undefined;
    anchor.current = sc && c ? { id: c.id, top: c.top - sc.scrollTop } : null;
  };

  // Rendered cards: inside the window, or selected / search hit / being edited, so locate can always find them.
  const forced = useMemo(() => new Set([selected, hitId, editing].filter((x): x is string => !!x)), [selected, hitId, editing]);
  const [lo, hi] = win;
  const forcedTops = virtual ? [...forced].map((id) => layout.byId.get(id)?.top).filter((t): t is number => t !== undefined) : [];
  const cardShown = (c: Card) => !virtual || forced.has(c.id) || (c.top < hi && c.top + c.height > lo);
  const groupShown = (g: Group) => !virtual || (g.top < hi && g.bottom > lo) || forcedTops.some((t) => t >= g.top && t < g.bottom);
  const rendered = new Set<string>();
  const node = (id: string) => tree.byId.get(id) ?? tree.pending.find((p) => p.id === id);
  const cardNodes = renderLevel(layout, 0, layout.height, null, 0, 0, cardShown, groupShown, (c, top, left) => {
    rendered.add(c.id);
    const n = node(c.id)!;
    const isOpen = c.expanded;
    return (
      <div
        key={c.id}
        data-measure-id={isOpen ? c.id : undefined}
        className={`${s.slot} ${isOpen ? s.slotOpen : ""}`}
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
  });
  const openKey = [...rendered].filter((id) => layout.byId.get(id)?.expanded).join(",");

  // Measured heights of rendered expanded cards, at most one state update per frame (§5.1).
  const cardsRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
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
        const old = heightsRef.current, changed = Object.entries(pending).filter(([id, h]) => old[id] !== h);
        for (const id of Object.keys(pending)) delete pending[id];
        if (!changed.length) return;
        const sc = scrollerRef.current, z = zoomAnchor.current;
        anchorNow(z && z.until > performance.now() ? z.id : sc ? firstVisible(live.current.layout, sc.scrollTop) : null);
        setHeights((prev) => {
          const next = { ...prev };
          for (const [id, h] of changed) next[id] = h;
          return next;
        });
      });
    });
    root.querySelectorAll<HTMLElement>("[data-measure-id]").forEach((el) => observer.observe(el));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, openKey, scrollerRef]);
  useLayoutEffect(() => {
    const sc = scrollerRef.current, a = anchor.current;
    anchor.current = null;
    if (!sc || !a) return;
    const card = layout.byId.get(a.id);
    if (card) sc.scrollTop = card.top - a.top;
    sync.current();
  }, [layout, scrollerRef]);

  // Ctrl + wheel zoom around the card under the pointer. React's wheel listener is passive, so a native one is needed
  // to stop the page zoom and the scroll.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { layout: l, zoom: z } = live.current;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * (e.deltaY > 0 ? 1 / 1.15 : 1.15) * 100) / 100));
      if (next === z) return;
      const y = e.clientY - sc.getBoundingClientRect().top + sc.scrollTop;
      const under = l.cards.find((c) => c.top + c.height > y) ?? null;
      zoomAnchor.current = under ? { id: under.id, until: performance.now() + 400 } : null;
      anchorNow(under?.id ?? null);
      onZoomRef.current(next, under ? { id: under.id, offset: under.top - sc.scrollTop } : null);
    };
    sc.addEventListener("wheel", wheel, { passive: false });
    return () => sc.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollerRef]);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  const [panelWidth, setPanelWidth] = useState(0);
  useLayoutEffect(() => {
    const host = scrollerRef.current?.closest<HTMLElement>("[data-worldline-root]") ?? scrollerRef.current?.closest<HTMLElement>("[data-worldline-panel]");
    if (!host) return;
    const ro = new ResizeObserver(() => setPanelWidth(host.clientWidth));
    ro.observe(host);
    setPanelWidth(host.clientWidth);
    return () => ro.disconnect();
  }, [scrollerRef]);
  const inWin = (y: number) => !virtual || (y >= lo && y <= hi);
  const hot = (ids: readonly string[]) => ids.includes(selected ?? "") || (hover !== null && ids.includes(hover));
  // The rail narrows with the panel (worldline.module.css @container ≤ 640px); leads follow the same geometry.
  const narrow = panelWidth > 0 && panelWidth <= 640;
  const railW = narrow ? 120 : 210, dotX = narrow ? 92 : 158;
  const leadX = railW + 12;
  return (
    <div
      ref={scrollerRef}
      data-table-scroller=""
      className={s.scroller}
      style={{ overflowAnchor: "none" }}
      title="Ctrl + 滚轮缩放时间轴间距"
      onScroll={(e) => {
        sync.current();
        onScrollTop(firstVisible(layout, e.currentTarget.scrollTop));
      }}
    >
      <div data-sticky-year="" className={s.stickyYear}>{sticky && <span>{sticky}</span>}</div>
      {/* Bottom room of at least 2/3 of the viewport, so locate can bring the last card to the upper third (WU-62). */}
      <div data-event-table="" {...(virtual ? { "data-virtual": "" } : {})} style={{ position: "relative", height: `calc(${layout.height}px + max(80px, 67%))` }}>
        <div className={s.rail} style={{ height: layout.height }} aria-hidden={false}>
          {marks.lines.map((l) => (
            <div key={`l${l.segment}`} className={s.railLine} style={{ top: l.top, height: l.height }} />
          ))}
          {marks.periods.map((p, i) => (
            <div key={`p${p.id}${i}`} data-rail-period={p.id} className={s.railPeriod} style={{ top: p.y0, height: Math.max(2, p.y1 - p.y0) }} />
          ))}
          {marks.ticks.map((t, i) => inWin(t.y) && (
            <span key={`t${i}`}>
              <i className={s.railTick} style={{ top: t.y }} />
              {t.label && <span className={s.railTickLabel} style={{ top: t.y }}>{t.label}</span>}
            </span>
          ))}
          {marks.badges.map((b, i) => inWin(b.y) && (
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
              if (!card || !n || !rendered.has(id)) return null;
              const x1 = leadX + card.left, yh = card.top + CARD_HEAD;
              return (
                <path
                  key={id}
                  data-rail-lead={id}
                  className={`${s.lead} ${n.parent ? s.child : ""} ${selected === id || hover === id ? s.hot : ""}`}
                  style={{ "--ec": `var(${CATEGORY_VAR[n.event.category]})` } as React.CSSProperties}
                  d={`M${dotX + 7} ${y} C ${dotX + 32} ${y}, ${x1 - 30} ${yh}, ${x1} ${yh}`}
                />
              );
            })}
          </svg>
          {marks.dots.map((d) => {
            if (!inWin(d.y) && !d.ids.some((id) => forced.has(id))) return null;
            const lead = node(d.lead)!;
            const allDim = d.ids.every(dimmed);
            return (
              <b
                key={d.ids.join(",")}
                data-rail-dot=""
                data-event-id={d.lead}
                data-importance={d.importance}
                {...(d.cluster ? { "data-cluster": "" } : {})}
                className={`${s.railDot} ${d.cluster ? s.cluster : s[`d${d.importance}`]} ${allDim ? s.dim : ""} ${hot(d.ids) ? s.hot : ""}`}
                style={{ top: d.y, "--ec": `var(${CATEGORY_VAR[lead.event.category]})` } as React.CSSProperties}
                aria-label={`${lead.event.title} ${ctx.adapter.label(d.t, 1, lead.event.time.precision)} ${["一般", "重要", "关键"][d.importance - 1]}`}
                title={d.cluster ? d.ids.map((id) => node(id)?.event.title).join("\n") : undefined}
              >
                {d.cluster ? d.count : null}
              </b>
            );
          })}
          {marks.labels.map((l, i) =>
            (l.visible && inWin(l.y)) || (l.text && hot(l.ids)) ? (
              <span key={`lb${i}`} data-rail-label="" data-label-for={l.ids.join(" ")} className={`${s.railLabel} ${hot(l.ids) ? s.hot : ""}`} style={{ top: l.y }}>{l.text}</span>
            ) : null,
          )}
        </div>
        <div
          ref={cardsRef}
          className={s.cards}
          style={{ height: layout.height }}
          onPointerOver={(e) => {
            const id = (e.target as Element).closest<HTMLElement>("[data-event-card]")?.dataset.eventId ?? null;
            if (id !== hover) setHover(id);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {cardNodes}
        </div>
      </div>
    </div>
  );
}

/** docs/580 §5.1 [R3]: more events than this turns on virtualization. */
export const VIRTUAL_MIN = 300;
type Card = TableLayout["cards"][number];
type Group = TableLayout["groups"][number];
/** Renders cards and group boxes as a DOM tree: each group holds the cards and inner groups inside its range, with
 * coordinates relative to the group, so a parent's family is one subtree (WU-41). */
function renderLevel(
  layout: TableLayout, top: number, bottom: number, owner: Group | null, originTop: number, originLeft: number,
  cardShown: (c: Card) => boolean, groupShown: (g: Group) => boolean,
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
    if ((header || (c.depth === depth && !inGroup(c.top))) && cardShown(c)) out.push(card(c, c.top - originTop, c.left - originLeft));
  }
  // Membership uses every group; only shown groups (inside the window, or holding a forced card) are rendered.
  for (const g of groups)
    if (groupShown(g))
      out.push(group(g, g.top - originTop, g.left - originLeft, renderLevel(layout, g.top, g.bottom, g, g.top, g.left, cardShown, groupShown, card, group)));
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
