import { createLimiter } from '@upvoted/lib/http';
import { type PaperRef, PaperRefSchema, type PaperSource } from '@upvoted/types';
import { searchArxiv } from './arxiv';
import type { PaperCandidate } from './candidate';
import { canonicalId, normalizeTitle } from './ids';
import { searchOpenAlex } from './openalex';
import { isSmallLanguageModelPaper } from './relevance';
import { scholarHitToCandidate, searchScholar } from './scholar';
import { searchSemanticScholar } from './semanticscholar';

/**
 * Picks the papers an episode covers. Google Scholar is the main index: a paper it returned
 * outranks one it didn't. OpenAlex, Semantic Scholar and arXiv add the day a paper appeared,
 * the abstract, and anything Scholar missed or couldn't be asked (it blocks automated
 * requests). A day with nothing new returns no papers: the show does not publish. When there is
 * news but fewer than three new papers, standing work fills the remaining segments.
 */

/** A paper dated inside this many days of the selection time counts as new. */
export const FRESH_DAYS = 45;
/** How far back standing papers may come from, to fill an episode that already has news. */
export const LOOKBACK_DAYS = 540;
/** The daily run starts in this hour (UTC). */
export const RUN_HOUR_UTC = 9;
const NEEDED = 3;
const CONCURRENCY = 4;

/** The moment an episode's papers are picked: `RUN_HOUR_UTC` on its date, or `now` if that's ahead. */
export function selectionTime(date: string, now: Date): Date {
  const runTime = new Date(`${date}T${String(RUN_HOUR_UTC).padStart(2, '0')}:00:00Z`);
  return runTime < now ? runTime : now;
}

export interface PaperSelection {
  papers: PaperRef[];
  /** True when nothing new landed. `papers` is empty, and the day is not published. */
  quiet: boolean;
  /** `unavailable` when Google Scholar blocked or failed every query. */
  scholar: 'ok' | 'unavailable';
}

interface Query {
  scholar: string;
  openalex: string;
  semantic: string;
  arxiv: string;
}

const QUERIES: Query[] = [
  {
    scholar: '"small language model"',
    openalex: 'small language model',
    semantic: 'small language model',
    arxiv: 'all:"small language model"',
  },
  {
    scholar: '"language model" (tiny OR compact OR "on-device" OR "sub-billion" OR distillation)',
    openalex: 'tiny compact on-device sub-billion distilled language model',
    semantic: 'tiny compact on-device sub-billion language model',
    arxiv:
      'ti:"language model" AND (ti:tiny OR ti:compact OR ti:"on-device" OR all:"sub-billion" OR ti:distillation)',
  },
];

/**
 * The `n` papers to cover, new ones first. Scholar papers rank above the others inside each
 * group. When nothing in the fresh window is new, returns no papers instead of an episode of
 * older work. Throws when every source failed, or when there is news but not enough papers to
 * fill the episode.
 */
export async function selectPapers(
  now: Date,
  excludeIds: string[],
  n = NEEDED,
): Promise<PaperSelection> {
  const today = isoDay(now);
  const from = addDays(today, -LOOKBACK_DAYS);
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(today.slice(0, 4));
  const { candidates, scholar, reached } = await gather(from, today, fromYear, toYear);
  if (!reached) {
    throw new Error(
      `Every source failed for papers before ${now.toISOString()}; not treating that as a quiet day.`,
    );
  }

  const excluded = new Set(excludeIds);
  const ranked = cluster(candidates)
    .map((group) => toPaper(group, now))
    .filter(
      (paper) =>
        inLookback(paper, today, from) &&
        !excluded.has(paper.id) &&
        isSmallLanguageModelPaper(paper.title, paper.abstract),
    )
    .sort(byRank(today));

  const fresh = ranked.filter((paper) => paper.status === 'new');
  if (fresh.length === 0) return { papers: [], quiet: true, scholar };

  const picked = [...fresh, ...ranked.filter((paper) => paper.status === 'standing')].slice(0, n);
  if (picked.length < n) {
    throw new Error(
      `Found only ${picked.length} of ${n} small-language-model papers in the ${LOOKBACK_DAYS} ` +
        `days before ${now.toISOString()}.`,
    );
  }
  return { papers: picked, quiet: false, scholar };
}

