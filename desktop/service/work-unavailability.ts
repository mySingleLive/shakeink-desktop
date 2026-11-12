import { ContentError } from '../../src/lib/content-errors'
import type { UnavailableWorkReason } from '../shared/work-list'

export type WorkFaultKind = 'in-use' | 'missing' | 'changed' | 'damaged'
const WORK_FAULT = Symbol('shakeink.workFault')

/** Tags a known failure without changing its type, message or errno code. */
export function markWorkFault<T>(error: T, kind: WorkFaultKind): T {
  if (error instanceof Error && !Object.prototype.hasOwnProperty.call(error, WORK_FAULT)) Object.defineProperty(error, WORK_FAULT, { value: kind, enumerable: false })
  return error
}

/** Only structured markers count; raw messages never earn a specific reason. */
export function classifyUnavailableWork(error: unknown): UnavailableWorkReason {
  if (error instanceof ContentError) return error.code === 'WORK_LEASE_STALE' ? 'stale-lease' : 'unavailable'
  if (error instanceof Error) {
    const kind = (error as unknown as Record<symbol, unknown>)[WORK_FAULT]
    if (kind === 'in-use' || kind === 'missing' || kind === 'changed' || kind === 'damaged') return kind
  }
  return 'unavailable'
}
