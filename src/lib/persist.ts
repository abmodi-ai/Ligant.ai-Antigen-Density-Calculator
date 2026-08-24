/**
 * Rehydrating persisted settings across a release that adds options.
 *
 * State written by an earlier version of a tool has no key for an option added
 * since. Restoring that object directly leaves the new key `undefined`, which is
 * not a value any control or guard is written to handle: a `<select>` bound to
 * `undefined` renders uncontrolled and reports whatever its first option says,
 * so the interface displays a legitimate choice while the logic reads nothing.
 * The result is a tool that contradicts itself for returning users only, and
 * never for anyone testing it with fresh state.
 *
 * The merge below is deliberately strict rather than a spread. A spread trusts
 * the stored payload; this trusts the defaults and accepts a stored value only
 * where it is present and of the type the default declares. That covers the
 * missing-key case that motivated it, and equally covers a payload corrupted by
 * hand, by another tab, or by a future schema change nobody remembered to
 * migrate.
 */

/**
 * Settings restored from storage, backfilled from `defaults`.
 *
 * Every key comes from `defaults`. A stored key is used only when it is present
 * and matches the default's type; anything else, including a key the stored
 * payload has and the defaults do not, is discarded.
 */
export function restoreOptions<T extends object>(stored: unknown, defaults: T): T {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { ...defaults }
  }

  const source = stored as Record<string, unknown>
  const fallback = defaults as Record<string, unknown>
  const restored: Record<string, unknown> = { ...fallback }

  for (const key of Object.keys(fallback)) {
    const value = source[key]
    if (value === undefined || value === null) continue
    if (typeof value !== typeof fallback[key]) continue
    // A persisted NaN or Infinity would propagate into every derived figure.
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    restored[key] = value
  }

  return restored as T
}
