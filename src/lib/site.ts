/**
 * Where the suite lives, and what is in it.
 *
 * Single source of truth for both. The navigation, the sitemap, the canonical
 * links and the social metadata are all derived from this, so adding a tool
 * cannot leave the sitemap or the tool switcher behind. Plain data with no
 * browser dependency, because the build imports it too.
 */

export const SITE_URL = 'https://benchtools.ligant.ai'

export interface Tool {
  id: string
  /** Label in the tool switcher. */
  name: string
  /** Path from the site root, always with a trailing slash except the root. */
  path: string
  /** Relative priority in the sitemap. */
  priority: number
}

export const TOOLS: readonly Tool[] = [
  { id: 'antigen-density', name: 'Antigen density', path: '/', priority: 1.0 },
  { id: 'cytotoxicity', name: 'Cytotoxicity', path: '/cytotoxicity/', priority: 0.9 },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

/** Absolute URL for a path within the site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
