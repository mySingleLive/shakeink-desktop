/** docs/581 §0 (F2): render counting for the B-layer render-count cases. `<Profiler>` reports every commit inside its
 * subtree, so it cannot tell PlanningWorkspace's own renders from a child's; components call this probe instead.
 * It is compiled out of production builds (NODE_ENV), and only the profiling test bundle installs a listener. */
export function renderProbe(id: string) {
  if (process.env.NODE_ENV !== "production") (globalThis as { __renderProbe?: (id: string) => void }).__renderProbe?.(id);
}
