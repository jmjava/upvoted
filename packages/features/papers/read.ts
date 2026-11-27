import { getJson, keys } from '@upvoted/lib/storage';
import {
  type EpisodeStory,
  type PaperRef,
  type PaperSet,
  PaperSetSchema,
  type PaperStatus,
} from '@upvoted/types';
import { fetchArticle } from './article';
import { arxivIdFromUrl } from './ids';

/**
 * What the agent's read tool returns, and the show-notes lookup publish uses. Both read the
 * papers `get_papers` saved, so a link never comes from the model.
 */

export interface PaperBrief {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  published: string | null;
  venue: string | null;
  status: PaperStatus;
  source: PaperRef['source'];
  sources: PaperRef['sources'];
  url: string | null;
  pdfUrl: string | null;
  scholarUrl: string | null;
  citedBy: number | null;
  abstract: string | null;
  /** The paper's HTML, capped, or null when there is no page or it could not be read. */
  text: string | null;
  /** Why `text` is missing when a page was fetched and failed. */
  textError: string | null;
}

/** Each paper's title and links, in the order of `ids`. */
export async function lookupPapers(date: string, ids: string[]): Promise<EpisodeStory[]> {
  const set = await loadSet(date);
  return ids.map((id) => toEpisodeStory(findPaper(set, date, id)));
}

/** The saved paper plus its HTML text, when the page can be read. */
export async function getPaper(date: string, id: string): Promise<PaperBrief> {
  const paper = findPaper(await loadSet(date), date, id);
  const page = textUrl(paper);
  const article = page ? await fetchArticle(page) : { text: null, error: null };
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    published: paper.published,
    venue: paper.venue,
    status: paper.status,
    source: paper.source,
    sources: paper.sources,
    url: paper.url,
    pdfUrl: paper.pdfUrl,
    scholarUrl: paper.scholarUrl,
    citedBy: paper.citedBy,
    abstract: paper.abstract,
    text: article.text,
    textError: page ? article.error : null,
  };
}

export function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown authors';
  if (authors.length <= 4) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')}, and ${authors.length - 3} more`;
}

export function toEpisodeStory(paper: PaperRef): EpisodeStory {
  return {
    id: paper.id,
    title: paper.title,
    authors: formatAuthors(paper.authors),
    year: paper.year,
    url: paper.url,
    pdfUrl: paper.pdfUrl,
    scholarUrl: paper.scholarUrl,
    venue: paper.venue,
    status: paper.status,
  };
}

async function loadSet(date: string): Promise<PaperSet> {
  const set = await getJson(keys.papers(date), PaperSetSchema);
  if (!set) throw new Error(`No papers saved for ${date}. Call get_papers first.`);
  return set;
}

function findPaper(set: PaperSet, date: string, id: string): PaperRef {
  const paper = set.papers.find((item) => item.id === id);
  if (!paper) throw new Error(`Paper ${id} is not in the ${date} selection`);
  return paper;
}

/** arXiv's HTML when we know the id, otherwise the landing page, never a PDF or Scholar. */
function textUrl(paper: PaperRef): string | null {
  const arxivId = paper.id.startsWith('arxiv:')
    ? paper.id.slice('arxiv:'.length)
    : arxivIdFromUrl(paper.url);
  if (arxivId) return `https://arxiv.org/html/${arxivId}`;
  if (paper.url && !paper.url.includes('scholar.google.com') && !/\.pdf($|\?)/i.test(paper.url)) {
    return paper.url;
  }
  return null;
}
