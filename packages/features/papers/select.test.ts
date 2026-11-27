import { htmlResponse, jsonResponse, stubFetch } from '@upvoted/testing/fetch';
import { describe, expect, it, vi } from 'vitest';
import { selectPapers } from './select';

const NOW = new Date('2026-11-27T09:00:00.000Z');

interface Hit {
  title: string;
  arxivId?: string;
  doi?: string;
  published?: string;
  cited?: number;
  abstract?: string;
}

function scholarPage(hits: Hit[]): string {
  return `<html><body>${hits
    .map((hit) => {
      const href = hit.arxivId
        ? `https://arxiv.org/abs/${hit.arxivId}`
        : hit.doi
          ? `https://doi.org/${hit.doi}`
          : 'https://example.com/paper';
      return `<div class="gs_r" data-cid="${hit.arxivId ?? hit.doi ?? 'cluster'}">
        <div class="gs_ri">
          <h3 class="gs_rt"><a href="${href}">${hit.title}</a></h3>
          <div class="gs_a">Ada Lovelace - arXiv, ${hit.published?.slice(0, 4) ?? '2026'} - arxiv.org</div>
          <div class="gs_rs">${hit.abstract ?? hit.title}</div>
          ${hit.cited ? `<a>Cited by ${hit.cited}</a>` : ''}
        </div>
      </div>`;
    })
    .join('')}</body></html>`;
}

function openAlex(hits: Hit[]) {
  return {
    results: hits.map((hit, index) => ({
      id: `https://openalex.org/W${index}`,
      title: hit.title,
      publication_date: hit.published ?? null,
      publication_year: hit.published ? Number(hit.published.slice(0, 4)) : 2026,
      cited_by_count: hit.cited ?? 0,
      authorships: [{ author: { display_name: 'Ada Lovelace' } }],
      ids: {
        openalex: `https://openalex.org/W${index}`,
        arxiv: hit.arxivId ?? null,
        doi: hit.doi ? `https://doi.org/${hit.doi}` : null,
      },
    })),
  };
}

function arxivFeed(hits: Hit[]): string {
  return `<feed>${hits
    .map(
      (hit) => `<entry>
        <id>http://arxiv.org/abs/${hit.arxivId}v1</id>
        <title>${hit.title}</title>
        <summary>${hit.abstract ?? hit.title}</summary>
        <published>${hit.published ?? '2026-11-01'}T00:00:00Z</published>
        <author><name>Ada Lovelace</name></author>
      </entry>`,
    )
    .join('')}</feed>`;
}

function stubSources({
  scholar = '<html></html>',
  openalex = { results: [] as unknown[] },
  semantic = { data: [] as unknown[] },
  arxiv = '<feed></feed>',
}: {
  scholar?: string;
  openalex?: unknown;
  semantic?: unknown;
  arxiv?: string;
} = {}) {
  return stubFetch((url) => {
    if (url.hostname === 'scholar.google.com') return htmlResponse(scholar);
    if (url.hostname === 'api.openalex.org') return jsonResponse(openalex);
    if (url.hostname === 'api.semanticscholar.org') return jsonResponse(semantic);
    if (url.hostname === 'export.arxiv.org') {
      return new Response(arxiv, { headers: { 'content-type': 'application/atom+xml' } });
    }
    return undefined;
  });
}

const phones: Hit = {
  title: 'A small language model for phones',
  arxivId: '2511.20001',
  published: '2026-11-26',
};
const watches: Hit = {
  title: 'A small language model for watches',
  arxivId: '2511.20002',
  published: '2026-11-26',
  abstract:
    'We train a small language model that tells the time, and we measure it against a larger one on the same tasks over a full paragraph of results.',
};
const survey: Hit = {
  title: 'A survey of small language models',
  published: '2026-06-01',
};

