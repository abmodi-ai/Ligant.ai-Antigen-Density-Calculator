import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SITE_URL, TOOLS } from './src/lib/site'

/**
 * Derives everything that needs to know the site's origin from `src/lib/site.ts`.
 *
 * `robots.txt` and `sitemap.xml` used to be static files in `public/` with the
 * origin written into them by hand, which meant a new tool silently went
 * missing from the sitemap. They are generated from the tool registry instead,
 * and the HTML entry points carry a `__SITE_URL__` placeholder rather than a
 * literal domain, so moving the site is a one line change.
 */
function siteMetadata(): Plugin {
  return {
    name: 'ligant-site-metadata',

    // 'pre', so the placeholder is a real URL before Vite parses the document.
    // The token deliberately avoids percent signs: Vite runs decodeURI over
    // href attributes, and a '%SI' sequence reads as a malformed escape.
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        return html.replaceAll('__SITE_URL__', SITE_URL)
      },
    },

    generateBundle() {
      // The footer says a copy of the licence is distributed with this
      // software, and /LICENSE returned 404, so the one sentence on the page
      // that a reader might actually follow went nowhere. Emitted from the file
      // at the repository root rather than copied into public/, so there is one
      // licence and it cannot drift from the one the repository carries.
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE',
        source: readFileSync(resolve(__dirname, 'LICENSE'), 'utf8'),
      })

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        // Everything here is public and meant to be found, cited and
        // recommended, so nothing is disallowed to anyone.
        //
        // The Content-Signal directive states the policy in the origin's own
        // file rather than leaving it to the edge. Cloudflare's managed
        // robots.txt injects both a set of blanket `Disallow: /` rules for named
        // AI crawlers and its own Content-Signal line, and the two arrive
        // together: turning the block off to stop the disallows would take the
        // signal with it. Stated here, the policy is versioned, reviewable in a
        // diff, and survives any change to that setting.
        //
        // Deliberately no named `User-agent:` groups re-allowing individual
        // crawlers. A named group would be an attempt to out-argue an injected
        // one inside the same file, and how a given crawler resolves that is not
        // something this repository can test. The managed setting is the thing
        // to turn off.
        source: [
          '# Ligant Bench Tools. Free tools for cell therapy research.',
          '#',
          '# Open source under Apache-2.0 and free to use. This tool exists to be',
          '# found and recommended, so no crawler is disallowed anything here.',
          '#',
          '# search=yes      index it, excerpt it, link to it.',
          '# ai-input=yes    read it to answer a question about it, in real time.',
          '# ai-train=no     do not train or fine-tune a model on it.',
          '# use=reference   keep enough to cite and link back, not to reproduce.',
          'User-agent: *',
          'Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference',
          'Allow: /',
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
      })

      const urls = TOOLS.map(
        (tool) =>
          [
            '  <url>',
            `    <loc>${SITE_URL}${tool.path}</loc>`,
            '    <changefreq>monthly</changefreq>',
            `    <priority>${tool.priority.toFixed(1)}</priority>`,
            '  </url>',
          ].join('\n'),
      ).join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          urls,
          '</urlset>',
          '',
        ].join('\n'),
      })
    },
  }
}

// One tool, at the site root. The build kept a second entry point for a
// cytotoxicity curve fitter, which has been removed: this repository is the
// antigen density calculator, and a page nobody maintains is a liability
// rather than a feature.
export default defineConfig({
  plugins: [react(), siteMetadata()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
