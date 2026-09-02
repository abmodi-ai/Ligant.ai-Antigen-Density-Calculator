/**
 * What this tool is, who publishes it, and under what terms.
 *
 * The page has always said the computation stays in the browser. It has never
 * said who is behind it, what it costs, or what may legally be done with it,
 * which are the three things a reader deciding whether to use a measurement
 * tool in their own work will want.
 *
 * The address and the email are plain text and a mailto link. Nothing here
 * contacts anything: a mailto is handled by the reader's own mail client and
 * fires no request, so the privacy guarantee is untouched.
 *
 * The citation is here rather than in the method section because it is the
 * thing a reader needs at the moment they decide to use a figure from this
 * tool in their own work, and that decision is made at the bottom of the page.
 */
import { useState } from 'react'

import { APP_VERSION, CITATION_DOI, RELEASE_YEAR, REPO_URL, SITE_URL } from '../../lib/site'

/**
 * The citation, in three pieces, so that what is shown and what is copied
 * cannot differ.
 *
 * They are assembled one way for the page, which marks the title up as a title,
 * and concatenated the other way for the clipboard. Written as two literals they
 * would drift the first time the version or the DOI moved, and a copied citation
 * that disagrees with the displayed one is an error that travels into someone
 * else's reference list before anyone notices.
 */
const CITATION_TITLE = 'Antigen Density Calculator'
const CITATION_LEAD = `Modi, A.B. (${RELEASE_YEAR}). `
const CITATION_TAIL =
  ` (${APP_VERSION}) [Computer software]. Ligant AI Incorporated. ` +
  `${SITE_URL.replace('https://', '')}. doi:${CITATION_DOI}`
const CITATION_TEXT = CITATION_LEAD + CITATION_TITLE + CITATION_TAIL

export function SiteFooter() {
  const [copied, setCopied] = useState(false)

  // Writing to the clipboard is a local act. It contacts nothing, which is why
  // it is allowed to exist on a page that promises to contact nothing.
  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(CITATION_TEXT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A browser may refuse clipboard access and there is nothing useful to
      // say about that. The citation is on the page and selectable regardless,
      // so silence is better than an error the reader cannot act on.
    }
  }

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-prose">
          <p>
            Ligant Bench Tools are free and open source under Apache 2.0, for research and
            educational use. They run entirely in your browser: no data is transmitted.
          </p>
          {/*
            The claim above and the evidence for it, in adjacent sentences. An
            Apache 2.0 assertion a reader cannot check is worth what any
            unverifiable claim is worth, and until this repository existed the
            page made the claim and offered nowhere to go.

            "Read, download or run it yourself" rather than "view the source",
            because the useful thing about this particular tool being open is
            not that the code can be admired: it is that a reader who does not
            want to trust a website can check the arithmetic against what they
            were shown, or run the whole thing from their own disk.
          */}
          {REPO_URL && (
            <p>
              Every figure on this page comes from code you can read, download or run yourself, at{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                {REPO_URL.replace('https://', '')}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
              . Clone it and <code>npm run dev</code> for a local copy, or{' '}
              <code>npm run build:single</code> for one self-contained HTML file that works from a
              disk with no server and no network.
            </p>
          )}
          <p>
            These tools are standalone calculators. Ligant's enterprise platform adds reference
            databases, connected agentic workflows, on-premise language models, and full GxP
            validation. If your lab needs that, please email us{' '}
            <a href="mailto:hello@ligant.ai">hello@ligant.ai</a>.
          </p>
        </div>

        <address className="footer-address">
          <span className="eyebrow">Ligant AI Incorporated</span>
          3675 Market Street
          <br />
          Suite 200
          <br />
          Philadelphia PA 19104
          <br />
          <a href="mailto:hello@ligant.ai">hello@ligant.ai</a>
        </address>
      </div>

      <div className="footer-citation">
        {/*
          One line, in the order a reference manager expects, so it can be
          copied without being rearranged. The concept DOI is printed rather
          than the version DOI, so that following it reaches the newest archived
          release rather than this one for ever, and as a bare identifier rather
          than a doi.org link, because the bundle embeds no origin it does not
          have to.
        */}
        <div className="footer-citation-head">
          <span className="eyebrow">How to cite</span>
          <button type="button" onClick={copyCitation} aria-live="polite">
            {copied ? 'Copied' : 'Copy citation'}
          </button>
        </div>
        <p>
          {CITATION_LEAD}
          <cite>{CITATION_TITLE}</cite>
          {CITATION_TAIL}
        </p>
      </div>

      <p className="footer-licence">
        Licensed under the Apache License, Version 2.0. You may obtain a copy of the License in the{' '}
        <a href="/LICENSE" target="_blank" rel="noopener">
          <code>LICENSE</code>
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>{' '}
        file served with this page and distributed with the source. Unless required by applicable law
        or agreed to in writing, software distributed under the License is distributed on an "AS
        IS" basis, without warranties or conditions of any kind, either express or implied.{' '}
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>
      </p>
    </footer>
  )
}
