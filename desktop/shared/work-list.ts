export const UNAVAILABLE_WORK_REASONS = ['stale-lease', 'in-use', 'missing', 'changed', 'damaged', 'unavailable'] as const
export type UnavailableWorkReason = typeof UNAVAILABLE_WORK_REASONS[number]

/** Indexed works that could not be read. Never include filesystem/error details. */
export interface UnavailableWork {
  workId: string
  novelId: string
  title: string
  reason: UnavailableWorkReason
}

export function normalizeUnavailableReason(value: unknown): UnavailableWorkReason {
  return (UNAVAILABLE_WORK_REASONS as readonly unknown[]).includes(value) ? value as UnavailableWorkReason : 'unavailable'
}
