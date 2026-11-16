"use client";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORY_VAR,
  CLIP_END_LABEL,
  CLIP_START_LABEL,
  descendants,
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
  preview: { id: string; delta: number; edge: "move" | "start" | "end" } | null;
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
  /** The vertical scroll container (the workspace measures its width and scrolls it to located cards). */
  laneRef: React.RefObject<HTMLDivElement | null>;
  onFold(id: string): void;
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
    return n ? new Set([n.id, ...(preview!.edge === "move" ? descendants(n).map((d) => d.id) : [])]) : null;
  }, [tree, preview]);
  const inputs = [shown, open, folded, heights] as const;
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
  const step = timelineStep(state.current, { tree: shown, view, width, expanded: open, folded, heights, pinned, relayout, lane: lanePack.items });
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

  // Canvas pan: the window moves through the store; Esc, blur and pointercancel restore the start (§7.2, WU-56d).
  // Time drags (event cards, periods) are owned by the workspace and take precedence on move / up / cancel.
  const drag = useRef<{ x: number; start: number; active: boolean } | null>(null);
  const miniDrag = useRef<{ offset: number } | null>(null);
  const td = useRef(timeDrag);
  td.current = timeDrag;
  useEffect(() => {
    const cancel = () => {
      if (drag.current?.active) viewport.setWindow({ start: drag.current.start });
      drag.current = null;
      miniDrag.current = null;
      td.current.cancel();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && (drag.current || miniDrag.current)) cancel(); };
    const blur = cancel;
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur); };
  }, [viewport]);

  // Ctrl + wheel zooms around the window centre, Shift + wheel or a horizontal wheel pans. A native non-passive
  // listener is needed to stop the page zoom / scroll (React's onWheel is passive).
  const live = useRef({ view, width });
  live.current = { view, width };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const { view: v, width: w } = live.current;
      if (e.ctrlKey) {
        e.preventDefault();
        const f = e.deltaY > 0 ? 1.2 : 1 / 1.2, mid = v.start + v.span / 2, span = Math.min(1e12, Math.max(1, v.span * f));
        viewport.setWindow({ start: mid - span / 2, span });
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        viewport.setWindow({ start: v.start + ((e.shiftKey ? e.deltaY : e.deltaX) / Math.max(1, w)) * v.span });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [viewport]);

  const ticks = useMemo(
    () => (width > 0 ? timelineTicks(view.start, view.span, ctx.adapter.calendar, width) : []),
    [view.start, view.span, width, ctx.adapter.calendar],
  );
  const toX = (t: number) => PAD + (t - view.start) * scale;
  const node = (id: string): TreeNode | undefined => shown.byId.get(id);
  const mini = useMemo(() => minimapModel(tree.roots, MINIMAP_WIDTH, ctx.adapter), [tree, ctx.adapter]);
  const moveMini = (px: number) => {
    const left = Math.max(0, Math.min(MINIMAP_WIDTH, px - (miniDrag.current?.offset ?? 0)));
    viewport.setWindow({ start: mini.toT(left) });
  };
  const frameLeft = mini.toX(view.start), frameRight = mini.toX(view.start + view.span);

  return (
    <div
      ref={host}
      data-timeline=""
      data-view-span={view.span}
      className={s.timeline}
      tabIndex={0}
      aria-label="世界时间线"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          viewport.setWindow({ start: view.start + ((e.key === "ArrowRight" ? 1 : -1) * view.span) / 10 });
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          laneRef.current?.scrollBy({ top: e.key === "ArrowDown" ? 80 : -80 });
        }
      }}
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
              onPointerDown={(ev) => { if (p.mutable && ev.button === 0) timeDrag.startPeriod(ev, p.id, "move"); }}
              onPointerMove={(ev) => { if (scale > 0) timeDrag.move(ev.clientX, scale); }}
              onPointerUp={() => timeDrag.end()}
              onPointerCancel={() => timeDrag.cancel()}
              onClick={() => timeDrag.onPeriodClick(p.id)}
            >
              {p.mutable && !clippedStart && roomy && (
                <button aria-label={`调整${p.title}开始`} className={s.periodEdge} onPointerDown={(ev) => timeDrag.startPeriod(ev, p.id, "start")}>│</button>
              )}
              <button className={s.periodTitle} title={p.title}>
                {clippedStart ? "‹ " : ""}
                {p.title}
                {p.end === null ? (p.ongoing ? " · 持续中 ›" : " · 结束未定") : clippedEnd ? " ›" : ""}
              </button>
              {p.mutable && p.end !== null && !clippedEnd && roomy && (
                <button aria-label={`调整${p.title}结束`} className={`${s.periodEdge} ${s.periodEdgeEnd}`} onPointerDown={(ev) => timeDrag.startPeriod(ev, p.id, "end")}>│</button>
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
          if (e.button !== 0 || (e.target as Element).closest("[data-event-card],button,summary,input,select,[data-minimap]")) return;
          drag.current = { x: e.clientX, start: view.start, active: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (scale > 0 && timeDrag.move(e.clientX, scale)) return;
          const d = drag.current;
          if (!d || scale <= 0) return;
          if (!d.active && Math.abs(e.clientX - d.x) < PAN_THRESHOLD) return;
          d.active = true;
          viewport.setWindow({ start: d.start - (e.clientX - d.x) / scale });
        }}
        onPointerUp={() => { drag.current = null; timeDrag.end(); }}
        onPointerCancel={() => { if (drag.current?.active) viewport.setWindow({ start: drag.current.start }); drag.current = null; timeDrag.cancel(); }}
      >
        <div ref={plane} data-timeline-plane="" className={s.plane} style={{ transform: `translateX(${step.translateX + PAD}px)`, height: (step.state.packed?.bottom ?? 0) + 120 }}>
          {step.elements.map((el) => {
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
                {parent ? (
                  <span data-family-range="" className={s.stamp}>{ctx.adapter.short(n.start!, n.event.time.precision)} → {ctx.adapter.short(famInfo.get(n.id)!.end, n.event.time.precision)}</span>
                ) : (
                  <span className={s.stamp}>{ctx.adapter.short(n.start!, n.event.time.precision)}</span>
                )}
                {el.clippedStart && <span className={s.clipNote}>{CLIP_START_LABEL}</span>}
                {el.clippedEnd && <span className={`${s.clipNote} ${s.clipEnd}`}>{CLIP_END_LABEL}</span>}
                <EventCard
                  event={n.event}
                  expanded={expanded.has(n.id)}
                  selected={selected === n.id}
                  hit={hitId === n.id}
                  dimmed={dimmed(n.id)}
                  editing={editing === n.id}
                  childCount={n.children.length}
                  descendantCount={famInfo.get(n.id)?.count ?? 0}
                  folded={folded.has(n.id)}
                  placed
                  maxAvatars={3}
                  variant="timeline"
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
        {!tree.roots.length && <p className={s.emptyNote}>当前世界线还没有已定位事件。添加事件，或为待定位事件设置时间。</p>}
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
        style={{ width: MINIMAP_WIDTH }}
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
