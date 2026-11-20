"use client";
import { createContext, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORY_VAR,
  cardScale,
  CLIP_END_LABEL,
  CLIP_START_LABEL,
  collapsedCardInput,
  collapsedCardWidth,
  descendants,
  familyEnd,
  familyStampEnd,
  emptyTimeline,
  medianRootGap,
  minimapModel,
  pointWidth as pointBoxWidth,
  timelineStep,
  zoomLevel,
  zoomBars,
  zoomPlan,
  type EventTree,
  type LaneItem,
  type PlaneElement,
  type TimelineState,
  type TreeNode,
  type ZoomLevel,
  type ZoomPlan,
} from "@/lib/planning/worldline-layout";
import { layoutTimelineCards, timelineTicks } from "@/lib/planning/timeline";
import type { ViewportStore, ZoomNoteStore } from "@/lib/planning/worldline-viewport";
import { EventCard, WorldlineCardContext } from "./EventCard";
import { EventPoint } from "./EventPoint";
import { EventTreeNav } from "./EventTree";
import s from "./worldline.module.css";
import { renderProbe } from "@/lib/planning/render-probe";

const MINIMAP_WIDTH = 420;
/** docs/596: the minimap is 120px high: 8px top, a 90px drawing area for the content height, then the row of roots
 * outside the build range (no height of their own) and 8px bottom (worldline.module.css). */
const MINI_TOP = 8, MINI_MH = 90;
const LANE_CARD_WIDTH = 230;
const PAN_THRESHOLD = 5;
const EMPTY_LANES: readonly TimelineLaneGroup[] = [];
export interface TimelineLaneGroup {
  id: string;
  /** Accessible name of the lane, e.g. 「<角色>变化轨道」. */
  name: string;
  label: React.ReactNode;
  items: readonly { id: string; time: number; height: number; node: React.ReactNode }[];
}
export interface TimelinePeriod {
  id: string;
  title: string;
  /** Already includes a drag preview. */
  start: number;
  end: number | null;
  ongoing: boolean;
  mutable: boolean;
}
/** Event and period time drags stay owned by PlanningWorkspace (startTimeDrag / finishTimeDrag); the canvas only
 * forwards pointer moves, the release and the cancel. `move` returns false when no time drag is active. */