async function gather(
  from: string,
  to: string,
  fromYear: number,
  toYear: number,
): Promise<{ candidates: PaperCandidate[]; scholar: 'ok' | 'unavailable'; reached: boolean }> {
  const limit = createLimiter(CONCURRENCY);
  const candidates: PaperCandidate[] = [];
  let scholarOk = false;
  let reached = false;

  const tasks = QUERIES.flatMap((query) => [
    limit(() =>
      settle('scholar', () => searchScholar(query.scholar, fromYear, toYear)).then((result) => {
        // A captcha is not a search result. An empty page is: the field may simply be quiet.
        if (!result || result.blocked) return;
        reached = true;
        scholarOk = true;
        candidates.push(...result.hits.map(scholarHitToCandidate));
      }),
    ),
    limit(() =>
      settle('openalex', () => searchOpenAlex(query.openalex, from, to)).then((result) => {
        if (!result) return;
        reached = true;
        candidates.push(...result);
      }),
    ),
    limit(() =>
      settle('semantic scholar', () =>
        searchSemanticScholar(query.semantic, fromYear, toYear),
      ).then((result) => {
        if (!result) return;
        reached = true;
        candidates.push(...result);
      }),
    ),
    limit(() =>
      settle('arxiv', () => searchArxiv(query.arxiv)).then((result) => {
        if (!result) return;
        reached = true;
        candidates.push(...result);
      }),
    ),
  ]);
  await Promise.all(tasks);
  return { candidates, scholar: scholarOk ? 'ok' : 'unavailable', reached };
}

async function settle<T>(source: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`papers: ${source} search failed: ${message}`);
    return null;
  }
}

/** Groups hits that share an arXiv id, a DOI, or a normalized title. */
function cluster(candidates: PaperCandidate[]): PaperCandidate[][] {
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] ?? root;
    parent[index] = root;
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const seen = new Map<string, number>();
  const link = (key: string, index: number) => {
    const previous = seen.get(key);
    if (previous === undefined) seen.set(key, index);
    else union(previous, index);
  };
  candidates.forEach((candidate, index) => {
    if (candidate.arxivId) link(`arxiv:${candidate.arxivId}`, index);
    if (candidate.doi) link(`doi:${candidate.doi.toLowerCase()}`, index);
    const title = normalizeTitle(candidate.title);
    if (title) link(`title:${title}`, index);
  });

  const groups = new Map<number, PaperCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(candidate);
    else groups.set(root, [candidate]);
  });
  return [...groups.values()];
}

