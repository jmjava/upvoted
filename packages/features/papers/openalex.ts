import { fetchWithRetry, HttpError } from '@upvoted/lib/http';
import { z } from 'zod';
import type { PaperCandidate } from './candidate';
import { arxivIdFromUrl, doiFromUrl, openAlexKey } from './ids';

/** OpenAlex fills in dates, abstracts and open-access links Scholar doesn't give us. */

const MAILTO = 'research@upvoted.dev';

const WorkSchema = z.object({
  id: z.string(),
  doi: z.string().nullish(),
  title: z.string().nullish(),
  publication_year: z.number().nullish(),
  publication_date: z.string().nullish(),
  cited_by_count: z.number().nullish(),
  authorships: z
    .array(z.object({ author: z.object({ display_name: z.string().nullish() }).nullish() }))
    .nullish(),
  primary_location: z
    .object({
      landing_page_url: z.string().nullish(),
      pdf_url: z.string().nullish(),
      source: z.object({ display_name: z.string().nullish() }).nullish(),
    })
    .nullish(),
  open_access: z.object({ oa_url: z.string().nullish() }).nullish(),
  ids: z
    .object({
      openalex: z.string().nullish(),
      doi: z.string().nullish(),
      arxiv: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number())).nullish(),
});

const WorksSchema = z.object({ results: z.array(z.unknown()) });

export function openAlexSearchUrl(query: string, from: string, to: string): string {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', query);
  url.searchParams.set('filter', `from_publication_date:${from},to_publication_date:${to}`);
  url.searchParams.set('sort', 'relevance_score:desc');
  url.searchParams.set('per-page', '25');
  url.searchParams.set('mailto', MAILTO);
  url.searchParams.set(
    'select',
    [
      'id',
      'doi',
      'title',
      'publication_year',
      'publication_date',
      'cited_by_count',
      'authorships',
      'primary_location',
      'open_access',
      'ids',
      'abstract_inverted_index',
    ].join(','),
  );
  return url.href;
}

export async function searchOpenAlex(
  query: string,
  from: string,
  to: string,
): Promise<PaperCandidate[]> {
  const url = openAlexSearchUrl(query, from, to);
  const response = await fetchWithRetry(
    url,
    { headers: { accept: 'application/json', 'user-agent': `Upvoted/1.0 (mailto:${MAILTO})` } },
    { timeoutMs: 15_000, retries: 2 },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(response.status, url);
  }
  return parseOpenAlex(await response.json());
}

/** Works that don't match the schema are skipped; a response that isn't a result list throws. */
export function parseOpenAlex(body: unknown): PaperCandidate[] {
  const { results } = WorksSchema.parse(body);
  return results.flatMap((work) => {
    const parsed = WorkSchema.safeParse(work);
    if (!parsed.success || !parsed.data.title) return [];
    return [toCandidate(parsed.data)];
  });
}

/** Rebuilds an abstract from OpenAlex's word → positions map. */
export function abstractFromInverted(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  if (words.length === 0) return null;
  const text = words
    .map((word) => word ?? '')
    .join(' ')
    .replace(/ +/g, ' ')
    .trim();
  return text || null;
}

function toCandidate(work: z.infer<typeof WorkSchema>): PaperCandidate {
  const arxivId =
    arxivIdFromUrl(work.ids?.arxiv) ?? arxivIdFromUrl(work.primary_location?.landing_page_url);
  const doi = doiFromUrl(work.doi) ?? doiFromUrl(work.ids?.doi);
  const published = work.publication_date?.slice(0, 10) ?? null;
  return {
    title: work.title ?? '',
    authors: (work.authorships ?? []).flatMap((authorship) => {
      const name = authorship.author?.display_name;
      return name ? [name] : [];
    }),
    year: work.publication_year ?? (published ? Number(published.slice(0, 4)) : null),
    published: published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : null,
    url: arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : (work.primary_location?.landing_page_url ?? null),
    pdfUrl: work.open_access?.oa_url ?? work.primary_location?.pdf_url ?? null,
    scholarUrl: null,
    venue: work.primary_location?.source?.display_name ?? null,
    abstract: abstractFromInverted(work.abstract_inverted_index),
    citedBy: work.cited_by_count ?? null,
    source: 'openalex',
    arxivId,
    doi,
    openAlexId: openAlexKey(work.ids?.openalex ?? work.id),
    s2Id: null,
    scholarCluster: null,
  };
}