export interface TimelineTimeDrag {
  startPeriod(ev: React.PointerEvent, id: string, edge: "move" | "start" | "end"): void;
  move(clientX: number, pxPerUnit: number): boolean;
  end(): void;
  cancel(): void;
  /** Event being dragged and its offset in worldline units (moves the card while dragging). */
  preview: { id: string; delta: number; edge: "move" | "start" | "end"; follows?: ReadonlySet<string> } | null;
  onPeriodClick(id: string): void;
}
/** The legacy period colour: a stable hash of the id, so a period keeps its colour when the list changes. */
const periodColor = (id: string) => ([...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 5) + 1;

/** The status-line range text follows the store directly, so it updates every frame without re-rendering the workspace. */
export function ViewportRange({ store, label }: { store: ViewportStore; label(t: number): string }) {
  const w = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <>{label(w.start)} — {label(w.start + w.span)}</>;
}
const PAD = 14;
/** docs/592 §7.1: zoom levels on (the product default). Only the browser test fixture provides false, so the timeline
 * cases written before docs/592 keep running at level 0; a case without a Provider checks the default stays on. */
export const TimelineZoomLevelsContext = createContext(true);
/** docs/592 §2.4: the panel's status-line note store (PlanningWorkspace provides one per panel). */
export const TimelineZoomNoteContext = createContext<ZoomNoteStore | null>(null);
/** docs/592 §2.6: a second press within this time of a press on a point is its double click. */
const POINT_DOUBLE_MS = 400;
const EMPTY_IDS: ReadonlySet<string> = new Set();

/** The time ruler; a component of its own so the render-count case can see it re-render on every window change. */
function Ruler({ ticks, toX, label, hot }: { ticks: readonly number[]; toX(t: number): number; label(t: number): string; hot?: { x: number; text: string; ec: string } | null }) {
  renderProbe("Ruler");
  return (
    <div className={s.ruler} data-ruler="">
      {ticks.map((t) => (
        <span key={t} style={{ left: toX(t) }}>{label(t)}</span>
      ))}
      {/* docs/592 R6: the hovered event's time on the ruler. */}
      {hot && <span data-ruler-hot="" className={s.rulerHot} style={{ left: hot.x, "--ec": hot.ec } as React.CSSProperties}>{hot.text}</span>}
    </div>
  );
}


/** docs/577 §4, §10–§11, §15 / docs/580 §5.2, §7.2: the timeline canvas. Families are packed in world coordinates by
 * timelineStep; panning only moves the plane (translateX) and never re-lays out, so cards keep their y. The window
 * lives in the per-panel viewport store; frames during a drag write the ref and the store, never PlanningWorkspace. */
export function EventTimeline({
  tree,
  viewport,
  expanded,
  folded,
  selected,
  editing,
  hitId,
  dimmed,
  pinned,
  emptyText,
  periods,
  lanes = EMPTY_LANES,
  timeDrag,
  laneRef,
  onFold,
  selection,
  onBoxSelect,
  onClearSelection,
  onDeleteSelection,
  onReset,
}: {
  tree: EventTree;
  viewport: ViewportStore;
  expanded: ReadonlySet<string>;
  folded: ReadonlySet<string>;
  selected: string | null;
  editing: string | null;
  hitId: string | null;
  dimmed: (id: string) => boolean;
  pinned: string | null;
  /** docs/591: the note shown when the (filtered) tree has no placed event. */
  emptyText?: string;
  periods: readonly TimelinePeriod[];
  /** Character-change lanes under the families (显示角色变化); each item is drawn at its time. */
  lanes?: readonly TimelineLaneGroup[];
  timeDrag: TimelineTimeDrag;
  /** The lane (the workspace measures its width). docs/584: it never scrolls; the store's y moves the plane. */
  laneRef: React.RefObject<HTMLDivElement | null>;
  onFold(id: string): void;
  /** docs/584 R2: the multi-selection (the primary is `selected`). */
  selection: ReadonlySet<string>;
  /** A finished box selection (ids by layout, rendered or not); `additive` with ⌘/Ctrl or Shift. */
  onBoxSelect(ids: string[], additive: boolean): void;
  /** A left click on empty canvas. */
  onClearSelection(): void;
  /** Delete / Backspace on the canvas with a non-empty selection. */
  onDeleteSelection(): void;
  /** The 复位 action (fit + centre), also behind the empty-view button. */
  onReset(): void;
}) {
  const ctx = useContext(WorldlineCardContext)!;
  const view = useSyncExternalStore(viewport.subscribe, viewport.getSnapshot, viewport.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const state = useRef<TimelineState>(emptyTimeline());
  const lastSizes = useRef<readonly unknown[] | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(0, el.clientWidth - 2 * PAD)));
    ro.observe(el);
    setWidth(Math.max(0, el.clientWidth - 2 * PAD));
    return () => ro.disconnect();
  }, []);
  // Repack incrementally when card sizes change (expand, fold, edit, measured heights) or the tree itself does
  // (add / delete / re-time / re-parent, a drag preview). Identity checks only, so a pan frame costs nothing here.
  const open = useMemo(() => new Set([...expanded, ...(editing ? [editing] : [])]), [expanded, editing]);
  const preview = timeDrag.preview;
  // 581 WU-55: a time-drag preview moves the dragged event (and, for a move, its subtree) by a transform only; the
  // packing is not touched, so no other family moves while the pointer is down. The save repacks.
  const shown = tree;
  // docs/592 §2: zoom levels from the crowding d (median root gap on screen). The previous level (hysteresis) and plan
  // (set identity) are refs committed in a layout effect, so a render React throws away leaves no trace (review R10).
  const zoomOn = useContext(TimelineZoomLevelsContext);
  const noteStore = useContext(TimelineZoomNoteContext);
  const gap = useMemo(() => medianRootGap(tree), [tree]);
  const prevLevel = useRef<ZoomLevel>(0);
  const prevPlan = useRef<ZoomPlan | undefined>(undefined);
  const [unfoldedRaw, setUnfolded] = useState<ReadonlySet<string>>(EMPTY_IDS);
  // docs/593 §2: 显示为卡片 remembers the point class it was clicked for (1 一般 / 2 重要); a new class drops it.
  const [showAllRaw, setShowAll] = useState<0 | 1 | 2>(0);
  const d = gap === null || !(width > 0) ? Infinity : (gap * width) / view.span;
  const level: ZoomLevel = zoomOn ? zoomLevel(d, prevLevel.current) : 0;
  const maxImportance = useMemo(() => { let m = 0; for (const n of tree.byId.values()) if (n.start !== null && n.event.importance > m) m = n.event.importance; return m; }, [tree]);
  const pointClass = zoomBars(level, maxImportance).pointClass;
  const unfolded = level >= 3 ? unfoldedRaw : EMPTY_IDS, showAll = pointClass > 0 && showAllRaw === pointClass;
  const keepCards = useMemo(() => new Set([...selection, ...(selected ? [selected] : []), ...(hitId ? [hitId] : []), ...open]), [selection, selected, hitId, open]);
  const scaleCard = cardScale(d, level);
  // docs/593 review P2: computed only when an input changes (a pan frame keeps the same plan).
  const plan = useMemo(
    () => zoomPlan(tree, level, scaleCard, { cards: keepCards, unfolded, showAll, folded }, prevPlan.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prevPlan is a ref (set identity only)
    [tree, level, scaleCard, keepCards, unfolded, showAll, folded],
  );
  const viewFolded = useMemo(() => {
    if (!plan.autoFolded.size && !unfolded.size) return folded;
    const n = new Set([...folded, ...plan.autoFolded]);
    for (const id of unfolded) n.delete(id);
    return n;
  }, [folded, plan.autoFolded, unfolded]);
  useLayoutEffect(() => {
    prevLevel.current = level;
    prevPlan.current = plan;
    if (level < 3 && unfoldedRaw.size) setUnfolded(EMPTY_IDS);
    if (showAllRaw && showAllRaw !== pointClass) setShowAll(0);
  });
  const moved = useMemo(() => {
    const n = preview && preview.delta ? tree.byId.get(preview.id) : undefined;
    if (!n) return null;
    // docs/584 A3: a group drag shifts every moved event, what is anchored to it, and their subtrees (deduplicated).
    const roots = preview!.follows ? [...preview!.follows].map((id) => tree.byId.get(id)).filter((x): x is TreeNode => !!x) : [n];
    return new Set(roots.flatMap((r) => [r.id, ...(preview!.edge === "move" ? descendants(r).map((d) => d.id) : [])]));
  }, [tree, preview]);
  // docs/583 R1: collapsed widths follow the rendered head (found people, descendants), so the character list is a
  // relayout input too: adding or deleting a character resizes cards and repacks.
  const { widthOf, inputOf } = useMemo(() => {
    const cache = new Map<string, number>(), inputs = new Map<string, ReturnType<typeof collapsedCardInput>>(), known = new Set(ctx.characters.map((c) => c.id));
    const inputOf = (n: TreeNode) => {
      let i = inputs.get(n.id);
      if (!i) inputs.set(n.id, (i = collapsedCardInput(n, known, shown)));
      return i;
    };
    return {
      inputOf,
      widthOf: (n: TreeNode) => {
        let w = cache.get(n.id);
        if (w === undefined) cache.set(n.id, (w = collapsedCardWidth(inputOf(n))));
        return w;
      },
    };
  }, [shown, ctx.characters]);

  const laneScale = width > 0 ? width / view.span : 0;
  const lanePack = useMemo(() => {
    let top = 0;
    const items: LaneItem[] = [], heads: { id: string; name: string; label: React.ReactNode; top: number }[] = [], nodes = new Map<string, React.ReactNode>();
    if (!(laneScale > 0)) return { items, heads, nodes };
    for (const g of lanes) {
      const packed = layoutTimelineCards(g.items.map((c) => ({ id: c.id, start: c.time, end: c.time, height: c.height })), laneScale, LANE_CARD_WIDTH);
      heads.push({ id: g.id, name: g.name, label: g.label, top });
      for (const p of packed.items) {
        const id = `${g.id}\u0000${p.id}`;
        items.push({ id, start: p.start, end: p.start, top: top + p.top + 22, height: p.height ?? 94 });
        nodes.set(id, g.items.find((c) => c.id === p.id)!.node);
      }
      top += packed.height + 40;
    }
    return { items, heads, nodes };
  }, [lanes, laneScale]);
  // timelineStep is pure; its state and the relayout inputs are committed in a layout effect, so a render React
  // throws away (StrictMode, an interrupted concurrent render) leaves no trace (review R10).
  const scale = width > 0 ? width / view.span : 0;
  // Descendant counts and family ends once per tree, not per card per pan frame (review R9).
  const famInfo = useMemo(() => {
    const m = new Map<string, { count: number; end: number }>();
    for (const n of shown.byId.values()) {
      const d = descendants(n);
      m.set(n.id, { count: d.length, end: Math.max(n.end ?? n.start ?? 0, ...d.map((x) => x.end ?? x.start ?? n.start ?? 0)) });
    }
    return m;
  }, [shown]);
  // docs/585: card stamps one precision finer than the axis. Recomputed only when the span's precision, the tree or the
  // calendar changes; a pan frame (same span) or a zoom step inside one precision only looks the text up.
  const axis = ctx.adapter.axisPrecision(view.span);
  const stamps = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of shown.byId.values()) {
      if (n.start === null) continue;
      const head = ctx.adapter.stamp(n.start, axis, n.event.time);
      if (!n.children.length) { m.set(n.id, head); continue; }
      const f = familyStampEnd(n);
      m.set(n.id, `${head} → ${ctx.adapter.stamp(f.end, axis, f.by.time)}`);
    }
    return m;
  }, [shown, axis, ctx.adapter]);
  /** A point reads its card stamp's start (a family's "A → B" keeps A). */
  const pointDate = (id: string) => (stamps.get(id) ?? "").split(" → ")[0];
  const pointWidth = useMemo(() => (n: TreeNode) => pointBoxWidth(n.event.title, (stamps.get(n.id) ?? "").split(" → ")[0], n.children.length > 0), [stamps]);
  const inputs = [shown, open, viewFolded, heights, widthOf, plan.points, plan.scale, pointWidth, plan.hidden] as const;
  const relayout = !lastSizes.current || inputs.some((v, i) => v !== lastSizes.current![i]);
  const step = timelineStep(state.current, {
    tree: shown, view, width, expanded: open, folded: viewFolded, heights, widthOf, inputOf, pinned, relayout, lane: lanePack.items,
    scaleCard: plan.scale, points: plan.points, pointWidth, hidden: plan.hidden,
  });
  useLayoutEffect(() => {
    state.current = step.state;
    lastSizes.current = inputs;
  });
  // docs/592 §2.4: the status-line note, written after commit; cleared when the timeline unmounts.
  const toggleShowAll = useRef(() => {});
  toggleShowAll.current = () => setShowAll((v) => (v ? 0 : pointClass));
  useLayoutEffect(() => {
    if (!noteStore) return;
    // docs/593 H4: hidden events have no note; levels without points (4, 6) clear it.
    noteStore.set(pointClass > 0 && (plan.points.size > 0 || showAll) ? { count: plan.points.size, important: pointClass === 2, showAll } : null);
  });
  useEffect(() => {
    if (!noteStore) return;
    noteStore.actions = { toggleShowAll: () => toggleShowAll.current() };
    return () => { noteStore.actions = null; noteStore.set(null); };
  }, [noteStore]);

  // Measured heights of open cards feed the next layout. One observer for the component's life; the open set
  // decides what it watches (review R9: no per-render observer churn).
  const plane = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    let frame = 0;
    const pending: Record<string, number> = {};
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.eventId;
        if (id) pending[id] = Math.ceil((e.target as HTMLElement).getBoundingClientRect().height);
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setHeights((old) => {
          let changed = false;
          const next = { ...old };
          for (const [id, h] of Object.entries(pending)) if (next[id] !== h) { next[id] = h; changed = true; }
          return changed ? next : old;
        }),
      );
    });
    observer.current = ro;
    return () => { ro.disconnect(); cancelAnimationFrame(frame); observer.current = null; };
  }, []);
  const openKey = step.elements.filter((e) => e.kind === "card" && open.has(e.id)).map((e) => e.id).join("\u0000");
  useLayoutEffect(() => {
    const ro = observer.current, root = plane.current;
    if (!ro || !root) return;
    ro.disconnect();
    root.querySelectorAll<HTMLElement>("[data-event-card][aria-expanded='true']").forEach((el) => ro.observe(el));
  }, [openKey]);

  // docs/584 R2: a pan (middle button, or Space + left) moves start and y through the store; a left drag on the canvas
  // draws a selection box kept here only (no PlanningWorkspace render per frame, IC-21b). Esc, blur and
  // pointercancel restore a pan's start and y and drop a box. Time drags are owned by the workspace.
  // docs/592 R6: hovered card or point; local state, so only the timeline re-renders. Not updated during a drag.
  const [hover, setHover] = useState<string | null>(null);
  const hoverAt = (target: EventTarget | null) => {
    if (drag.current?.active || box.current?.active || timeDrag.preview) return;
    const id = (target as Element | null)?.closest?.<HTMLElement>("[data-event-card],[data-event-point]")?.dataset.eventId ?? null;
    setHover((h) => (h === id ? h : id));
  };
  // docs/592 §2.3 (review round 2 #1): while auto-folding is on, a fold button only toggles the timeline's own exception
  // set, so the event table and the tree keep their folding; below level 3 it folds as before.
  // Stable identity (EventCard is memo; a new function per render re-renders every card on each zoom frame, and a
  // re-rendered Markdown body resets its innerHTML, losing e.g. a scrolled table: CP-06).
  const foldLive = useRef({ level, onFold });
  foldLive.current = { level, onFold };
  const foldClick = useRef((id: string) => {
    if (foldLive.current.level < 3) return foldLive.current.onFold(id);
    setUnfolded((u) => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }).current;
  /** docs/592 §2.6: the last press on a point, for its double click when the second press lands off the new card. */
  const lastPointPress = useRef<{ id: string; at: number; x: number; y: number } | null>(null);
  /** The click after a point's second press is swallowed, so the new card's own double click does not edit twice. */
  const swallowClick = useRef(false);
  const drag = useRef<{ x: number; y: number; start: number; top: number; active: boolean } | null>(null);
  const box = useRef<{ x: number; y: number; additive: boolean; active: boolean; onCard: boolean } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const space = useRef(false);
  /** docs/596: a minimap press. `dx` keeps the pointer's offset in the frame; `px0 / py0 / y0` drive the relative
   * vertical drag; `start0 / y0` are restored by Esc. */
  const miniDrag = useRef<{ dx: number; px0: number; py0: number; start0: number; y0: number; h0: number; moved: boolean } | null>(null);
  const td = useRef(timeDrag);
  td.current = timeDrag;
  useEffect(() => {
    const cancel = () => {
      if (drag.current?.active) restorePan(drag.current);
      drag.current = null;
      box.current = null;
      setRect(null);
      if (miniDrag.current?.moved) viewport.setWindow({ start: miniDrag.current.start0, y: miniDrag.current.y0 });
      miniDrag.current = null;
      space.current = false;
      host.current?.removeAttribute("data-space");
      td.current.cancel();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && (drag.current || box.current || miniDrag.current)) cancel(); };
    const blur = cancel;
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur); };
  }, [viewport]);

  // docs/583 R3 wheel rules, first match wins: a scrollable child inside the lane (not the lane itself) keeps the wheel
  // until its end unless Ctrl is held; ⌘ (macOS) / Alt scroll the lane only; Shift pans only (deltaY, or the deltaX
  // macOS turns it into); a mostly horizontal trackpad swipe pans; everything else (wheel, Ctrl + wheel, pinch) zooms
  // around the time and the card under the pointer. Deltas are summed per animation frame: every zoom step changes the
  // scale and so repacks (worldline-layout timelineStep), at most once a frame. A native non-passive listener is needed
  // to stop the page scroll and the browser zoom (React's onWheel is passive).
  const live = useRef({ view, width });
  live.current = { view, width };
  const zoomAnchor = useRef<{ id: string; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0;
    let acc = { zoom: 0, pan: 0, scroll: 0, x: 0, y: 0 };
    const flush = () => {
      frame = 0;
      const a = acc;
      acc = { zoom: 0, pan: 0, scroll: 0, x: a.x, y: a.y };
      const lane = laneRef.current;
      const v = viewport.getSnapshot(), w = live.current.width;
      if (a.scroll) viewport.setWindow({ y: viewport.getSnapshot().y - a.scroll });
      if (a.zoom && lane && w > 0) {
        const r = lane.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (a.x - r.left - PAD) / w));
        const span = Math.min(1e12, Math.max(1, v.span * Math.pow(1.2, a.zoom)));
        const at = v.start + ratio * v.span;
        // Keep the card under the pointer at its screen y once the new scale is packed (layout effect below).
        const card = document.elementFromPoint(a.x, a.y)?.closest<HTMLElement>("[data-timeline-plane] [data-event-card], [data-timeline-plane] [data-event-point]");
        zoomAnchor.current = card ? { id: card.dataset.eventId!, y: card.getBoundingClientRect().top, px: a.x, py: a.y } : null;
        viewport.setWindow({ start: at - ratio * span + (a.pan / Math.max(1, w)) * span, span });
        // At the span bounds nothing changes and nothing re-renders; a stale anchor would later undo a scroll.
        if (viewport.getSnapshot() === v) zoomAnchor.current = null;
      } else if (a.pan) viewport.setWindow({ start: v.start + (a.pan / Math.max(1, w)) * v.span });
    };
    const px = (e: WheelEvent, d: number) => (e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * (laneRef.current?.clientHeight ?? 600) : d);
    const wheel = (e: WheelEvent) => {
      const dx = px(e, e.deltaX), dy = px(e, e.deltaY);
      const vertical = e.metaKey || e.altKey;
      // Shift means horizontal: a scrollable table under the pointer takes Shift + wheel before the canvas pans.
      const [ydx, ydy] = vertical ? [0, dy || dx] : e.shiftKey ? [dy || dx, 0] : [dx, dy];
      const owner = e.ctrlKey ? null : yieldsTo(e.target as Element | null, laneRef.current, ydx, ydy);
      if (owner) {
        // Not every platform turns Shift + wheel into a horizontal scroll, so the child is scrolled here.
        if (e.shiftKey && !vertical && !dx) { e.preventDefault(); owner.scrollLeft += ydx; }
        return;
      }
      e.preventDefault();
      acc.x = e.clientX; acc.y = e.clientY;
      if (vertical) acc.scroll += dy || dx;
      else if (e.shiftKey) acc.pan += dy || dx;
      else if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) acc.pan += dx;
      else if (dy) acc.zoom += Math.abs(dy) >= 50 ? Math.sign(dy) : dy / 100;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { el.removeEventListener("wheel", wheel); cancelAnimationFrame(frame); };
  }, [viewport, laneRef]);
  useLayoutEffect(() => {
    const a = zoomAnchor.current, lane = laneRef.current;
    if (!a || !lane) return;
    zoomAnchor.current = null;
    // docs/592: from the layout, not the DOM. A repack can move the anchor outside the rendered band (vband), and a
    // card may have turned into a point (or back); the packed element still knows where it is.
    const drawn = (e: PlaneElement) => e.kind === "card" || e.kind === "point";
    const el = step.elements.find((e) => e.id === a.id && drawn(e));
    const r = lane.getBoundingClientRect();
    if (el) viewport.setWindow({ y: viewport.getSnapshot().y - (r.top + el.top + view.y - a.y) });
    else {
      // docs/593 review P1-4: the anchor was hidden by the new level. Follow the drawn event nearest the pointer in x
      // (then y), its top 6px above the pointer, so the shrunken canvas does not leave the lane empty.
      const tx = step.translateX + PAD + r.left, dx = (e: PlaneElement) => Math.max(0, e.left + tx - a.px, a.px - (e.left + e.width + tx));
      let best: PlaneElement | null = null;
      for (const e of step.elements) {
        if (!drawn(e)) continue;
        if (!best || dx(e) < dx(best) || (dx(e) === dx(best) && Math.abs(e.top + view.y + r.top - a.py) < Math.abs(best.top + view.y + r.top - a.py))) best = e;
      }
      if (best) viewport.setWindow({ y: viewport.getSnapshot().y - (r.top + best.top + view.y - (a.py - 6)) });
    }
  });
  const restorePan = (d: { start: number; top: number }) => {
    viewport.setWindow({ start: d.start, y: d.top });
    host.current?.removeAttribute("data-panning");
  };

  const ticks = useMemo(
    () => (width > 0 ? timelineTicks(view.start, view.span, ctx.adapter.calendar, width) : []),
    [view.start, view.span, width, ctx.adapter.calendar],
  );
  const toX = (t: number) => PAD + (t - view.start) * scale;
  const node = (id: string): TreeNode | undefined => shown.byId.get(id);
  // The minimap is 420px, or the panel width minus margins on a narrow panel (worldline.module.css).
  const miniWidth = width > 0 ? Math.min(MINIMAP_WIDTH, width + 2 * PAD - 24) : MINIMAP_WIDTH;
  const mini = useMemo(() => minimapModel(tree.roots, miniWidth, ctx.adapter), [tree, ctx.adapter, miniWidth]);
  // Vertical band of the plane worth rendering: one lane height above and below the visible rows, in steps.
  // docs/584: the visible plane rows are [−y, −y + lane height]; recomputed in steps from the store, never on scroll.
  const [laneH, setLaneH] = useState(0);
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    // overflow: clip cannot scroll, but focus / scrollIntoView on other engines might: keep the lane at 0 (IC-11b).
    const zero = () => { if (lane.scrollTop || lane.scrollLeft) { lane.scrollTop = 0; lane.scrollLeft = 0; } };
    lane.addEventListener("scroll", zero, { passive: true });
    const ro = new ResizeObserver(() => setLaneH(lane.clientHeight));
    ro.observe(lane);
    setLaneH(lane.clientHeight);
    return () => { lane.removeEventListener("scroll", zero); ro.disconnect(); };
  }, [laneRef]);
  // docs/596: the minimap's vertical axis is the content height H (families, then the character-change rows), drawn
  // over MINI_MH px from MINI_TOP; the frame is the lane's rows [−y, −y + laneH]. y stays unbounded (docs/584): the
  // minimap only stops a move from carrying the frame past the content, and never pulls an outside y back in.
  const lanesBottom = lanePack.items.length ? step.laneTop + Math.max(...lanePack.items.map((i) => i.top + i.height)) : 0;
  const contentH = Math.max(laneH, Math.max(step.state.packed?.bottom ?? 0, lanesBottom) + 40);
  const toMY = (y: number) => MINI_TOP + Math.min(1, Math.max(0, y / contentH)) * MINI_MH;
  const limitY = (y: number, from: number) => Math.min(Math.max(from, 0), Math.max(Math.min(from, laneH - contentH), y));
  const moveMini = (px: number, py: number) => {
    const d = miniDrag.current;
    if (!d) return;
    d.moved = true;
    const left = Math.max(0, Math.min(miniWidth, px - d.dx));
    // The content height at the press (review P3-1): a repack mid-drag must not rescale the distance already dragged.
    const y = limitY(d.y0 - ((py - d.py0) * d.h0) / MINI_MH, d.y0);
    viewport.setWindow({ start: mini.toT(left), y });
  };
  const vband = useMemo<[number, number]>(() => {
    const h = Math.max(300, laneH), step = Math.max(150, h / 3), top = -view.y;
    return [Math.floor((top - h) / step) * step, Math.ceil((top + 2 * h) / step) * step];
  }, [laneH, view.y]);
  // docs/584 R1: the lane cannot scroll, so when the in-place editor opens (or grows) partly outside the lane, the
  // canvas moves just enough to show it, as a scroll container used to (TL-R1, IC-11b).
  useLayoutEffect(() => {
    if (!editing) return;
    const lane = laneRef.current, el = plane.current?.querySelector<HTMLElement>(`[data-event-card][data-event-id="${CSS.escape(editing)}"]`);
    if (!lane || !el) return;
    // Fully visible when it fits; taller than the lane, its bottom (the save / cancel buttons) is kept in view.
    const reveal = () => {
      const l = lane.getBoundingClientRect(), r = el.getBoundingClientRect(), m = 12;
      // docs/596 P2-1: an editor under the 120px minimap keeps its save / cancel buttons above it.
      const mm = host.current?.querySelector("[data-minimap]")?.getBoundingClientRect();
      const mb = mm && r.right > mm.left && r.left < mm.right ? Math.max(m, l.bottom - mm.top + 14) : m;
      let dy = 0;
      if (r.height + m + mb > l.height) dy = l.bottom - mb - r.bottom;
      else if (r.top < l.top + m) dy = l.top + m - r.top;
      else if (r.bottom > l.bottom - mb) dy = l.bottom - mb - r.bottom;
      if (Math.abs(dy) > 0.5) viewport.setWindow({ y: viewport.getSnapshot().y + dy });
    };
    reveal();
    const ro = new ResizeObserver(reveal);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editing, laneRef, viewport]);
  // docs/584 R1: centre the packed cards once on the first open (a one-shot store request; a locate cancels it).
  useLayoutEffect(() => {
    if (!step.state.packed || !(laneH > 0) || !(width > 0)) return;
    // Keep the request until cards are packed, so an empty first layout does not swallow it.
    // docs/592 review round 1 #3: points are events too.
    const cards = step.elements.filter((e) => e.kind === "card" || e.kind === "point");
    if (!cards.length || !viewport.takeCenterRequest()) return;
    // The fitted window already spans the stretch to show; centre the cards that fall inside it (the packed range is
    // up to seven windows wide), horizontally by their pixel box, vertically when they fit the lane.
    const tx = step.translateX + PAD, plot = width + 2 * PAD;
    const inside = cards.filter((c) => c.left + tx + c.width > 0 && c.left + tx < plot);
    const pool = inside.length ? inside : cards;
    const left = Math.max(0, Math.min(...pool.map((c) => c.left + tx))), right = Math.min(plot, Math.max(...pool.map((c) => c.left + c.width + tx)));
    const top = Math.min(...pool.map((c) => c.top)), bottom = Math.max(...pool.map((c) => c.top + c.height));
    const dx = (left + right) / 2 - plot / 2;
    const v = viewport.getSnapshot();
    viewport.setWindow({
      start: v.start + dx / (width / v.span),
      y: bottom - top <= laneH ? laneH / 2 - (top + bottom) / 2 : 24 - top,
    });
  });
  // docs/584 R1: nothing packed falls inside the lane → offer 复位. Checked on the visible rows only.
  const emptyView = tree.roots.length > 0 && laneH > 0 && width > 0 && !step.elements.some((c) => {
    if (c.kind !== "card" && c.kind !== "point") return false;
    const x = c.left + step.translateX + PAD, y = c.top + view.y;
    return x + c.width > 0 && x < width + 2 * PAD && y + c.height > 0 && y < laneH;
  });
  const frameLeft = mini.toX(view.start), frameRight = mini.toX(view.start + view.span);
  // Clamped to the drawing area (review P3-3): a view above or below the content shows an 8px frame at that edge.
  const frameH = Math.min(MINI_MH, Math.max(8, (laneH / contentH) * MINI_MH));
  const frameTop = Math.min(MINI_TOP + MINI_MH - frameH, Math.max(MINI_TOP, MINI_TOP + (-view.y / contentH) * MINI_MH));
  // docs/596 P3: the marks change with the layout, the minimap or a search, not on a pan frame. Every zoom step repacks
  // (new family y and content height for every mark), so the marks read deferred copies: React redraws them at low
  // priority after the step's frame, and a burst of wheel steps draws them once (CP-07 long tasks).
  const packedFamilies = useDeferredValue(step.state.packed?.families), built = step.state.build;
  const markH = useDeferredValue(contentH);
  const miniMarks = useMemo(() => {
    const out: React.ReactNode[] = [];
    let hidden = 0;
    const my = (y: number) => MINI_TOP + Math.min(1, Math.max(0, y / markH)) * MINI_MH;
    for (const r of tree.roots) {
      const f = packedFamilies?.get(r.id), x = mini.toX(r.start!);
      const ec = `var(${CATEGORY_VAR[r.event.category]})`, op = dimmed(r.id) ? 0.2 : 1;
      if (f?.built) {
        out.push(<i key={r.id} data-mini-root={r.id} data-mini-row="packed" style={{ left: x, top: my(f.y), height: Math.max(2, (f.box.h / markH) * MINI_MH), "--ec": ec, opacity: op * (0.45 + r.event.importance * 0.18) } as React.CSSProperties} />);
      } else {
        // Outside the build range ("out") or hidden by the zoom level ("hidden"): no laid-out height, so the bottom row.
        // Every root keeps a mark, as before docs/596 (the minimap shows the whole timeline, docs/595).
        const away = !built || familyEnd(r) < built.lo || r.start! > built.hi;
        if (!away) hidden++;
        out.push(<i key={r.id} data-mini-root={r.id} data-mini-row={away ? "out" : "hidden"} style={{ left: x, top: MINI_TOP + MINI_MH + 4, height: 6, "--ec": ec, opacity: op } as React.CSSProperties} />);
      }
    }
    return { nodes: out, hidden };
  }, [tree, packedFamilies, built, mini, markH, dimmed]);
  // Code review P2: no hover marks while a time drag is in progress (the card keeps no stale highlight).
  const shownHover = timeDrag.preview ? null : hover;
  const hotNode = shownHover ? shown.byId.get(shownHover) : undefined;
  const hotMark = hotNode && hotNode.start !== null && !timeDrag.preview
    ? { x: toX(hotNode.start), text: pointDate(hotNode.id), ec: `var(${CATEGORY_VAR[hotNode.event.category]})` }
    : null;

  return (
    <div
      ref={host}
      data-timeline=""
      data-view-span={view.span}
      data-axis-precision={axis}
      data-view-start={view.start}
      data-view-y={view.y}
      className={s.timeline}
      tabIndex={0}
      aria-label="世界时间线"
      onKeyDown={(e) => {
        // docs/584: Space arms a pan anywhere in the timeline except in controls (a focused button keeps its Space).
        if (e.key === " " && !typing(e.target) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!e.repeat) { space.current = true; e.currentTarget.setAttribute("data-space", ""); }
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !typing(e.target) && selection.size > 0) {
          e.preventDefault();
          onDeleteSelection();
          return;
        }
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          viewport.setWindow({ start: view.start + ((e.key === "ArrowRight" ? 1 : -1) * view.span) / 10 });
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          viewport.setWindow({ y: view.y + (e.key === "ArrowDown" ? -80 : 80) });
        }
      }}
      onKeyUp={(e) => { if (e.key === " ") { space.current = false; e.currentTarget.removeAttribute("data-space"); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { space.current = false; e.currentTarget.removeAttribute("data-space"); } }}
      onPointerDownCapture={(e) => {
        // docs/584 R2 routing, before card titles and periods: the middle button, or Space + left, pans from anywhere
        // in the timeline (periods sit outside the lane) except the minimap.
        if ((e.target as Element).closest("[data-minimap]")) return;
        const pan = e.button === 1 || (e.button === 0 && space.current);
        if (!pan) return;
        if (e.button === 1) e.preventDefault();
        e.stopPropagation();
        const root = e.currentTarget;
        if (!typing(e.target)) root.focus({ preventScroll: true });
        drag.current = { x: e.clientX, y: e.clientY, start: view.start, top: view.y, active: false };
        root.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || scale <= 0) return;
        if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < PAN_THRESHOLD) return;
        if (!d.active) { d.active = true; e.currentTarget.setAttribute("data-panning", ""); getSelection()?.removeAllRanges(); }
        viewport.setWindow({ start: d.start - (e.clientX - d.x) / scale, y: d.top + (e.clientY - d.y) });
      }}
      onPointerUp={(e) => { if (drag.current) { drag.current = null; e.currentTarget.removeAttribute("data-panning"); } }}
      onPointerCancel={() => { if (drag.current?.active) restorePan(drag.current); drag.current = null; }}
      onAuxClickCapture={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <Ruler ticks={ticks} toX={toX} label={(t) => ctx.adapter.label(t, view.span)} hot={hotMark} />
      <div className={s.periodsRow}>
        {periods.map((p) => {
          const right = width + PAD, a = toX(p.start), b = p.end === null ? Infinity : toX(p.end);
          const l = Math.max(PAD, a), r = Math.min(right, b);
          if (r <= l) return null;
          const clippedStart = a < PAD, clippedEnd = b > right, roomy = r - l >= 64;
          return (
            <div
              key={p.id}
              data-period={p.id}
              className={`${s.periodBand} ${p.end === null ? s.periodOpen : ""}`}
              style={{ left: l, width: r - l, "--pc": `var(--chart-${periodColor(p.id)})`, borderLeftStyle: clippedStart ? "dashed" : "solid", borderRightStyle: clippedEnd ? "dashed" : "solid" } as React.CSSProperties}
              onPointerDown={(ev) => { if (p.mutable && ev.button === 0 && !space.current) timeDrag.startPeriod(ev, p.id, "move"); }}
              onPointerMove={(ev) => { if (scale > 0) timeDrag.move(ev.clientX, scale); }}
              onPointerUp={() => timeDrag.end()}
              onPointerCancel={() => timeDrag.cancel()}
              onClick={() => timeDrag.onPeriodClick(p.id)}
            >
              {p.mutable && !clippedStart && roomy && (
                <button aria-label={`调整${p.title}开始`} className={s.periodEdge} onPointerDown={(ev) => { if (ev.button === 0 && !space.current) timeDrag.startPeriod(ev, p.id, "start"); }}>│</button>
              )}
              <button className={s.periodTitle} title={p.title}>
                {clippedStart ? "‹ " : ""}
                {p.title}
                {p.end === null ? (p.ongoing ? " · 持续中 ›" : " · 结束未定") : clippedEnd ? " ›" : ""}
              </button>
              {p.mutable && p.end !== null && !clippedEnd && roomy && (
                <button aria-label={`调整${p.title}结束`} className={`${s.periodEdge} ${s.periodEdgeEnd}`} onPointerDown={(ev) => { if (ev.button === 0 && !space.current) timeDrag.startPeriod(ev, p.id, "end"); }}>│</button>
              )}
            </div>
          );
        })}
      </div>
      <div
        data-timeline-lane=""
        className={s.lane}
        ref={laneRef}
        onPointerDown={(e) => {
          // docs/584 R2: a left press on the canvas or on a card outside its title / controls may become a box selection
          // (≥ 5px) or stays a click (cards select themselves; empty canvas clears). No preventDefault: focus moves here.
          if (e.button !== 0 || (e.target as Element).closest("button,summary,input,select,textarea,a,[data-minimap],[data-card-title],[data-card-menu]")) return;
          const additive = e.metaKey || e.ctrlKey || e.shiftKey, mods = { toggle: e.metaKey || e.ctrlKey, add: e.shiftKey };
          // docs/592 §2.6 (review round 2 #3): a press on a point selects it; it turns into a card next frame. A second press
          // within POINT_DOUBLE_MS near the first is that point's double click, wherever it lands (its new card, or the
          // empty spot the card moved away from): the lane edits once and swallows the click, so the card does not too.
          const pt = (e.target as Element).closest<HTMLElement>("[data-event-point]")?.dataset.eventId;
          const last = lastPointPress.current, now = performance.now();
          const repeat = !!last && now - last.at < POINT_DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < PAN_THRESHOLD;
          lastPointPress.current = null;
          swallowClick.current = false;
          if (repeat) { swallowClick.current = true; ctx.onSelect(last!.id, 2, mods); }
          else if (pt) { lastPointPress.current = { id: pt, at: now, x: e.clientX, y: e.clientY }; ctx.onSelect(pt, 1, mods); }
          box.current = { x: e.clientX, y: e.clientY, additive, active: false, onCard: !!pt || repeat || !!(e.target as Element).closest("[data-event-card]") };
          if (!typing(e.target)) host.current?.focus({ preventScroll: true });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (scale > 0 && timeDrag.move(e.clientX, scale)) return;
          const b = box.current;
          if (!b) return;
          if (!b.active && Math.hypot(e.clientX - b.x, e.clientY - b.y) < PAN_THRESHOLD) return;
          if (!b.active) { b.active = true; e.currentTarget.setAttribute("data-panning", ""); getSelection()?.removeAllRanges(); }
          const r = e.currentTarget.getBoundingClientRect();
          setRect({ x: Math.min(b.x, e.clientX) - r.left, y: Math.min(b.y, e.clientY) - r.top, w: Math.abs(e.clientX - b.x), h: Math.abs(e.clientY - b.y) });
        }}
        onPointerUp={(e) => {
          const b = box.current;
          box.current = null;
          e.currentTarget.removeAttribute("data-panning");
          timeDrag.end();
          if (!b) return;
          if (b.active) {
            // The box from the press and the release point (not the last rendered rect, which may lag a frame).
            // Hit test on layout coordinates, so cards outside the rendered band are selected too.
            const lr = e.currentTarget.getBoundingClientRect();
            const box = { x: Math.min(b.x, e.clientX) - lr.left, y: Math.min(b.y, e.clientY) - lr.top, w: Math.abs(e.clientX - b.x), h: Math.abs(e.clientY - b.y) };
            const tx = step.translateX + PAD;
            const hit = step.elements.filter((c) => (c.kind === "card" || c.kind === "point") && c.left + tx < box.x + box.w && c.left + tx + c.width > box.x && c.top + view.y < box.y + box.h && c.top + c.height + view.y > box.y).map((c) => c.id);
            setRect(null);
            onBoxSelect([...new Set(hit)], b.additive);
          } else if (!b.onCard && !b.additive) onClearSelection();
          setRect(null);
        }}
        onPointerCancel={() => { box.current = null; setRect(null); timeDrag.cancel(); }}
        onClickCapture={(e) => { if (swallowClick.current) { swallowClick.current = false; e.stopPropagation(); } }}
        onPointerOver={(e) => hoverAt(e.target)}
        onPointerLeave={() => setHover(null)}
      >
        <div ref={plane} data-timeline-plane="" className={s.plane} style={{ transform: `translate(${step.translateX + PAD}px, ${view.y}px)`, height: (step.state.packed?.bottom ?? 0) + 120 }}>
          {step.elements.map((el) => {
            // Real data (995 events, one family each) builds ~850 cards in the 7-window build range; rendering only the
            // ones within a screen above and below the lane's scroll position keeps style recalculation off the pan
            // path. Packing is unchanged, so no card moves; the selected / hit / editing cards are always rendered.
            if (el.top + el.height < vband[0] || el.top > vband[1]) {
              if (el.kind !== "card" || (el.id !== selected && el.id !== hitId && el.id !== editing && !selection.has(el.id))) return null;
            }
            if (el.kind === "lane")
              return (
                <div key={`l${el.id}`} className={s.laneItem} style={{ left: el.left, top: el.top, width: LANE_CARD_WIDTH }}>
                  {lanePack.nodes.get(el.id)}
                </div>
              );
            const n = node(el.id);
            if (!n) return null;
            const ec = {
              "--ec": `var(${CATEGORY_VAR[n.event.category]})`,
              ...(moved?.has(el.id) && preview!.edge !== "end" ? { transform: `translateX(${preview!.delta * scale}px)` } : {}),
            } as React.CSSProperties;
            if (el.kind === "frame")
              return <div key={`f${el.id}`} data-family-frame="" data-family={el.family} className={s.familyFrame} style={{ ...ec, left: el.left, width: el.width, top: el.top, height: el.height }} />;
            if (el.kind === "track")
              return <i key={`t${el.id}`} className={s.track} style={{ ...ec, left: el.left, width: el.width, top: el.top }} />;
            if (el.kind === "bar")
              return <i key={`b${el.id}`} className={s.durBar} style={{ ...ec, left: el.left, width: el.width, top: el.top }} />;
            if (el.kind === "point")
              return (
                <div key={`p${el.id}`} data-event={el.id} data-family={el.family} data-plane-left="" className={s.tcard} style={{ ...ec, left: el.left, top: el.top, width: el.width, height: el.height }}>
                  <EventPoint event={n.event} date={pointDate(n.id)} kids={famInfo.get(n.id)?.count ?? 0} hot={shownHover === n.id} dimmed={dimmed(n.id)} selected={selection.has(n.id)} />
                </div>
              );
            const parent = n.children.length > 0;
            // docs/592 R2: the card zooms on an inner box; the outer box keeps the layout position (zoom scales left/top).
            const z = el.zoom ?? 1;
            const cardEl = (
                <EventCard
                  event={n.event}
                  expanded={expanded.has(n.id)}
                  selected={selected === n.id || selection.has(n.id)}
                  hit={hitId === n.id}
                  dimmed={dimmed(n.id)}
                  editing={editing === n.id}
                  childCount={n.children.length}
                  descendantCount={famInfo.get(n.id)?.count ?? 0}
                  folded={viewFolded.has(n.id)}
                  placed
                  maxAvatars={3}
                  variant="timeline"
                  selectionSize={selection.has(n.id) && selection.size >= 2 ? selection.size : undefined}
                  titleLines={el.lines}
                  stacked={el.stacked}
                  hot={shownHover === n.id}
                  onFold={foldClick}
                />
            );
            return (
              <div key={`c${el.id}`} data-event={el.id} data-family={el.family} data-plane-left="" {...(shownHover === n.id ? { "data-hot": "" } : {})} className={`${s.tcard} ${parent ? s.header : ""}`} style={{ ...ec, left: el.left, top: el.top, width: el.width }}>
                {/* The stamp and clip notes stay unzoomed children of the positioned box (docs/585 selectors). */}
                <span data-stamp="" {...(parent ? { "data-family-range": "" } : {})} className={s.stamp} title={stamps.get(n.id)}>{stamps.get(n.id)}</span>
                {el.clippedStart && <span className={s.clipNote}>{CLIP_START_LABEL}</span>}
                {el.clippedEnd && <span className={`${s.clipNote} ${s.clipEnd}`}>{CLIP_END_LABEL}</span>}
                <div data-card-zoom={z} className={s.cardZoom} style={z === 1 ? undefined : { zoom: z, width: el.width / z }}>
                  {cardEl}
                </div>
              </div>
            );
          })}
          {lanePack.heads.map((h) => (
            <div key={`h${h.id}`} role="group" aria-label={h.name} className={s.laneHead} style={{ top: step.laneTop + h.top, transform: `translateX(${-step.translateX}px)` }}>
              {h.label}
            </div>
          ))}
        </div>
        {hotMark && <i data-hover-guide="" className={s.hoverGuide} style={{ left: hotMark.x, "--ec": hotMark.ec } as React.CSSProperties} />}
        {rect && <div data-select-rect="" className={s.selectRect} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
        {!tree.roots.length && <p className={s.emptyNote}>{emptyText ?? "当前世界线还没有已定位事件。添加事件，或为待定位事件设置时间。"}</p>}
        {emptyView && (
          <div data-empty-view="" className={s.emptyView}>
            视图内没有事件
            <button type="button" onClick={onReset}>复位</button>
          </div>
        )}
      </div>
      <div
        data-minimap=""
        role="slider"
        tabIndex={0}
        aria-label="全局缩略：点击或拖动移动视窗，方向键平移"
        data-content-height={contentH}
        data-mini-hidden={miniMarks.hidden}
        aria-valuemin={mini.segments[0]?.t0 ?? 0}
        aria-valuemax={mini.segments.at(-1)?.t1 ?? 0}
        aria-valuenow={Math.round(view.start)}
        aria-valuetext={laneH > 0 ? `${ctx.adapter.label(view.start, view.span)}，纵向 第 ${Math.min(Math.max(1, Math.floor(-view.y / laneH) + 1), Math.max(1, Math.ceil(contentH / laneH)))} / ${Math.max(1, Math.ceil(contentH / laneH))} 屏` : ctx.adapter.label(view.start, view.span)}
        className={s.minimap}
        style={width + 2 * PAD - 24 < MINIMAP_WIDTH ? undefined : { width: miniWidth }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
          const inside = px >= frameLeft && px <= Math.max(frameRight, frameLeft + 8) && py >= frameTop && py <= frameTop + frameH;
          const d = { dx: px - frameLeft, px0: px, py0: py, start0: view.start, y0: view.y, h0: contentH, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
          miniDrag.current = d;
          if (inside) return;
          // docs/596 (and docs/595 review P2-2): a press outside the frame centres the window on the pressed time and,
          // when the content is taller than the lane and the new window stays in the current build range (the layout the
          // vertical axis describes, §3), on the pressed height; then the drag continues from there. A jump past the
          // build range lays out afresh, so its y would point at rows of the old layout: y is kept.
          const start = mini.toT(px) - view.span / 2;
          const sameLayout = !!built && start >= built.lo && start + view.span <= built.hi;
          const y = contentH > laneH && sameLayout ? limitY(-(((Math.min(Math.max(py, MINI_TOP), MINI_TOP + MINI_MH) - MINI_TOP) / MINI_MH) * contentH - laneH / 2), view.y) : view.y;
          viewport.setWindow({ start, y });
          d.moved = true;
          // The frame now starts at toX(start); keep the pointer at that offset while dragging on.
          d.dx = px - mini.toX(start);
          d.y0 = y;
        }}
        onPointerMove={(e) => { if (miniDrag.current) { const r = e.currentTarget.getBoundingClientRect(); moveMini(e.clientX - r.left, e.clientY - r.top); } }}
        onPointerUp={() => { miniDrag.current = null; }}
        onPointerCancel={() => { miniDrag.current = null; }}
        onLostPointerCapture={() => { miniDrag.current = null; }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            viewport.setWindow({ y: limitY(view.y + ((e.key === "ArrowDown" ? -1 : 1) * laneH) / 4, view.y) });
            return;
          }
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          viewport.setWindow({ start: view.start + ((e.key === "ArrowRight" ? 1 : -1) * view.span) / 4 });
        }}
      >
        {mini.segments.map((g) => (
          <u key={g.index} style={{ left: g.x0, width: g.width }} />
        ))}
        {lanesBottom > 0 && <s data-mini-lanes="" style={{ top: toMY(step.laneTop), height: Math.max(2, toMY(lanesBottom) - toMY(step.laneTop)) }} />}
        {miniMarks.nodes}
        <b style={{ left: frameLeft, width: Math.max(8, frameRight - frameLeft), top: frameTop, height: frameH }} />
      </div>
    </div>
  );
}