function toPaper(group: PaperCandidate[], now: Date): PaperRef {
  const sources = [...new Set(group.map((candidate) => candidate.source))];
  const arxivId = first(group, (candidate) => candidate.arxivId);
  const doi = first(group, (candidate) => candidate.doi);
  const openAlexId = first(group, (candidate) => candidate.openAlexId);
  const s2Id = first(group, (candidate) => candidate.s2Id);
  const scholarCluster = first(group, (candidate) => candidate.scholarCluster);
  const published =
    group
      .map((candidate) => candidate.published)
      .filter((day): day is string => day != null)
      .sort()[0] ?? null;
  const yearFromDay = published ? Number(published.slice(0, 4)) : null;
  const authors = group.reduce<string[]>(
    (best, candidate) => (candidate.authors.length > best.length ? candidate.authors : best),
    [],
  );
  const abstracts = group.flatMap((candidate) => (candidate.abstract ? [candidate.abstract] : []));
  const cited = group.reduce(
    (max, candidate) =>
      candidate.citedBy != null && candidate.citedBy > max ? candidate.citedBy : max,
    -1,
  );
  const title = group.reduce(
    (best, candidate) => (candidate.title.length > best.length ? candidate.title : best),
    group[0]?.title ?? '',
  );
  const paper = {
    id: canonicalId({ arxivId, doi, openAlexId, s2Id, scholarCluster, title }),
    title,
    authors,
    year: yearFromDay ?? group.find((candidate) => candidate.year != null)?.year ?? null,
    published,
    url: arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : doi
        ? `https://doi.org/${doi}`
        : (group.find((candidate) => candidate.url)?.url ?? null),
    pdfUrl: arxivId
      ? `https://arxiv.org/pdf/${arxivId}`
      : (group.find((candidate) => candidate.pdfUrl)?.pdfUrl ?? null),
    scholarUrl: scholarCluster
      ? `https://scholar.google.com/scholar?cluster=${scholarCluster}`
      : (group.find((candidate) => candidate.scholarUrl)?.scholarUrl ?? null),
    venue: group.find((candidate) => candidate.venue)?.venue ?? null,
    abstract: abstracts.sort((a, b) => b.length - a.length)[0] ?? null,
    citedBy: cited < 0 ? null : cited,
    source: primarySource(sources),
    sources,
    status: 'standing' as const,
  };
  return PaperRefSchema.parse({ ...paper, status: statusOf(paper, arxivId, now) });
}

function primarySource(sources: PaperSource[]): PaperSource {
  if (sources.includes('scholar')) return 'scholar';
  if (sources.includes('arxiv')) return 'arxiv';
  if (sources.includes('openalex')) return 'openalex';
  return 'semanticscholar';
}

/**
 * Dated inside the fresh window, or an arXiv id from the current month when no source gave a
 * day. A year alone is not enough: a 2026 paper may have come out in January.
 */
function statusOf(
  paper: { published: string | null },
  arxivId: string | null,
  now: Date,
): 'new' | 'standing' {
  const today = isoDay(now);
  if (paper.published) {
    return paper.published >= addDays(today, -FRESH_DAYS) && paper.published <= today
      ? 'new'
      : 'standing';
  }
  return arxivMonth(arxivId) === today.slice(0, 7) ? 'new' : 'standing';
}

function inLookback(paper: PaperRef, today: string, from: string): boolean {
  if (paper.published) return paper.published >= from && paper.published <= today;
  const month = arxivMonth(paper.id.startsWith('arxiv:') ? paper.id.slice('arxiv:'.length) : null);
  if (month) return month >= from.slice(0, 7) && month <= today.slice(0, 7);
  if (paper.year == null) return false;
  return paper.year >= Number(from.slice(0, 4)) && paper.year <= Number(today.slice(0, 4));
}

function byRank(today: string) {
  return (a: PaperRef, b: PaperRef) =>
    rank(b, today) - rank(a, today) ||
    (b.published ?? '').localeCompare(a.published ?? '') ||
    a.id.localeCompare(b.id);
}

/** Scholar first, then citations, then a modest preference for newer work. */
function rank(paper: PaperRef, today: string): number {
  let value = paper.sources.includes('scholar') ? 50 : 0;
  if (paper.abstract && paper.abstract.length > 80) value += 5;
  if (paper.citedBy) value += Math.min(30, Math.round(Math.log10(paper.citedBy + 1) * 12));
  if (paper.published) {
    const age = daysBetween(paper.published, today);
    value += Math.max(0, 20 - Math.floor(age / 14));
  }
  return value;
}

function arxivMonth(id: string | null): string | null {
  const match = id ? /^(\d{2})(\d{2})\.\d{4,5}$/.exec(id) : null;
  const month = Number(match?.[2]);
  if (!match?.[1] || month < 1 || month > 12) return null;
  return `20${match[1]}-${match[2]}`;
}

function first(
  group: PaperCandidate[],
  pick: (candidate: PaperCandidate) => string | null,
): string | null {
  for (const candidate of group) {
    const value = pick(candidate);
    if (value) return value;
  }
  return null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
