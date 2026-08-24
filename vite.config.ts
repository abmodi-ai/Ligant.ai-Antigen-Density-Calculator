import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { SITE_URL, TOOLS } from './src/lib/site'

/**
 * Derives everything that needs to know the site's origin from `src/lib/site.ts`.
 *
 * `robots.txt` and `sitemap.xml` used to be static files in `public/` with the
 * origin written into them by hand, which meant a new tool silently went
 * missing from the sitemap. They are generated from the tool registry instead,
 * and the HTML entry points carry a `%SITE_URL%` placeholder rather than a
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
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          '# Ligant Bench Tools. Free tools for cell and gene therapy research.',
          'User-agent: *',
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

// Multi-page build. The antigen density tool stays at the site root; each
// additional tool gets its own directory and its own bundle, so a visitor
// downloads only the tool they opened.
export default defineConfig({
  plugins: [react(), siteMetadata()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cytotoxicity: resolve(__dirname, 'cytotoxicity/index.html'),
      },
    },
  },
})
