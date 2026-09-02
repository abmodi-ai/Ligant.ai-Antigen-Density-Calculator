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
export const APP_VERSION = 'v0.1.1'

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
 * One public repository, which is both where the work is done and where a
 * reader is sent. This was null until there was somewhere real to send them,
 * because pointing at an address a reader cannot reach would have converted an
 * unbacked claim into a broken one.
 *
 * Typed with the absence still, because that is what makes the guard work:
 * scripts/check-network.mjs asserts the true thing in either state. With no URL
 * the footer must link nothing; with one, a footer claiming open source must
 * link it. scripts/check-privacy.mjs allows this exact value and nothing wider,
 * reading it from here rather than pattern-matching a host.
 *
 * Nothing on the page loads from it. It is an address a reader may choose to
 * follow, which is also why no check here can confirm it resolves: this tool
 * contacts no third party, and that includes to test its own links.
 */
export const REPO_URL: string | null = 'https://github.com/abmodi-ai/Ligant.ai-Antigen-Density-Calculator'

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
