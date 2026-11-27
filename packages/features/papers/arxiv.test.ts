import { describe, expect, it } from 'vitest';
import { parseArxivAtom } from './arxiv';

const entry = `
<entry>
  <id>http://arxiv.org/abs/2511.01234v2</id>
  <title>  Small language   models </title>
  <summary>We train a &amp; small model.</summary>
  <published>2026-11-20T00:00:00Z</published>
  <author><name>Ada Lovelace</name></author>
  <author><name>Alan Turing</name></author>
  <link title="pdf" href="https://arxiv.org/pdf/2511.01234v2" rel="related" type="application/pdf"/>
  <arxiv:primary_category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
</entry>`;

describe('parseArxivAtom', () => {
  it('reads the id without its version, the day, the authors and the abstract', () => {
    const papers = parseArxivAtom(`<feed>${entry}</feed>`);

    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: 'Small language models',
      arxivId: '2511.01234',
      published: '2026-11-20',
      authors: ['Ada Lovelace', 'Alan Turing'],
      url: 'https://arxiv.org/abs/2511.01234',
      pdfUrl: 'https://arxiv.org/pdf/2511.01234v2',
      venue: 'arXiv cs.CL',
      abstract: 'We train a & small model.',
      source: 'arxiv',
    });
  });

  it('skips an entry with no arXiv id', () => {
    expect(parseArxivAtom('<feed><entry><title>No id</title></entry></feed>')).toEqual([]);
  });
});
