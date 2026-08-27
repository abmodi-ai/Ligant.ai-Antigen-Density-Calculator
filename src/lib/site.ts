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
 * The released version, cited on the page and stamped into every export.
 *
 * Beside the origin rather than in the component that happened to need it
 * first: a citation and an exported CSV that disagree about which version
 * produced a figure are worse than either alone.
 */
export const APP_VERSION = 'v0.1.0'

/** The year the citation carries. Fixed, not derived from the clock, so the
 *  page renders the same for every reader and for every build. */
export const RELEASE_YEAR = 2026

/**
 * Where the source is, once there is somewhere to send a reader.
 *
 * The footer asserts Apache 2.0 and points at a LICENSE file "distributed with
 * this software" without saying where that software can be found. A licence
 * assertion a reader cannot check is not verifiable, which is what a reviewer
 * called blocking, and it stays open until this is set.
 *
 * Null rather than the development repository, which is private and staying
 * private: a link nobody can open is worse than no link, because it converts an
 * unbacked claim into a broken one. Typed with the absence so a consumer has to
 * handle it rather than rendering an empty href, and asserted in
 * scripts/check-network.mjs in both states: with no URL the footer must link
 * nothing, and with one it must link it.
 */
export const REPO_URL: string | null = null

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
