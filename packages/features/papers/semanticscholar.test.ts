import { describe, expect, it } from 'vitest';
import { parseSemanticScholar } from './semanticscholar';

describe('parseSemanticScholar', () => {
  it('reads the arXiv id, the DOI, the day and the citation count', () => {
    const papers = parseSemanticScholar({
      data: [
        {
          paperId: 'abc',
          title: 'Small language models',
          abstract: 'We train one.',
          year: 2026,
          publicationDate: '2026-11-02',
          citationCount: 8,
          venue: 'arXiv',
          authors: [{ name: 'Ada Lovelace' }],
          externalIds: { ArXiv: '2511.01234v1', DOI: '10.1000/xyz' },
          openAccessPdf: { url: 'https://arxiv.org/pdf/2511.01234' },
        },
        { paperId: 'missing-title' },
      ],
    });

    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      arxivId: '2511.01234',
      doi: '10.1000/xyz',
      published: '2026-11-02',
      citedBy: 8,
      s2Id: 'abc',
      url: 'https://arxiv.org/abs/2511.01234',
      authors: ['Ada Lovelace'],
      source: 'semanticscholar',
    });
  });
});
