/**
 * Where the suite lives, and what is in it.
 *
 * Single source of truth for both. The navigation, the sitemap, the canonical
 * links and the social metadata are all derived from this, so adding a tool
 * cannot leave the sitemap or the tool switcher behind. Plain data with no
 * browser dependency, because the build imports it too.
 */

export const SITE_URL = 'https://benchtools.ligant.ai'

/**
 * Where the source actually is.
 *
 * The footer asserted Apache 2.0 and pointed at a LICENSE file "distributed
 * with this software" without saying where that software could be found. A
 * licence assertion a reader cannot check is not verifiable, which puts it in
 * the same category as any other unbacked claim on the page. It lives here so
 * the footer and the README cannot drift apart.
 */
export const REPO_URL = 'https://github.com/abmodi-ai/Ligant.ai-Antigen-Density-Calculator'

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
] as const

export type ToolId = (typeof TOOLS)[number]['id']

/** Absolute URL for a path within the site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
