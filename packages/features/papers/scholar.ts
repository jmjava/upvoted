import { BROWSER_USER_AGENT, fetchWithRetry, HttpError } from '@upvoted/lib/http';
import { parseHTML } from 'linkedom';
import type { PaperCandidate } from './candidate';
import { arxivIdFromUrl, doiFromUrl } from './ids';

/** Google Scholar is the show's main index. It has no API, so this reads the search page. */

const SCHOLAR_ORIGIN = 'https://scholar.google.com';

export interface ScholarHit {
  title: string;
  url: string | null;
  pdfUrl: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  snippet: string;
  citedBy: number | null;
  clusterId: string | null;
}

export type ScholarSearch = { blocked: true } | { blocked: false; hits: ScholarHit[] };

export function scholarSearchUrl(query: string, fromYear: number, toYear: number): string {
  const url = new URL('/scholar', SCHOLAR_ORIGIN);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('as_sdt', '0,5');
  url.searchParams.set('q', query);
  url.searchParams.set('as_ylo', String(fromYear));
  url.searchParams.set('as_yhi', String(toYear));
  url.searchParams.set('num', '20');
  return url.href;
}

/** Fetches one Scholar query. A captcha or a block is `blocked`, not a throw. */
export async function searchScholar(
  query: string,
  fromYear: number,
  toYear: number,
): Promise<ScholarSearch> {
  const url = scholarSearchUrl(query, fromYear, toYear);
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'user-agent': BROWSER_USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    },
    { timeoutMs: 15_000, retries: 1 },
  );
  const html = await response.text();
  if (response.status === 403 || response.status === 429) return { blocked: true };
  if (!response.ok) throw new HttpError(response.status, url);
  return parseScholarHtml(html);
}

/** Pulls paper hits out of a Scholar results page. A captcha page is `blocked`. */
export function parseScholarHtml(html: string): ScholarSearch {
  if (isBlocked(html)) return { blocked: true };
  const { document } = parseHTML(html);
  const hits: ScholarHit[] = [];
  for (const row of document.querySelectorAll('.gs_r')) {
    const heading = row.querySelector('.gs_rt');
    const title = clean(heading?.textContent ?? '').replace(
      /^\[(?:PDF|HTML|BOOK|CITATION)\]\s*/i,
      '',
    );
    if (!title) continue;
    const meta = clean(row.querySelector('.gs_a')?.textContent ?? '');
    const parsed = parseMeta(meta);
    const cited = /Cited by ([\d,]+)/i.exec(row.textContent ?? '');
    const pdf = row.querySelector('.gs_ggs a')?.getAttribute('href') ?? null;
    hits.push({
      title,
      url: paperUrl(heading?.querySelector('a')?.getAttribute('href') ?? null),
      pdfUrl: paperUrl(pdf),
      authors: parsed.authors,
      year: parsed.year,
      venue: parsed.venue,
      snippet: clean(row.querySelector('.gs_rs')?.textContent ?? ''),
      citedBy: cited?.[1] ? Number(cited[1].replace(/,/g, '')) : null,
      clusterId: row.getAttribute('data-cid'),
    });
  }
  return { blocked: false, hits };
}

export function scholarHitToCandidate(hit: ScholarHit): PaperCandidate {
  const arxivId = arxivIdFromUrl(hit.url) ?? arxivIdFromUrl(hit.pdfUrl);
  return {
    title: hit.title,
    authors: hit.authors,
    year: hit.year,
    published: null,
    url: hit.url,
    pdfUrl: hit.pdfUrl,
    scholarUrl: hit.clusterId ? `${SCHOLAR_ORIGIN}/scholar?cluster=${hit.clusterId}` : null,
    venue: hit.venue,
    abstract: hit.snippet || null,
    citedBy: hit.citedBy,
    source: 'scholar',
    arxivId,
    doi: doiFromUrl(hit.url),
    openAlexId: null,
    s2Id: null,
    scholarCluster: hit.clusterId,
  };
}

function isBlocked(html: string): boolean {
  const text = html.toLowerCase();
  return (
    text.includes('unusual traffic') ||
    text.includes('recaptcha') ||
    text.includes('/sorry/') ||
    text.includes('gs_captcha') ||
    text.includes('not a robot')
  );
}

/** Authors, year and venue from Scholar's `A Author, B Author - Venue, 2026 - site` line. */
function parseMeta(meta: string): { authors: string[]; year: number | null; venue: string | null } {
  const years = meta.match(/\b(?:19|20)\d{2}\b/g);
  const year = years?.at(-1) ? Number(years.at(-1)) : null;
  const [authorsPart, venuePart] = meta.split(/\s+-\s+/);
  const authors = (authorsPart ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !/^(?:19|20)\d{2}$/.test(name));
  const venue =
    venuePart
      ?.replace(/\b(?:19|20)\d{2}\b/g, '')
      .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
      .trim() || null;
  return { authors, year, venue: venue || null };
}

function paperUrl(href: string | null): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, SCHOLAR_ORIGIN);
  } catch {
    return null;
  }
  if (url.hostname.endsWith('scholar.google.com')) return null;
  return url.href;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
