"use client";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORY_VAR,
  CLIP_END_LABEL,
  CLIP_START_LABEL,
  collapsedCardInput,
  collapsedCardWidth,
  descendants,
  familyStampEnd,
  emptyTimeline,
  minimapModel,
  timelineStep,
  type EventTree,
  type LaneItem,
  type TimelineState,
  type TreeNode,
} from "@/lib/planning/worldline-layout";
import { layoutTimelineCards, timelineTicks } from "@/lib/planning/timeline";
import type { ViewportStore } from "@/lib/planning/worldline-viewport";
import { EventCard, WorldlineCardContext } from "./EventCard";
import { EventTreeNav } from "./EventTree";
import s from "./worldline.module.css";
import { renderProbe } from "@/lib/planning/render-probe";

const MINIMAP_WIDTH = 420;
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

/** The time ruler; a component of its own so the render-count case can see it re-render on every window change. */
function Ruler({ ticks, toX, label }: { ticks: readonly number[]; toX(t: number): number; label(t: number): string }) {
  renderProbe("Ruler");
  return (
    <div className={s.ruler} data-ruler="">
      {ticks.map((t) => (
        <span key={t} style={{ left: toX(t) }}>{label(t)}</span>
      ))}
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
  const moved = useMemo(() => {
    const n = preview && preview.delta ? tree.byId.get(preview.id) : undefined;
    if (!n) return null;
    // docs/584 A3: a group drag shifts every moved event, what is anchored to it, and their subtrees (deduplicated).
    const roots = preview!.follows ? [...preview!.follows].map((id) => tree.byId.get(id)).filter((x): x is TreeNode => !!x) : [n];
    return new Set(roots.flatMap((r) => [r.id, ...(preview!.edge === "move" ? descendants(r).map((d) => d.id) : [])]));
  }, [tree, preview]);
  // docs/583 R1: collapsed widths follow the rendered head (found people, descendants), so the character list is a
  // relayout input too: adding or deleting a character resizes cards and repacks.
  const widthOf = useMemo(() => {
    const cache = new Map<string, number>(), known = new Set(ctx.characters.map((c) => c.id));
    return (n: TreeNode) => {
      let w = cache.get(n.id);
      if (w === undefined) cache.set(n.id, (w = collapsedCardWidth(collapsedCardInput(n, known, shown))));
      return w;
    };
  }, [shown, ctx.characters]);
  const inputs = [shown, open, folded, heights, widthOf] as const;
  const relayout = !lastSizes.current || inputs.some((v, i) => v !== lastSizes.current![i]);
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
  const step = timelineStep(state.current, { tree: shown, view, width, expanded: open, folded, heights, widthOf, pinned, relayout, lane: lanePack.items });
  useLayoutEffect(() => {
    state.current = step.state;
    lastSizes.current = inputs;
  });
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
  const drag = useRef<{ x: number; y: number; start: number; top: number; active: boolean } | null>(null);
  const box = useRef<{ x: number; y: number; additive: boolean; active: boolean; onCard: boolean } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const space = useRef(false);
  const miniDrag = useRef<{ offset: number } | null>(null);
  const td = useRef(timeDrag);
  td.current = timeDrag;
  useEffect(() => {
    const cancel = () => {
      if (drag.current?.active) restorePan(drag.current);
      drag.current = null;
      box.current = null;
      setRect(null);
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
  const zoomAnchor = useRef<{ id: string; y: number } | null>(null);
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
        const card = document.elementFromPoint(a.x, a.y)?.closest<HTMLElement>("[data-timeline-plane] [data-event-card]");
        zoomAnchor.current = card ? { id: card.dataset.eventId!, y: card.getBoundingClientRect().top } : null;
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
    const card = plane.current?.querySelector<HTMLElement>(`[data-event-card][data-event-id="${CSS.escape(a.id)}"]`);
    if (card) viewport.setWindow({ y: viewport.getSnapshot().y - (card.getBoundingClientRect().top - a.y) });
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
  const moveMini = (px: number) => {
    const left = Math.max(0, Math.min(miniWidth, px - (miniDrag.current?.offset ?? 0)));
    viewport.setWindow({ start: mini.toT(left) });
  };
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
      let dy = 0;
      if (r.height + 2 * m > l.height) dy = l.bottom - m - r.bottom;
      else if (r.top < l.top + m) dy = l.top + m - r.top;
      else if (r.bottom > l.bottom - m) dy = l.bottom - m - r.bottom;
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
    const cards = step.elements.filter((e) => e.kind === "card");
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
    if (c.kind !== "card") return false;
    const x = c.left + step.translateX + PAD, y = c.top + view.y;
    return x + c.width > 0 && x < width + 2 * PAD && y + c.height > 0 && y < laneH;
  });
  const frameLeft = mini.toX(view.start), frameRight = mini.toX(view.start + view.span);

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
      <Ruler ticks={ticks} toX={toX} label={(t) => ctx.adapter.label(t, view.span)} />
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
          box.current = { x: e.clientX, y: e.clientY, additive: e.metaKey || e.ctrlKey || e.shiftKey, active: false, onCard: !!(e.target as Element).closest("[data-event-card]") };
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
            const hit = step.elements.filter((c) => c.kind === "card" && c.left + tx < box.x + box.w && c.left + tx + c.width > box.x && c.top + view.y < box.y + box.h && c.top + c.height + view.y > box.y).map((c) => c.id);
            setRect(null);
            onBoxSelect([...new Set(hit)], b.additive);
          } else if (!b.onCard && !b.additive) onClearSelection();
          setRect(null);
        }}
        onPointerCancel={() => { box.current = null; setRect(null); timeDrag.cancel(); }}
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
            const parent = n.children.length > 0;
            return (
              <div key={`c${el.id}`} data-event={el.id} data-family={el.family} data-plane-left="" className={`${s.tcard} ${parent ? s.header : ""}`} style={{ ...ec, left: el.left, top: el.top, width: el.width }}>
                <span data-stamp="" {...(parent ? { "data-family-range": "" } : {})} className={s.stamp} title={stamps.get(n.id)}>{stamps.get(n.id)}</span>
                {el.clippedStart && <span className={s.clipNote}>{CLIP_START_LABEL}</span>}
                {el.clippedEnd && <span className={`${s.clipNote} ${s.clipEnd}`}>{CLIP_END_LABEL}</span>}
                <EventCard
                  event={n.event}
                  expanded={expanded.has(n.id)}
                  selected={selected === n.id || selection.has(n.id)}
                  hit={hitId === n.id}
                  dimmed={dimmed(n.id)}
                  editing={editing === n.id}
                  childCount={n.children.length}
                  descendantCount={famInfo.get(n.id)?.count ?? 0}
                  folded={folded.has(n.id)}
                  placed
                  maxAvatars={3}
                  variant="timeline"
                  selectionSize={selection.has(n.id) && selection.size >= 2 ? selection.size : undefined}
                  onFold={onFold}
                />
              </div>
            );
          })}
          {lanePack.heads.map((h) => (
            <div key={`h${h.id}`} role="group" aria-label={h.name} className={s.laneHead} style={{ top: step.laneTop + h.top, transform: `translateX(${-step.translateX}px)` }}>
              {h.label}
            </div>
          ))}
        </div>
        {rect && <div data-select-rect="" className={s.selectRect} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
        {!tree.roots.length && <p className={s.emptyNote}>当前世界线还没有已定位事件。添加事件，或为待定位事件设置时间。</p>}
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
        aria-label="全局缩略：点击或拖动移动视窗，← → 平移"
        aria-valuemin={mini.segments[0]?.t0 ?? 0}
        aria-valuemax={mini.segments.at(-1)?.t1 ?? 0}
        aria-valuenow={Math.round(view.start)}
        aria-valuetext={ctx.adapter.label(view.start, view.span)}
        className={s.minimap}
        style={width + 2 * PAD - 24 < MINIMAP_WIDTH ? undefined : { width: miniWidth }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left;
          miniDrag.current = { offset: px >= frameLeft && px <= frameRight ? px - frameLeft : (frameRight - frameLeft) / 2 };
          e.currentTarget.setPointerCapture(e.pointerId);
          moveMini(px);
        }}
        onPointerMove={(e) => { if (miniDrag.current) moveMini(e.clientX - e.currentTarget.getBoundingClientRect().left); }}
        onPointerUp={() => { miniDrag.current = null; }}
        onPointerCancel={() => { miniDrag.current = null; }}
        onLostPointerCapture={() => { miniDrag.current = null; }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          viewport.setWindow({ start: view.start + ((e.key === "ArrowRight" ? 1 : -1) * view.span) / 4 });
        }}
      >
        {mini.segments.map((g) => (
          <u key={g.index} style={{ left: g.x0, width: g.width }} />
        ))}
        {tree.roots.map((r) => (
          <i key={r.id} style={{ left: mini.toX(r.start!), height: 10 + r.event.importance * 6, "--ec": `var(${CATEGORY_VAR[r.event.category]})`, opacity: dimmed(r.id) ? 0.2 : 1 } as React.CSSProperties} />
        ))}
        <b style={{ left: frameLeft, width: Math.max(8, frameRight - frameLeft) }} />
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
