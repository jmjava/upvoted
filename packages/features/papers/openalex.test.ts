import { describe, expect, it } from 'vitest';
import { abstractFromInverted, parseOpenAlex } from './openalex';

describe('abstractFromInverted', () => {
  it('rebuilds the abstract in word order', () => {
    expect(
      abstractFromInverted({ We: [0], train: [1], a: [2], small: [3], language: [4], model: [5] }),
    ).toBe('We train a small language model');
  });

  it('returns null for an empty index', () => {
    expect(abstractFromInverted(null)).toBeNull();
    expect(abstractFromInverted({})).toBeNull();
  });
});

describe('parseOpenAlex', () => {
  it('keeps a work with a day, a DOI and an arXiv id, and skips a work with no title', () => {
    const papers = parseOpenAlex({
      results: [
        {
          id: 'https://openalex.org/W1',
          title: 'Small language models on device',
          publication_year: 2026,
          publication_date: '2026-11-20',
          cited_by_count: 4,
          authorships: [{ author: { display_name: 'Ada Lovelace' } }],
          ids: {
            openalex: 'https://openalex.org/W1',
            doi: 'https://doi.org/10.1000/xyz',
            arxiv: '2511.01234',
          },
          primary_location: { source: { display_name: 'arXiv' } },
          open_access: { oa_url: 'https://arxiv.org/pdf/2511.01234' },
          abstract_inverted_index: { Hello: [0] },
        },
        { id: 'https://openalex.org/W2' },
      ],
    });

    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: 'Small language models on device',
      published: '2026-11-20',
      year: 2026,
      arxivId: '2511.01234',
      doi: '10.1000/xyz',
      openAlexId: 'W1',
      url: 'https://arxiv.org/abs/2511.01234',
      pdfUrl: 'https://arxiv.org/pdf/2511.01234',
      citedBy: 4,
      authors: ['Ada Lovelace'],
      source: 'openalex',
      abstract: 'Hello',
    });
  });
});
