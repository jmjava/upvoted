import { describe, expect, it } from 'vitest';
import { parseScholarHtml, scholarHitToCandidate } from './scholar';

const hit = (title: string, extra = '') => `
  <div class="gs_r gs_or gs_scl" data-cid="999">
    <div class="gs_ggs gs_fl"><a href="https://arxiv.org/pdf/2511.01234">[PDF]</a></div>
    <div class="gs_ri">
      <h3 class="gs_rt"><a href="https://arxiv.org/abs/2511.01234v2">${title}</a></h3>
      <div class="gs_a">Ada Lovelace, Alan Turing - arXiv, 2026 - arxiv.org</div>
      <div class="gs_rs">We train a small language model.</div>
      <div class="gs_fl"><a href="/scholar?cites=999">Cited by 1,234</a></div>
      ${extra}
    </div>
  </div>`;

describe('parseScholarHtml', () => {
  it('reads the title, the paper link, the pdf, the year and the citation count', () => {
    const page = parseScholarHtml(
      `<html><body>${hit('[PDF] Small language models on device')}</body></html>`,
    );

    expect(page.blocked).toBe(false);
    if (page.blocked) return;
    expect(page.hits).toEqual([
      {
        title: 'Small language models on device',
        url: 'https://arxiv.org/abs/2511.01234v2',
        pdfUrl: 'https://arxiv.org/pdf/2511.01234',
        authors: ['Ada Lovelace', 'Alan Turing'],
        year: 2026,
        venue: 'arXiv',
        snippet: 'We train a small language model.',
        citedBy: 1234,
        clusterId: '999',
      },
    ]);
    const first = page.hits[0];
    if (!first) throw new Error('expected a Scholar hit');
    expect(scholarHitToCandidate(first).arxivId).toBe('2511.01234');
  });

  it('drops a result with no title and ignores a Scholar-only link', () => {
    const html = `<html><body>
      <div class="gs_r"><h3 class="gs_rt"></h3></div>
      <div class="gs_r" data-cid="5">
        <h3 class="gs_rt"><a href="/scholar?q=related">Small language models</a></h3>
        <div class="gs_a">A Researcher - 2025</div>
      </div>
    </body></html>`;

    const page = parseScholarHtml(html);
    expect(page.blocked).toBe(false);
    if (page.blocked) return;
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]?.url).toBeNull();
    expect(page.hits[0]?.year).toBe(2025);
  });

  it('reports a captcha page as blocked', () => {
    const page = parseScholarHtml(
      '<html><body>Our systems have detected unusual traffic from your network.</body></html>',
    );
    expect(page).toEqual({ blocked: true });
  });
});
