import { keys, putJson } from '@upvoted/lib/storage';
import { htmlResponse, stubFetch } from '@upvoted/testing/fetch';
import type { PaperRef, PaperSet } from '@upvoted/types';
import { describe, expect, it } from 'vitest';
import { getPaper, lookupPapers } from './read';

const date = '2026-11-27';

function paper(id: string, overrides: Partial<PaperRef> = {}): PaperRef {
  return {
    id,
    title: `Paper ${id}`,
    authors: ['Ada Lovelace', 'Alan Turing'],
    year: 2026,
    published: '2026-11-01',
    url: id.startsWith('arxiv:')
      ? `https://arxiv.org/abs/${id.slice(6)}`
      : `https://doi.org/${id.slice(4)}`,
    pdfUrl: null,
    scholarUrl: 'https://scholar.google.com/scholar?cluster=1',
    venue: 'arXiv',
    abstract: 'We train a small language model.',
    citedBy: 3,
    source: 'scholar',
    sources: ['scholar'],
    status: 'standing',
    ...overrides,
  };
}

async function save(papers: PaperRef[], quiet = true): Promise<void> {
  const set: PaperSet = { date, quiet, scholar: 'ok', papers };
  await putJson(keys.papers(date), set);
}

describe('lookupPapers', () => {
  it('returns show-note records in the requested order', async () => {
    await save([paper('arxiv:2511.00002'), paper('arxiv:2511.00001')]);

    const stories = await lookupPapers(date, ['arxiv:2511.00001', 'arxiv:2511.00002']);

    expect(stories.map((story) => story.id)).toEqual(['arxiv:2511.00001', 'arxiv:2511.00002']);
    expect(stories[0]).toMatchObject({
      authors: 'Ada Lovelace, Alan Turing',
      url: 'https://arxiv.org/abs/2511.00001',
      scholarUrl: 'https://scholar.google.com/scholar?cluster=1',
      status: 'standing',
    });
  });

  it('throws when an id was not selected, and saves nothing the caller can publish', async () => {
    await save([paper('arxiv:2511.00001')]);
    await expect(lookupPapers(date, ['doi:10.1000/missing'])).rejects.toThrow(
      'not in the 2026-11-27 selection',
    );
  });
});

describe('getPaper', () => {
  it('returns the abstract and the HTML of an arXiv paper', async () => {
    await save([paper('arxiv:2511.00001', { status: 'new' })]);
    const fetch = stubFetch(() =>
      htmlResponse(
        `<html><body><article><h1>Paper</h1><p>${'word '.repeat(80)}</p></article></body></html>`,
      ),
    );

    const brief = await getPaper(date, 'arxiv:2511.00001');

    expect(brief.abstract).toBe('We train a small language model.');
    expect(brief.text).toContain('word');
    expect(brief.textError).toBeNull();
    expect(brief.status).toBe('new');
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://arxiv.org/html/2511.00001');
  });

  it('keeps the abstract when the page cannot be read', async () => {
    await save([
      paper('doi:10.1000/xyz', { url: 'https://example.com/paper', status: 'standing' }),
    ]);
    stubFetch(() => htmlResponse('<html><body>nope</body></html>'));

    const brief = await getPaper(date, 'doi:10.1000/xyz');

    expect(brief.text).toBeNull();
    expect(brief.textError).toBeTruthy();
    expect(brief.abstract).toContain('small language model');
  });

  it('does not fetch when there is no page, and still returns the abstract', async () => {
    await save([
      paper('scholar:1', {
        url: null,
        pdfUrl: 'https://example.com/paper.pdf',
        abstract: 'Abstract only.',
      }),
    ]);
    const fetch = stubFetch(() => htmlResponse('<html></html>'));

    const brief = await getPaper(date, 'scholar:1');

    expect(brief.text).toBeNull();
    expect(brief.textError).toBeNull();
    expect(brief.abstract).toBe('Abstract only.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
