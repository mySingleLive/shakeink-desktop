"use client";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  alignedRailMarks,
  CATEGORY_VAR,
  isProgrammaticScroll,
  medianRootGap,
  projectAnchor,
  railMarks,
  tableCardInput,
  tableCrowding,
  tableGapFor,
  tableLayout,
  tableWidths,
  descendants,
  zoomBars,
  zoomPlan,
  type AlignedRailMarks,
  type EventTree,
  type RailLevel,
  type TableAnchor,
  type TableLayout,
  type TreeNode,
  type ZoomLevel,
  type ZoomPlan,
} from "@/lib/planning/worldline-layout";
import { EventCard, WorldlineCardContext, type WorldlineCardContextValue } from "./EventCard";
import { EventPoint } from "./EventPoint";
import { TimelineZoomLevelsContext, TimelineZoomNoteContext } from "./EventTimeline";
import s from "./worldline.module.css";

const EMPTY_IDS: ReadonlySet<string> = new Set();
/** docs/600 §9.4: a second press on a point within this interval is its double click (EventTimeline POINT_DOUBLE_MS). */
const POINT_DOUBLE_MS = 400;
/** docs/600 §8.1: an auto-opened card collapses after the double-click interval (PlanningWorkspace COLLAPSE_DELAY_MS). */
const COLLAPSE_DELAY_MS = 260;

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
  scale,
  level,
  canZoomIn,
  canZoomOut,
  railMode,
  onRailMode,
  periods,
  onFold,
  onZoom,
  onScrollTop,
  scrollerRef,
  emptyText,
  zoomLevel: zLevelIn = 0,
  cardScale = 1,
  allOpen = false,
}: {
  tree: EventTree;
  expanded: ReadonlySet<string>;
  folded: ReadonlySet<string>;
  selected: string | null;
  editing: string | null;
  hitId: string | null;
  dimmed: (id: string) => boolean;
  /** docs/586 §1: k, px per worldline hour (0 is pure stacking). */
  scale: number;
  /** docs/586 §2: the rail label level at this scale; null keeps the record-precision labels. */
  level: RailLevel | null;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** docs/588 §2: aligned (dots on the card heads) or linear (docs/586, equal time per length). */
  railMode: RailMode;
  onRailMode(mode: RailMode): void;
  periods: readonly { id: string; start: number; end: number | null }[];
  onFold(id: string): void;
  /** docs/586 §1: a wheel step in log scale (± ln 1.15); the parent adds it and clamps. */
  onZoom(stepLog: number, anchor: { id: string; offset: number } | null): void;
  onScrollTop(firstVisibleId: string | null): void;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  /** docs/591: shown over the table when the legend filter leaves no event. */
  emptyText?: string;
  /** docs/602 §3: the zoom level (PlanningWorkspace keeps the hysteresis), the collapsed card scale and all-open. */
  zoomLevel?: ZoomLevel;
  cardScale?: number;
  allOpen?: boolean;
}) {
  const ctx = useContext(WorldlineCardContext)!;
  const [heights, setHeights] = useState<Record<string, number>>({});
  const open = useMemo(() => new Set([...expanded, ...(editing ? [editing] : [])]), [expanded, editing]);
  // docs/600 §3.1: zoom levels from the table crowding d = median root gap × k, same rules as the timeline (docs/592–593).
  const zoomOn = useContext(TimelineZoomLevelsContext);
  const noteStore = useContext(TimelineZoomNoteContext);
  const gap = useMemo(() => medianRootGap(tree), [tree]);
  const d = tableCrowding(gap, scale);
  const prevPlan = useRef<ZoomPlan | undefined>(undefined);
  const zLevel: ZoomLevel = zoomOn ? zLevelIn : 0;
  const [unfoldedRaw, setUnfolded] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [showAllRaw, setShowAll] = useState<0 | 1 | 2>(0);
  const maxImportance = useMemo(() => { let m = 0; for (const n of tree.byId.values()) if (n.start !== null && n.event.importance > m) m = n.event.importance; return m; }, [tree]);
  const pointClass = zoomBars(zLevel, maxImportance).pointClass;
  const unfolded = zLevel >= 3 ? unfoldedRaw : EMPTY_IDS, showAll = pointClass > 0 && showAllRaw === pointClass;
  // docs/602 S1: collapsed cards scale 1–1.2 with the zoom (docs/601 Q1 kept them at 1); the timeline has its own.
  const zScale = zoomOn ? cardScale : 1;
  // docs/602 S5: all placed events open (minus the ones closed by a click while open).
  const on = zoomOn && allOpen;
  const [autoClosed, setAutoClosed] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const openAll = useMemo(() => {
    if (!on) return null;
    const n = new Set(open);
    for (const node of tree.byId.values()) if (node.start !== null && !autoClosed.has(node.id)) n.add(node.id);
    return n;
  }, [on, tree, open, autoClosed]);
  const shownOpen = openAll ?? open;
  // §9.3: while all open, every open card is kept a card (points and hidden events at the top of a dense work too).
  const keepCards = useMemo(() => new Set([...(selected ? [selected] : []), ...(hitId ? [hitId] : []), ...shownOpen]), [selected, hitId, shownOpen]);
  const plan = useMemo(
    () => zoomPlan(tree, zLevel, zScale, { cards: keepCards, unfolded, showAll, folded }, prevPlan.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prevPlan is a ref (set identity only)
    [tree, zLevel, zScale, keepCards, unfolded, showAll, folded],
  );
  const viewFolded = useMemo(() => {
    if (!plan.autoFolded.size && !unfolded.size) return folded;
    const n = new Set([...folded, ...plan.autoFolded]);
    for (const id of unfolded) n.delete(id);
    return n;
  }, [folded, plan.autoFolded, unfolded]);
  const layoutPlan = useMemo(() => (zoomOn ? { points: plan.points, hidden: plan.hidden, scale: plan.scale } : undefined), [zoomOn, plan.points, plan.hidden, plan.scale]);
  // docs/600 §8.3 / §8.5: with levels on, the stretch cap grows with d and children stretch by time too.
  // docs/601 Q2: the aligned rail lays cards out with equal gaps (no time stretch, no auto-open).
  const equal = railMode === "aligned";
  const gapMax = zoomOn && !equal ? tableGapFor(d) : undefined;
  // docs/601: k only drives the time stretch, so an equal layout ignores it and keeps its identity across wheel steps.
  const layoutK = equal ? 0 : scale;
  useLayoutEffect(() => {
    prevPlan.current = plan;
    if (zLevel < 3 && unfoldedRaw.size) setUnfolded(EMPTY_IDS);
    if (showAllRaw && showAllRaw !== pointClass) setShowAll(0);
  });
  // docs/600 §9.3: the status-line note, owned by this table (the timeline has its own owner).
  const noteOwner = useRef({}).current;
  const toggleShowAll = useRef(() => {});
  toggleShowAll.current = () => setShowAll((v) => (v ? 0 : pointClass));
  useLayoutEffect(() => {
    if (!noteStore) return;
    noteStore.set(zoomOn && pointClass > 0 && (plan.points.size > 0 || showAll) ? { count: plan.points.size, important: pointClass === 2, showAll } : null, noteOwner);
  });
  useLayoutEffect(() => {
    if (!noteStore) return;
    noteStore.register(noteOwner, { toggleShowAll: () => toggleShowAll.current() });
    return () => noteStore.clear(noteOwner);
  }, [noteStore, noteOwner]);
  const [panelWidth, setPanelWidth] = useState(0);
  // The rail narrows with the panel (worldline.module.css @container ≤ 640px); leads follow the same geometry.
  const narrow = panelWidth > 0 && panelWidth <= 640;
  // docs/592 §1.3: the card column's width decides each collapsed title's lines (tableWidths follows the CSS nesting).
  const [cardsWidth, setCardsWidth] = useState(0);
  const widths = useMemo(() => (cardsWidth > 0 ? tableWidths(cardsWidth, narrow) : undefined), [cardsWidth, narrow]);
  const inputOf = useMemo(() => {
    const known = new Set(ctx.characters.map((c) => c.id));
    return (n: TreeNode) => tableCardInput(n, known, tree);
  }, [ctx.characters, tree]);
  const layout: TableLayout = useMemo(
    () => tableLayout(tree, heights, layoutK, ctx.adapter, { expanded: shownOpen, folded: viewFolded, widths, inputOf, plan: layoutPlan, gapMax, stretchChildren: zoomOn, equalGaps: equal }),
    [tree, heights, layoutK, ctx.adapter, shownOpen, viewFolded, widths, inputOf, layoutPlan, gapMax, zoomOn, equal],
  );
  const marks: AlignedRailMarks = useMemo(
    () =>
      railMode === "aligned"
        ? alignedRailMarks(layout, ctx.adapter, { selected, periods, compact: narrow })
        : { ...railMarks(layout, layout.segments, ctx.adapter, { selected, periods, level, compact: narrow }), backs: [] },
    [railMode, layout, ctx.adapter, selected, periods, level, narrow],
  );
  // §5.1 [R3]: virtualize when the worldline has more than VIRTUAL_MIN events in total (pending included, folding
  // ignored), so folding never switches modes. The window is one screen above and below the viewport, in steps.
  const virtual = tree.byId.size > VIRTUAL_MIN;
  const [win, setWin] = useState<readonly [number, number]>([-Infinity, Infinity]);
  const [sticky, setSticky] = useState("");
  // Hovered events: one card, or every event of a hovered rail dot (a cluster holds several).
  const [hover, setHover] = useState<readonly string[]>([]);
  const hovered = (id: string) => hover.includes(id);
  const hoverOn = (ids: readonly string[]) => setHover((h) => (h.length === ids.length && h.every((x, i) => x === ids[i]) ? h : ids));
  // docs/588 §4: a mode switch redraws the rail under a still pointer; drop the old hover in the same render.
  const [hoverMode, setHoverMode] = useState(railMode);
  if (hoverMode !== railMode) {
    setHoverMode(railMode);
    setHover([]);
  }
  const live = useRef({ layout, virtual, marks, canZoomIn, canZoomOut });
  live.current = { layout, virtual, marks, canZoomIn, canZoomOut };
  const sync = useRef(() => {});
  sync.current = () => {
    const sc = scrollerRef.current;
    if (!sc) return;
    // WU-46: the last year badge scrolled past; empty near the top. Only a text change re-renders.
    const top = sc.scrollTop - TABLE_TOP;
    setSticky(top <= 20 ? "" : (live.current.marks.badges.filter((b) => b.kind === "year" && b.y < top).at(-1)?.text ?? ""));
    if (!live.current.virtual) return setWin((w) => (w[0] === -Infinity && w[1] === Infinity ? w : [-Infinity, Infinity]));
    const h = Math.max(200, sc.clientHeight), step = Math.max(100, h / 4);
    const y = sc.scrollTop - TABLE_TOP;
    const lo = Math.floor((y - h) / step) * step, hi = Math.ceil((y + 2 * h) / step) * step;
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
  // One anchor for height corrections, Ctrl + wheel and docs/602 zoom stops (docs/600 §10.3): a TableAnchor restored by
  // projectAnchor once the new layout is committed. While a wheel zoom is recent, the pointer's anchor stays.
  const anchor = useRef<TableAnchor | null>(null);
  const zoomAnchor = useRef<{ anchor: TableAnchor; until: number } | null>(null);
  /** Screen offset of a card head inside the scroller (TableAnchor.offset). */
  const headOffset = (l: TableLayout, id: string) => { const sc = scrollerRef.current, c = l.byId.get(id); return sc && c ? c.head + TABLE_TOP - sc.scrollTop : null; };
  const anchorNow = (id: string | null) => {
    const off = id ? headOffset(live.current.layout, id) : null;
    anchor.current = id && off !== null ? { a: id, offset: off } : null;
  };
  /** docs/600 §9.5: the anchor at a pointer y (scroller px): between the two card heads around it, or the nearest. */
  const pointerAnchor = (l: TableLayout, clientY: number): TableAnchor | null => {
    const sc = scrollerRef.current;
    if (!sc || !l.cards.length) return null;
    const off = clientY - sc.getBoundingClientRect().top, y = off + sc.scrollTop - TABLE_TOP;
    let below = l.cards.findIndex((c) => c.head >= y);
    if (below < 0) { const c = l.cards[l.cards.length - 1]; return { a: c.id, t: c.start, offset: off - (y - c.head) }; }
    const b = l.cards[below];
    if (below === 0) return { a: b.id, t: b.start, offset: off + (b.head - y) };
    const a = l.cards[below - 1];
    const f = b.head > a.head ? (y - a.head) / (b.head - a.head) : 0;
    return { a: a.id, b: b.id, f, offset: off, t: a.start };
  };
  const maxScroll = (l: TableLayout) => { const sc = scrollerRef.current; return sc ? l.height + Math.max(80, 0.67 * sc.clientHeight) + TABLE_TOP - sc.clientHeight : 0; };
  // docs/600 §11.1: the table's own scroll writes (anchor restores) are not user scrolls (docs/602 §9.5: the
  // fit-based auto-open decision is gone, this is all that is left of it).
  const auto = useRef({ written: null as number | null });
  // docs/602 S6: leaving all-open clears the cards closed by a click in it.
  useLayoutEffect(() => {
    if (!on && autoClosed.size) setAutoClosed(EMPTY_IDS);
  }, [on, autoClosed]);
  // A locate from the tree, the search or a deep link (PlanningWorkspace) drops a recent wheel anchor (docs/602 §9.5).
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const located = () => { zoomAnchor.current = null; auto.current.written = null; };
    sc.addEventListener("worldline-locate", located);
    return () => sc.removeEventListener("worldline-locate", located);
  }, [scrollerRef]);

  // docs/600 §3.1 / §8.6 P2-6: the fold button and the card toggle, both with stable identities (EventCard is memo).
  const overLive = useRef({ zLevel, onFold, on, expanded, shownOpen, ctx });
  overLive.current = { zLevel, onFold, on, expanded, shownOpen, ctx };
  const foldClick = useRef((id: string) => {
    if (overLive.current.zLevel < 3) return overLive.current.onFold(id);
    setUnfolded((u) => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }).current;
  // §8.1: a click on an auto-opened card closes it locally after the double-click interval; a double click edits.
  const pendingAuto = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const onAutoToggle = useRef((id: string, detail: number) => {
    const o = overLive.current, pend = pendingAuto.current;
    // As PlanningWorkspace.toggle: a double click on the same card cancels its pending collapse; any other click
    // carries it out first (code review P2-3).
    if (pend) {
      clearTimeout(pend.timer); pendingAuto.current = null;
      if (!(pend.id === id && detail >= 2)) setAutoClosed((c) => new Set(c).add(pend.id));
    }
    const auto0 = o.on && o.shownOpen.has(id) && !o.expanded.has(id);
    if (!auto0) return o.ctx.onToggle(id, detail);
    if (detail >= 2) return o.ctx.onToggle(id, 2);
    o.ctx.onSelectOnly(id);
    pendingAuto.current = { id, timer: setTimeout(() => {
      pendingAuto.current = null;
      setAutoClosed((c) => new Set(c).add(id));
    }, COLLAPSE_DELAY_MS) };
  }).current;
  useEffect(() => () => { if (pendingAuto.current) clearTimeout(pendingAuto.current.timer); }, []);
  const cardCtx = useMemo<WorldlineCardContextValue>(() => ({ ...ctx, onToggle: onAutoToggle }), [ctx, onAutoToggle]);
  // §9.4 / §10.2: a press on a point opens it (as a click on a collapsed card does); the click that follows is
  // swallowed, and a second press within POINT_DOUBLE_MS near the first is its double click (it lands on the new card).
  const lastPointPress = useRef<{ id: string; at: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const pointDown = (e: React.PointerEvent) => {
    swallowClick.current = false;
    if (e.button !== 0) return;
    const last = lastPointPress.current, now = performance.now();
    const repeat = !!last && now - last.at < POINT_DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 5;
    lastPointPress.current = null;
    if (repeat) {
      e.stopPropagation(); e.preventDefault();
      swallowClick.current = true;
      ctx.onToggle(last!.id, 2);
      return;
    }
    const pt = (e.target as Element).closest<HTMLElement>("[data-event-point]")?.dataset.eventId;
    if (!pt) return;
    e.stopPropagation(); e.preventDefault();
    swallowClick.current = true;
    lastPointPress.current = { id: pt, at: now, x: e.clientX, y: e.clientY };
    ctx.onToggle(pt, 1);
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
    if (c.point)
      return (
        <div key={c.id} className={`${s.slot} ${s.slotPoint}`} style={{ top, marginLeft: left, "--ec": `var(${CATEGORY_VAR[n.event.category]})` } as React.CSSProperties}>
          <EventPoint event={n.event} date={ctx.adapter.label(c.start ?? 0, 1, n.event.time.precision)} kids={descendants(n).length} hot={hovered(c.id)} dimmed={dimmed(c.id)} selected={selected === c.id} />
        </div>
      );
    const z = c.zoom;
    const cardEl = (
        <EventCard
          event={n.event}
          expanded={shownOpen.has(c.id)}
          selected={selected === c.id}
          hot={hovered(c.id)}
          hit={hitId === c.id}
          dimmed={dimmed(c.id)}
          editing={editing === c.id}
          childCount={n.children.length}
          descendantCount={descendants(n).length}
          folded={viewFolded.has(c.id)}
          placed={c.start !== null}
          maxAvatars={4}
          variant="table"
          groupHead={c.groupHead}
          titleLines={c.lines}
          stacked={c.stacked}
          onFold={foldClick}
        />
    );
    return (
      <div
        key={c.id}
        data-measure-id={isOpen ? c.id : undefined}
        className={`${s.slot} ${isOpen ? s.slotOpen : ""} ${c.groupHead ? s.slotHead : ""} ${c.stacked ? s.slotStack : ""}`}
        style={{ top, marginLeft: left }}
      >
        {/* docs/602 §9.7: with zoom levels on a collapsed card always sits in the zoom box (also at 1), so crossing
         * scale 1 does not remount it; open cards and the levels-off table have none. */}
        {zoomOn && !isOpen ? <div data-card-zoom={z} className={s.tableZoom} style={{ zoom: z, width: c.width || undefined }}>{cardEl}</div> : cardEl}
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
        if (z && z.until > performance.now()) anchor.current = z.anchor.b ? z.anchor : { a: z.anchor.a, offset: headOffset(live.current.layout, z.anchor.a) ?? z.anchor.offset };
        else anchorNow(sc ? firstVisible(live.current.layout, sc.scrollTop) : null);
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
  // docs/601 §8.4 (Q7): the first visible card and its screen offset, recorded on every scroll and after every
  // layout commit while the old layout is still in place; a rail mode switch restores it.
  const modeAnchor = useRef<{ mode: RailMode; anchor: TableAnchor | null }>({ mode: railMode, anchor: null });
  const recordModeAnchor = () => {
    const sc = scrollerRef.current, l = live.current.layout;
    const id = sc ? firstVisible(l, sc.scrollTop) : null, off = id ? headOffset(l, id) : null;
    modeAnchor.current = { mode: railMode, anchor: id && off !== null ? { a: id, offset: off } : null };
  };
  // docs/602 S8 / §9.4: a zoom step that changes the card scale or all-open keeps the first card in view (the wheel's
  // pointer anchor wins). The key is compared in the layout commit and rewritten after every commit, so a step that
  // leaves the layout alone is not replayed by a later, unrelated commit.
  // The top row last reported to onScrollTop (docs/602 §11.3: report changes only).
  const lastRow = useRef<string | null | undefined>(undefined);
  const zoomKey = `${zScale}|${on ? 1 : 0}`;
  const lastZoomKey = useRef(zoomKey);
  useLayoutEffect(() => {
    const sc = scrollerRef.current, au = auto.current;
    const modeSwitch = modeAnchor.current.mode !== railMode ? modeAnchor.current.anchor : null;
    const zoomed = lastZoomKey.current !== zoomKey ? modeAnchor.current.anchor : null;
    const a = anchor.current ?? modeSwitch ?? zoomed;
    anchor.current = null;
    if (sc && a) {
      const st = projectAnchor(layout, a, maxScroll(layout), TABLE_TOP);
      if (st !== null && Math.abs(st - sc.scrollTop) > 0.5) {
        sc.scrollTop = st;
        // §11.1 / P3-p: the scroll event this write fires is not user input.
        au.written = sc.scrollTop;
      }
    }
    sync.current();
    recordModeAnchor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, scrollerRef]);
  useLayoutEffect(() => { lastZoomKey.current = zoomKey; });

  // Ctrl + wheel zoom around the card under the pointer. React's wheel listener is passive, so a native one is needed
  // to stop the page zoom and the scroll.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { layout: l, canZoomIn: up, canZoomOut: down } = live.current;
      // docs/586 §1: at a bound nothing changes, so no anchor is left behind for a later layout.
      if (e.deltaY > 0 ? !down : !up) return;
      const step = e.deltaY > 0 ? -Math.log(1.15) : Math.log(1.15);
      // docs/600 §9.5: the pointer between the two card heads around it stays put (a card may be far away at 1200px).
      const pa = pointerAnchor(l, e.clientY);
      zoomAnchor.current = pa ? { anchor: pa, until: performance.now() + 400 } : null;
      anchor.current = pa;
      auto.current.written = null;
      onZoomRef.current(step, pa ? { id: pa.a, offset: pa.offset } : null);
    };
    sc.addEventListener("wheel", wheel, { passive: false });
    return () => sc.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollerRef]);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useLayoutEffect(() => {
    const host = scrollerRef.current?.closest<HTMLElement>("[data-worldline-root]") ?? scrollerRef.current?.closest<HTMLElement>("[data-worldline-panel]");
    if (!host) return;
    const cardsEl = cardsRef.current;
    const ro = new ResizeObserver(() => { setPanelWidth(host.clientWidth); if (cardsEl) setCardsWidth(cardsEl.clientWidth); });
    ro.observe(host);
    if (cardsEl) ro.observe(cardsEl);
    setPanelWidth(host.clientWidth);
    if (cardsEl) setCardsWidth(cardsEl.clientWidth);
    return () => ro.disconnect();
  }, [scrollerRef]);
  const inWin = (y: number) => !virtual || (y >= lo && y <= hi);
  const hot = (ids: readonly string[]) => ids.includes(selected ?? "") || ids.some(hovered);
  const railW = narrow ? 120 : 210, dotX = narrow ? 92 : 158;
  const leadX = railW + 12;
  return (
    <div
      ref={scrollerRef}
      data-table-scroller=""
      className={s.scroller}
      style={{ overflowAnchor: "none" }}
      title="Ctrl + 滚轮缩放时间轴"
      onScroll={(e) => {
        sync.current();
        recordModeAnchor();
        // docs/602: an anchor restore after a card-scale step fires a scroll with the same top row; report changes only,
        // so a zoom step renders PlanningWorkspace once (TZB-09).
        const row = firstVisible(layout, e.currentTarget.scrollTop);
        if (row !== lastRow.current) { lastRow.current = row; onScrollTop(row); }
        // docs/600 §11.1: the table's own anchor restore is not user input; everything else is.
        const au = auto.current;
        if (isProgrammaticScroll(au.written, e.currentTarget.scrollTop)) { au.written = null; return; }
        au.written = null;
        if (zoomAnchor.current && zoomAnchor.current.until > performance.now()) zoomAnchor.current = null;
        // docs/601 code review P1-1: a user scroll drops a wheel anchor no layout commit consumed (aligned mode keeps
        // its layout across wheel steps within a level), so a later commit does not jump back to it.
        anchor.current = null;
      }}
    >
      <div data-sticky-year="" className={s.stickyYear}>{sticky && <span>{sticky}</span>}</div>
      <div className={s.railModeDock}>
        <div role="group" aria-label="时间轴模式" data-rail-mode-toggle="" className={s.railMode} title="对齐：时间轴日期与卡片同一水平线；等距：相同长度代表相同时间">
          <span>时间轴</span>
          {(["aligned", "linear"] as const).map((m) => (
            <button key={m} type="button" className={s.railModeBtn} aria-pressed={railMode === m} onClick={() => onRailMode(m)}>
              {m === "aligned" ? "对齐" : "等距"}
            </button>
          ))}
        </div>
      </div>
      {/* docs/588 §2: room above the first card so the toggle never covers it at the top. */}
      <div aria-hidden style={{ height: TABLE_TOP }} />
      {/* Bottom room of at least 2/3 of the viewport, so locate can bring the last card to the upper third (WU-62). */}
      <div data-event-table="" data-zoom-level={zLevel} {...(zoomOn ? { "data-card-scale": zScale } : {})} data-crowding={Number.isFinite(d) ? d.toFixed(3) : "Infinity"} {...(on ? { "data-auto-open": "" } : {})} {...(virtual ? { "data-virtual": "" } : {})} style={{ position: "relative", height: `calc(${layout.height}px + max(80px, 67%))` }}>
        {emptyText && <p data-filter-empty="" className={s.emptyNote}>{emptyText}</p>}
        <div
          className={s.rail}
          style={{ height: layout.height }}
          aria-hidden={false}
          onPointerOver={(e) => {
            const el = (e.target as Element).closest<HTMLElement>("[data-rail-label],[data-rail-dot]");
            hoverOn(el?.dataset.ids ? el.dataset.ids.split(" ") : []);
          }}
          onPointerLeave={() => hoverOn([])}
        >
          {marks.lines.map((l) => (
            <div key={`l${l.segment}`} className={s.railLine} style={{ top: l.top, height: l.height }} />
          ))}
          {marks.backs.map((b) => (
            <div key={`bk${b.segment}-${b.top}`} data-rail-back="" className={s.railBack} style={{ top: b.top, height: b.height }} title="早于上一事件" />
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
            <div key={`k${i}`} data-rail-break={b.kind} className={`${s.railBreak} ${layout.equal ? s.railBreakTight : ""}`} style={{ top: b.top, height: b.height }}>
              {b.kind === "gap" ? `相隔 ${gapText(b.gap, ctx.adapter)}` : "时间待定位"}
            </div>
          ))}
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={240} height={layout.height}>
            {[...marks.points].map(([id, y]) => {
              const card = layout.byId.get(id), n = node(id);
              if (!card || !n || !rendered.has(id)) return null;
              const x1 = leadX + card.left, yh = card.head;
              return (
                <path
                  key={id}
                  data-rail-lead={id}
                  className={`${s.lead} ${n.parent ? s.child : ""} ${selected === id || hovered(id) ? s.hot : ""}`}
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
                data-ids={d.ids.join(" ")}
                {...(d.back ? { "data-rail-back-dot": "" } : {})}
                data-event-id={d.lead}
                data-importance={d.importance}
                {...(d.cluster ? { "data-cluster": "" } : {})}
                className={`${s.railDot} ${d.cluster ? s.cluster : s[`d${d.importance}`]} ${allDim ? s.dim : ""} ${hot(d.ids) ? s.hot : ""} ${d.back ? s.back : ""}`}
                style={{ top: d.y, "--ec": `var(${CATEGORY_VAR[lead.event.category]})` } as React.CSSProperties}
                aria-label={`${lead.event.title} ${ctx.adapter.label(d.t, 1, lead.event.time.precision)} ${["一般", "重要", "关键"][d.importance - 1]}`}
                title={d.cluster ? d.ids.map((id) => node(id)?.event.title).join("\n") : undefined}
              >
                {d.cluster ? d.count : null}
              </b>
            );
          })}
          {marks.labels.map((l, i) => {
            if (!((l.visible && inWin(l.y)) || (l.text && hot(l.ids)))) return null;
            // Labels are built one per dot, in the same order: the label takes its dot's type color (design .dlabel --ec).
            const lead = node(marks.dots[i]?.lead ?? l.ids[0]);
            return (
              <span
                key={`lb${l.ids.join(",")}`}
                data-rail-label=""
                data-ids={l.ids.join(" ")}
                data-rail-level={l.level ?? ""}
                data-label-for={l.ids.join(" ")}
                className={`${s.railLabel} ${hot(l.ids) ? s.hot : ""} ${l.back ? s.back : ""}`}
                title={l.back ? "早于上一事件" : undefined}
                style={{ top: l.y, ...(lead ? { "--ec": `var(${CATEGORY_VAR[lead.event.category]})` } : {}) } as React.CSSProperties}
              >
                {l.text}
              </span>
            );
          })}
          {railMode === "aligned" && hover.map((id) => {
            const card = layout.byId.get(id), n = node(id);
            if (!card || !n || !rendered.has(id)) return null;
            return (
              <i
                key={`gd${id}`}
                data-rail-guide={id}
                className={s.railGuide}
                style={{ top: card.head, width: leadX + card.left, "--ec": `var(${CATEGORY_VAR[n.event.category]})` } as React.CSSProperties}
              />
            );
          })}
        </div>
        <WorldlineCardContext.Provider value={cardCtx}>
        <div
          ref={cardsRef}
          className={s.cards}
          style={{ height: layout.height }}
          onPointerDownCapture={pointDown}
          onClickCapture={(e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); } }}
          onPointerOver={(e) => {
            const id = (e.target as Element).closest<HTMLElement>("[data-event-card],[data-event-point]")?.dataset.eventId;
            hoverOn(id ? [id] : []);
          }}
          onPointerLeave={() => hoverOn([])}
        >
          {cardNodes}
        </div>
        </WorldlineCardContext.Provider>
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
  const y = scrollTop - TABLE_TOP;
  return layout.cards.find((c) => c.top + c.height > y + 8)?.id ?? null;
}
/** docs/588 §2: the toggle's room above the table, in px (scrollTop = layout y + TABLE_TOP). */
export const TABLE_TOP = 40;
export type RailMode = "aligned" | "linear";
function gapText(gap: number, adapter: { dayHours: number }) {
  const days = gap / adapter.dayHours;
  if (days >= 365) return `约 ${Math.round(days / 365.2425).toLocaleString()} 年`;
  if (days >= 30) return `约 ${Math.round(days / 30)} 个月`;
  return `${Math.round(days)} 天`;
}
export type { TreeNode };
