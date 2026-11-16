"use client";
import { renderProbe } from "@/lib/planning/render-probe";
import { useContext, useEffect, useRef } from "react";
import { CATEGORY_VAR, descendants, TREE_INDENT, type EventTree as Tree, type TreeNode } from "@/lib/planning/worldline-layout";
import { Highlight, WorldlineCardContext } from "./EventCard";
import s from "./worldline.module.css";

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
  const rows: { node: TreeNode; depth: number; year?: string; pendingHead?: number }[] = [];
  let year: string | null = null;
  const walk = (n: TreeNode, depth: number) => {
    rows.push({ node: n, depth });
    if (!folded.has(n.id)) for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of tree.roots) {
    const y = ctx.adapter.hasYears && r.start !== null ? ctx.adapter.yearText(r.start) : null;
    if (y && y !== year) { year = y; rows.push({ node: r, depth: -1, year: y }); }
    walk(r, 0);
  }
  if (tree.pending.length) {
    rows.push({ node: tree.pending[0], depth: -1, pendingHead: tree.pending.length });
    for (const p of tree.pending) walk(p, 0);
  }
  // Follow the view's current row unless the pointer is over the tree (§13).
  useEffect(() => {
    const el = nav.current, row = current && el?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(current)}"]`);
    if (!el || !row || el.matches(":hover")) return;
    if (row.offsetTop < el.scrollTop + 40 || row.offsetTop > el.scrollTop + el.clientHeight - 40) el.scrollTop = row.offsetTop - el.clientHeight / 3;
  }, [current]);
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
          if (r.year) return <div key={`y${i}`} className={s.treeGroup}>{r.year}</div>;
          if (r.pendingHead) return <div key={`p${i}`} className={s.treeGroup}>待定位 · {r.pendingHead}</div>;
          const n = r.node, e = n.event, hasKids = n.children.length > 0, size = 3 + e.importance * 2;
          return (
            <div
              key={n.id}
              role="treeitem"
              tabIndex={-1}
              data-tree-id={n.id}
              aria-label={`${e.title} ${n.start === null ? "待定位" : ctx.adapter.short(n.start, e.time.precision)}`}
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
              <span className={s.treeTitle} title={e.title}><Highlight text={e.title} terms={ctx.searchTerms} /></span>
              <span className={s.treeTime}>
                {hasKids && folded.has(n.id) ? `+${descendants(n).length} · ` : hasKids ? `${descendants(n).length} · ` : ""}
                {n.start === null ? "" : ctx.adapter.short(n.start, e.time.precision)}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
