/** docs/599 §12.5: an edit draft compared with the event it started from. Key order does not matter (a draft object may
 * be rebuilt field by field), array order does (people, key changes), and an `undefined` value equals a missing key. */
export function sameEvent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameEvent(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    for (const k of keys) if (!sameEvent(ra[k], rb[k])) return false;
    return true;
  }
  return false;
}
