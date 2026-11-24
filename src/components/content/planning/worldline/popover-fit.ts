"use client";
import { useLayoutEffect, useRef } from "react";

/** docs/599 code review r4 P2-2: a picker opens left-aligned under its trigger; when that runs past the right edge of the
 * view that clips it (the event-table scroller or the timeline lane), it moves left by the overflow, never past the
 * view's left edge. Measured once on open, before paint. */
export function useFitPopover<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current, view = el?.closest<HTMLElement>("[data-table-scroller],[data-timeline-lane]");
    if (!el || !view) return;
    const r = el.getBoundingClientRect(), v = view.getBoundingClientRect();
    const over = r.right - (v.right - 4);
    if (over > 0) el.style.translate = `${-Math.min(over, Math.max(0, r.left - (v.left + 4)))}px 0`;
  }, []);
  return ref;
}
