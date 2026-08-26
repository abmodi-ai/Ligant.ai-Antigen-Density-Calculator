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
 * fires no request, so the privacy guarantee is untouched. The repository link
 * is the same: an anchor a reader may choose to follow, not a resource this
 * page loads.
 */
import { REPO_URL } from '../../lib/site'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-prose">
          <p>
            Ligant Bench Tools are free and open source under Apache 2.0, for research and
            educational use. The source is at{' '}
            <a href={REPO_URL} rel="noopener noreferrer">
              {REPO_URL.replace('https://', '')}
            </a>
            , so every figure on this page can be traced to the code that produced it. They run
            entirely in your browser: no data is transmitted.
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

      <p className="footer-licence">
        Licensed under the Apache License, Version 2.0. You may obtain a copy of the License in the{' '}
        <code>LICENSE</code> file at the repository above. Unless required by applicable law
        or agreed to in writing, software distributed under the License is distributed on an "AS
        IS" basis, without warranties or conditions of any kind, either express or implied.{' '}
        <strong>Research use only. Not for clinical or diagnostic decision-making.</strong>
      </p>
    </footer>
  )
}
