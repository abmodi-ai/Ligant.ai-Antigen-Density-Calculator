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
import { APP_VERSION, RELEASE_YEAR, SITE_URL } from '../../lib/site'
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-prose">
          <p>
            Ligant Bench Tools are free and open source under Apache 2.0, for research and
            educational use. They run entirely in your browser: no data is transmitted.
          </p>
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
        <span className="eyebrow">How to cite</span>
        {/*
          One line, in the order a reference manager expects, so it can be
          copied without being rearranged. No DOI yet: one is minted with the
          archived release, and a placeholder that looks like an identifier is
          worse than an absent one.
        */}
        <p>
          Modi, A.B. ({RELEASE_YEAR}). <cite>Antigen Density Calculator</cite> ({APP_VERSION})
          [Computer software]. Ligant AI Incorporated. {SITE_URL.replace('https://', '')}
        </p>
      </div>

      <p className="footer-licence">
        Licensed under the Apache License, Version 2.0. You may obtain a copy of the License in the{' '}
        <a href="/LICENSE">
          <code>LICENSE</code>
        </a>{' '}
        file distributed with this software. Unless required by applicable law
        or agreed to in writing, software distributed under the License is distributed on an "AS
        IS" basis, without warranties or conditions of any kind, either express or implied.{' '}
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>
      </p>
    </footer>
  )
}
