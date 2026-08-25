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
  /**
   * Whether the tool is offered to a visitor who has not been sent to it.
   *
   * An unlisted tool is still built, still served at its path and still works.
   * It is absent from the switcher and from the sitemap, and its page asks not
   * to be indexed, so it is reachable by anyone holding the link and by nobody
   * else. That is the state for a tool that is finished enough to send to a
   * reviewer and not finished enough to launch.
   */
  listed: boolean
}

export const TOOLS: readonly Tool[] = [
  { id: 'antigen-density', name: 'Antigen density', path: '/', priority: 1.0, listed: true },
  // Unlisted for launch. The calculator works and its tests pass, but it has
  // had none of the external review the antigen density tool has had twice,
  // and the defects that review found were ones that put wrong numbers on the
  // screen rather than cosmetic ones. Relisting is this flag.
  { id: 'cytotoxicity', name: 'Cytotoxicity', path: '/cytotoxicity/', priority: 0.9, listed: false },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

/** Tools offered publicly: the switcher and the sitemap are built from these. */
export const LISTED_TOOLS: readonly Tool[] = TOOLS.filter((tool) => tool.listed)

/** Absolute URL for a path within the site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
