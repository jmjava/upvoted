import { fetchWithRetry, HttpError } from '@upvoted/lib/http';
import type { PaperCandidate } from './candidate';
import { arxivIdFromUrl } from './ids';
import { htmlToText } from './text';

/** arXiv is where new small-model preprints show up before the other indexes have a date. */

const MAILTO = 'research@upvoted.dev';

export function arxivSearchUrl(query: string): string {
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', query);
  url.searchParams.set('sortBy', 'submittedDate');
  url.searchParams.set('sortOrder', 'descending');
  url.searchParams.set('max_results', '30');
  return url.href;
}

export async function searchArxiv(query: string): Promise<PaperCandidate[]> {
  const url = arxivSearchUrl(query);
  const response = await fetchWithRetry(
    url,
    { headers: { accept: 'application/atom+xml', 'user-agent': `Upvoted/1.0 (mailto:${MAILTO})` } },
    { timeoutMs: 15_000, retries: 2 },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(response.status, url);
  }
  return parseArxivAtom(await response.text());
}

/** The Atom entries arXiv returns. An entry with no id or title is skipped. */
export function parseArxivAtom(xml: string): PaperCandidate[] {
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
  return entries.flatMap((entry) => {
    const id = arxivIdFromUrl(tagText(entry, 'id'));
    const title = collapse(tagText(entry, 'title') ?? '');
    if (!id || !title) return [];
    const published = tagText(entry, 'published')?.slice(0, 10) ?? null;
    const authors = [...entry.matchAll(/<name>([^<]*)<\/name>/g)].flatMap((match) => {
      const name = decode(match[1] ?? '').trim();
      return name ? [name] : [];
    });
    const pdfHref = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i)?.[1] ?? null;
    const category = entry.match(/<(?:arxiv:)?primary_category[^>]*term="([^"]+)"/i)?.[1] ?? null;
    return [
      {
        title,
        authors,
        year: published ? Number(published.slice(0, 4)) : null,
        published: published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : null,
        url: `https://arxiv.org/abs/${id}`,
        pdfUrl: pdfHref ?? `https://arxiv.org/pdf/${id}`,
        scholarUrl: null,
        venue: category ? `arXiv ${category}` : 'arXiv',
        abstract: htmlToText(tagText(entry, 'summary') ?? '') || null,
        citedBy: null,
        source: 'arxiv' as const,
        arxivId: id,
        doi: null,
        openAlexId: null,
        s2Id: null,
        scholarCluster: null,
      },
    ];
  });
}

function tagText(entry: string, name: string): string | null {
  const match = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match?.[1] ? decode(match[1]) : null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}