describe('selectPapers', () => {
  it('puts a new Scholar paper ahead of a new preprint, and both ahead of standing work', async () => {
    stubSources({
      scholar: scholarPage([watches]),
      arxiv: arxivFeed([phones, watches]),
      openalex: openAlex([survey]),
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.scholar).toBe('ok');
    expect(picked.quiet).toBe(false);
    expect(picked.papers.map((paper) => paper.id)).toEqual([
      'arxiv:2511.20002',
      'arxiv:2511.20001',
      'openalex:W0',
    ]);
    expect(picked.papers.map((paper) => paper.status)).toEqual(['new', 'new', 'standing']);
    const merged = picked.papers[0];
    expect(merged?.source).toBe('scholar');
    expect(merged?.sources.sort()).toEqual(['arxiv', 'scholar']);
    expect(merged?.published).toBe('2026-11-26');
    expect(merged?.abstract).toBe(watches.abstract);
    expect(merged?.url).toBe('https://arxiv.org/abs/2511.20002');
  });

  it('does not let a famous standing paper jump ahead of a new one', async () => {
    const famous: Hit = {
      title: 'Small language models that everyone cites',
      arxivId: '2601.00001',
      published: '2026-01-15',
      cited: 5000,
    };
    stubSources({
      scholar: scholarPage([famous]),
      openalex: openAlex([famous, survey]),
      arxiv: arxivFeed([phones]),
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.papers[0]?.id).toBe('arxiv:2511.20001');
    expect(picked.papers[0]?.status).toBe('new');
    expect(picked.papers.find((paper) => paper.id === 'arxiv:2601.00001')?.status).toBe('standing');
  });

  it('returns no papers, and does not publish, when nothing in the fresh window is new', async () => {
    const older: Hit[] = [
      survey,
      {
        title: 'Tiny language models for sensors',
        published: '2026-05-01',
        doi: '10.1000/sensors',
      },
      {
        title: 'Compact language models for radios',
        published: '2026-04-01',
        doi: '10.1000/radios',
      },
    ];
    stubSources({ openalex: openAlex(older) });

    const picked = await selectPapers(NOW, []);

    expect(picked.quiet).toBe(true);
    expect(picked.scholar).toBe('ok');
    expect(picked.papers).toEqual([]);
  });

  it('counts a paper from 45 days ago as new, and one day older as standing', async () => {
    stubSources({
      openalex: openAlex([
        {
          title: 'A small language model, just inside the window',
          published: '2026-10-13',
          doi: '10.1000/inside',
        },
        {
          title: 'A small language model, just outside the window',
          published: '2026-10-12',
          doi: '10.1000/outside',
        },
        survey,
      ]),
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.papers[0]).toMatchObject({ id: 'doi:10.1000/inside', status: 'new' });
    expect(picked.papers.find((paper) => paper.id === 'doi:10.1000/outside')?.status).toBe(
      'standing',
    );
    expect(picked.quiet).toBe(false);
  });

  it('treats an arXiv id from the current month as new when no index has a day', async () => {
    const preprint: Hit = {
      title: 'A small language model submitted this month',
      arxivId: '2611.30001',
    };
    stubSources({
      scholar: scholarPage([preprint]),
      openalex: openAlex([
        survey,
        { ...survey, title: 'Edge language models', doi: '10.1000/edge', published: '2026-03-01' },
      ]),
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.papers[0]).toMatchObject({
      id: 'arxiv:2611.30001',
      status: 'new',
      source: 'scholar',
      published: null,
    });
    expect(picked.quiet).toBe(false);
  });

  it('fills the episode from the other indexes when Google Scholar blocks the request', async () => {
    stubSources({
      scholar: '<html><body>unusual traffic from your computer network</body></html>',
      openalex: openAlex([
        { ...phones, published: '2026-11-26' },
        { ...watches, published: '2026-11-20' },
        survey,
      ]),
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.scholar).toBe('unavailable');
    expect(picked.quiet).toBe(false);
    expect(picked.papers.every((paper) => paper.source === 'openalex')).toBe(true);
  });

  it('skips papers already covered, papers that are not about small models, and papers dated after the cutoff', async () => {
    stubSources({
      openalex: openAlex([
        phones,
        watches,
        survey,
        { title: 'On-device language models', published: '2026-08-01', doi: '10.1000/ondevice' },
        { title: 'Attention Is All You Need', published: '2026-11-26', doi: '10.1000/transformer' },
        {
          title: 'A small language model from tomorrow',
          published: '2026-11-28',
          doi: '10.1000/tomorrow',
        },
      ]),
    });

    const picked = await selectPapers(NOW, ['arxiv:2511.20002']);

    const ids = picked.papers.map((paper) => paper.id);
    expect(ids).not.toContain('arxiv:2511.20002');
    expect(ids).not.toContain('doi:10.1000/transformer');
    expect(ids).not.toContain('doi:10.1000/tomorrow');
    expect(ids).toContain('arxiv:2511.20001');
  });

  it('keeps going when one index fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch((url) => {
      if (url.hostname === 'api.semanticscholar.org') return new Response('no', { status: 500 });
      if (url.hostname === 'api.openalex.org') {
        return jsonResponse(openAlex([phones, watches, survey]));
      }
      if (url.hostname === 'scholar.google.com') return htmlResponse('<html></html>');
      if (url.hostname === 'export.arxiv.org') return new Response('<feed></feed>');
      return undefined;
    });

    const picked = await selectPapers(NOW, []);

    expect(picked.papers).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
  });

  it('throws when every source fails, instead of calling the day quiet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(() => new Response('no', { status: 500 }));

    await expect(selectPapers(NOW, [])).rejects.toThrow('Every source failed');
  });

  it('throws when the lookback does not hold three relevant papers', async () => {
    stubSources({ openalex: openAlex([phones, watches]) });

    await expect(selectPapers(NOW, [])).rejects.toThrow('Found only 2 of 3');
  });
});
