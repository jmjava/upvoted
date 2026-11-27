import { fetchWithRetry, HttpError } from '@upvoted/lib/http';
import { z } from 'zod';
import type { PaperCandidate } from './candidate';
import { doiFromUrl } from './ids';

/** Semantic Scholar is a second academic graph: dates, abstracts and citation counts. */

const MAILTO = 'research@upvoted.dev';

const PaperSchema = z.object({
  paperId: z.string(),
  title: z.string().nullish(),
  abstract: z.string().nullish(),
  year: z.number().nullish(),
  publicationDate: z.string().nullish(),
  citationCount: z.number().nullish(),
  venue: z.string().nullish(),
  authors: z.array(z.object({ name: z.string().nullish() })).nullish(),
  externalIds: z
    .object({ ArXiv: z.string().nullish(), DOI: z.string().nullish() })
    .passthrough()
    .nullish(),
  url: z.string().nullish(),
  openAccessPdf: z.object({ url: z.string().nullish() }).nullish(),
});

const SearchSchema = z.object({ data: z.array(z.unknown()) });

export function semanticScholarSearchUrl(query: string, fromYear: number, toYear: number): string {
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', '25');
  url.searchParams.set('year', `${fromYear}-${toYear}`);
  url.searchParams.set(
    'fields',
    'paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,citationCount,publicationDate,venue',
  );
  return url.href;
}

export async function searchSemanticScholar(
  query: string,
  fromYear: number,
  toYear: number,
): Promise<PaperCandidate[]> {
  const url = semanticScholarSearchUrl(query, fromYear, toYear);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': `Upvoted/1.0 (mailto:${MAILTO})`,
  };
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (key) headers['x-api-key'] = key;
  const response = await fetchWithRetry(url, { headers }, { timeoutMs: 15_000, retries: 2 });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(response.status, url);
  }
  return parseSemanticScholar(await response.json());
}

export function parseSemanticScholar(body: unknown): PaperCandidate[] {
  const { data } = SearchSchema.parse(body);
  return data.flatMap((paper) => {
    const parsed = PaperSchema.safeParse(paper);
    if (!parsed.success || !parsed.data.title) return [];
    return [toCandidate(parsed.data)];
  });
}

function toCandidate(paper: z.infer<typeof PaperSchema>): PaperCandidate {
  const arxivId = paper.externalIds?.ArXiv?.replace(/v\d+$/, '') || null;
  const doi = paper.externalIds?.DOI
    ? doiFromUrl(`https://doi.org/${paper.externalIds.DOI}`)
    : null;
  const published = paper.publicationDate?.slice(0, 10) ?? null;
  return {
    title: paper.title ?? '',
    authors: (paper.authors ?? []).flatMap((author) => (author.name ? [author.name] : [])),
    year: paper.year ?? (published ? Number(published.slice(0, 4)) : null),
    published: published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : null,
    url: arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : (paper.url ?? null),
    pdfUrl: paper.openAccessPdf?.url ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
    scholarUrl: null,
    venue: paper.venue || null,
    abstract: paper.abstract ?? null,
    citedBy: paper.citationCount ?? null,
    source: 'semanticscholar',
    arxivId: arxivId && /^\d{4}\.\d{4,5}$/.test(arxivId) ? arxivId : null,
    doi,
    openAlexId: null,
    s2Id: paper.paperId,
    scholarCluster: null,
  };
}