/** docs/577 §13 / 581 WU-64, WU-56c: the tree beside the timeline marks the events inside the window. It subscribes to
 * the viewport store itself (throttled to one update per 100ms during a pan) so PlanningWorkspace never re-renders. */
export function TimelineTreeNav(props: Omit<React.ComponentProps<typeof EventTreeNav>, "inView"> & { viewport: ViewportStore }) {
  const { viewport, tree, ...rest } = props;
  const [w, setW] = useState(() => viewport.getSnapshot());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null, last = 0;
    const flush = () => { timer = null; last = performance.now(); setW(viewport.getSnapshot()); };
    const off = viewport.subscribe(() => {
      if (timer) return;
      const wait = Math.max(0, 100 - (performance.now() - last));
      timer = setTimeout(flush, wait);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [viewport]);
  const inView = useMemo(() => {
    const set = new Set<string>(), lo = w.start, hi = w.start + w.span;
    for (const n of tree.byId.values()) if (n.start !== null && n.start <= hi && (n.end ?? n.start) >= lo) set.add(n.id);
    return set;
  }, [tree, w]);
  return <EventTreeNav tree={tree} inView={inView} {...rest} />;
}

/** Renders `render(window)` from the viewport store, so values that follow the window (zoom label, 延续事件 count,
 * end-of-window character states) update without re-rendering PlanningWorkspace (581 WU-56c). */
export function ViewportValue({ store, render }: { store: ViewportStore; render(w: { start: number; span: number }): React.ReactNode }) {
  const w = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <>{render(w)}</>;
}

/** docs/583 R3 rule 0: true when an element between the wheel target and the lane (the lane itself and the timeline
 * root excluded) can still scroll in the wheel's direction, so it keeps the wheel; at its end the canvas takes over. */
function yieldsTo(target: Element | null, lane: HTMLElement | null, dx: number, dy: number): HTMLElement | null {
  const horizontal = Math.abs(dx) > Math.abs(dy), d = horizontal ? dx : dy;
  if (!d) return null;
  for (let el = target; el && el !== lane; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.matches("[data-timeline]")) return null;
    const cs = getComputedStyle(el);
    if (horizontal) {
      if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && (d > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0)) return el;
    } else if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && (d > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return el;
  }
  return null;
}

/** Text controls keep their keys and Space (docs/584 R2). */
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input,textarea,select,button,summary,[contenteditable=''],[contenteditable='true'],[role=button],[role=textbox]");
}

/** docs/592 §2.4 / docs/593: the status-line note of the zoom levels: 「N 个一般（重要）事件显示为时间点 · 显示为卡片」. It subscribes
 * to the panel's note store, so a zoom step re-renders only this line. */
export function ZoomNoteLine({ store }: { store: ZoomNoteStore }) {
  const note = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!note) return null;
  const what = note.important ? "重要事件" : "一般事件";
  return (
    <span data-zoom-note="" className={s.zoomNote}>
      {note.showAll ? `${what}已显示为卡片` : `${note.count} 个${what}显示为时间点`}
      <button type="button" data-zoom-note-toggle="" onClick={() => store.actions?.toggleShowAll()}>{note.showAll ? "改回时间点" : "显示为卡片"}</button>
    </span>
  );
}
