"use client";
import { renderProbe } from "@/lib/planning/render-probe";
import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import { CATEGORY_VAR, descendants, TREE_INDENT, type EventTree as Tree, type TreeNode } from "@/lib/planning/worldline-layout";
import { Highlight, WorldlineCardContext } from "./EventCard";
import s from "./worldline.module.css";

export const TREE_MIN_WIDTH = 160, TREE_MAX_WIDTH = 640;
const clampTreeWidth = (w: number, room: number) =>
  Math.round(Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, room > 0 ? room - 240 : TREE_MAX_WIDTH, w)));

/** The splitter on the tree's right edge. A drag writes --tree-w on the workspace directly (no React render per
 * pointer move) and commits once on release; ←→ step by 16px; a double click returns to the default width. */
export function TreeResizer({ width, onChange }: { width: number | null; onChange(width: number | null): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const current = () => ref.current?.previousElementSibling?.getBoundingClientRect().width ?? width ?? 260;
  const room = () => ref.current?.parentElement?.clientWidth ?? 0;
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整事件目录宽度"
      aria-valuenow={Math.round(width ?? current())}
      aria-valuemin={TREE_MIN_WIDTH}
      aria-valuemax={TREE_MAX_WIDTH}
      tabIndex={0}
      title="拖动调整事件目录宽度，双击恢复默认"
      data-tree-resizer=""
      className={s.treeResizer}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const handle = e.currentTarget, ws = handle.parentElement!, x0 = e.clientX, w0 = current(), max = room();
        let w = w0;
        handle.setPointerCapture(e.pointerId);
        handle.dataset.dragging = "";
        const move = (ev: PointerEvent) => { w = clampTreeWidth(w0 + ev.clientX - x0, max); ws.style.setProperty("--tree-w", `${w}px`); };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          delete handle.dataset.dragging;
          if (w !== w0) onChange(w);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      }}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onChange(clampTreeWidth(current() + (e.key === "ArrowRight" ? 16 : -16), room()));
      }}
    />
  );
}

/** docs/577 §3.1 / §13: the event directory shared by both views. role="tree", ↑↓ move, ←→ fold, Enter locates (S10). */
export function EventTreeNav({
  tree,
  folded,
  selected,
  current,
  inView,
  dimmed,
  onFold,
  onLocate,
}: {
  tree: Tree;
  folded: ReadonlySet<string>;
  selected: string | null;
  current: string | null;
  inView: ReadonlySet<string> | null;
  dimmed: (id: string) => boolean;
  onFold(id: string): void;
  onLocate(id: string): void;
}) {
  const ctx = useContext(WorldlineCardContext)!;
  const nav = useRef<HTMLElement>(null);
  renderProbe("EventTree");
  // `shown` is the year header above the row; a row in that year drops the year from its time text.
  const rows: { node: TreeNode; depth: number; year?: string; pendingHead?: number; shown?: string | null }[] = [];
  let year: string | null = null;
  const walk = (n: TreeNode, depth: number) => {
    rows.push({ node: n, depth, shown: year });
    if (!folded.has(n.id)) for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of tree.roots) {
    const y = ctx.adapter.hasYears && r.start !== null ? ctx.adapter.yearText(r.start) : null;
    if (y && y !== year) { year = y; rows.push({ node: r, depth: -1, year: y }); }
    walk(r, 0);
  }
  if (tree.pending.length) {
    rows.push({ node: tree.pending[0], depth: -1, pendingHead: tree.pending.length });
    year = null;
    for (const p of tree.pending) walk(p, 0);
  }
  // Follow the view's current row unless the pointer is over the tree (§13).
  useEffect(() => {
    const el = nav.current, row = current && el?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(current)}"]`);
    if (!el || !row || el.matches(":hover")) return;
    if (row.offsetTop < el.scrollTop + 80 || row.offsetTop > el.scrollTop + el.clientHeight - 40) el.scrollTop = row.offsetTop - el.clientHeight / 3;
  }, [current]);
  // Fade overflowing titles (577 §11). One observer for every row: a per-row observer costs too much for ~1000 events.
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const over = entries.map((x) => [x.target, x.target.scrollWidth > x.target.clientWidth + 1] as const);
      for (const [t, o] of over) o ? t.setAttribute("data-fade", "") : t.removeAttribute("data-fade");
    });
    for (const t of el.querySelectorAll("[data-tree-title]")) observer.observe(t);
    return () => observer.disconnect();
  }, [tree, folded]);
  return (
    <nav ref={nav} className={s.tree} aria-label="事件目录">
      <div className={s.treeHead}>
        <b>事件目录</b>
        {inView && <span data-tree-inview="">视窗内 {inView.size} 件</span>}
      </div>
      <div
        role="tree"
        aria-label="事件目录"
        onKeyDown={(e) => {
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')];
          const at = items.indexOf(document.activeElement as HTMLElement);
          if (at < 0) return;
          const id = items[at].dataset.treeId!;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))].focus() }
          else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const n = tree.byId.get(id) ?? tree.pending.find((p) => p.id === id);
            if (n?.children.length && (e.key === "ArrowLeft") !== folded.has(id)) { e.preventDefault(); onFold(id) }
          } else if (e.key === "Enter") { e.preventDefault(); onLocate(id) }
        }}
      >
        {rows.map((r, i) => {
          if (r.year) return <div key={`y${i}`} className={s.treeGroup} data-tree-year="">{r.year}</div>;
          if (r.pendingHead) return <div key={`p${i}`} className={s.treeGroup}>待定位 · {r.pendingHead}</div>;
          const n = r.node, e = n.event, hasKids = n.children.length > 0, size = 3 + e.importance * 2;
          const precision = e.time.precision ?? "hour";
          const time = n.start === null ? "" : ctx.adapter.treeTime(n.start, precision, !!r.shown && ctx.adapter.yearText(n.start) === r.shown);
          return (
            <div
              key={n.id}
              role="treeitem"
              tabIndex={-1}
              data-tree-id={n.id}
              aria-label={`${e.title} ${n.start === null ? "待定位" : time || r.shown || ""}`}
              aria-selected={selected === n.id}
              {...(hasKids ? { "aria-expanded": !folded.has(n.id) } : {})}
              className={`${s.treeRow} ${selected === n.id ? s.selectedRow : ""} ${current === n.id ? s.current : ""} ${inView?.has(n.id) ? s.inView : ""} ${dimmed(n.id) ? s.dim : ""}`}
              style={{ paddingLeft: 4 + r.depth * TREE_INDENT, "--ec": `var(${CATEGORY_VAR[e.category]})` } as React.CSSProperties}
              onClick={() => onLocate(n.id)}
            >
              <span
                className={`${s.treeTwist} ${folded.has(n.id) ? s.closed : ""}`}
                onClick={(ev) => { if (!hasKids) return; ev.stopPropagation(); onFold(n.id) }}
              >
                {hasKids ? "▾" : ""}
              </span>
              <span className={s.treeDot} style={{ width: size, height: size }} />
              <span className={s.treeTitle} title={e.title} data-tree-title=""><Highlight text={e.title} terms={ctx.searchTerms} /></span>
              <span className={s.treeTime}>
                {hasKids ? `${folded.has(n.id) ? "+" : ""}${descendants(n).length}${time ? " · " : ""}` : ""}
                {time}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
