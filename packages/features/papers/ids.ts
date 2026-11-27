/** Stable ids and the keys used to notice the same paper in two indexes. */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `https://arxiv.org/abs/2511.01234v2` or `2511.01234` → `2511.01234`. */
export function arxivIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const whole = url.trim().match(/^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  if (whole?.[1]) return whole[1];
  const match = url.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] ?? null;
}

/** A DOI buried in a URL, without a trailing period. */
export function doiFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/10\.\d{4,9}\/[^\s?#]+/i);
  if (!match?.[0]) return null;
  return decodeURIComponent(match[0]).replace(/[.,;)]+$/, '');
}

/** `https://openalex.org/W123` → `W123`. */
export function openAlexKey(id: string): string {
  const match = id.match(/W\d+$/);
  return match?.[0] ?? id;
}

export function canonicalId(paper: {
  arxivId: string | null;
  doi: string | null;
  openAlexId: string | null;
  s2Id: string | null;
  scholarCluster: string | null;
  title: string;
}): string {
  if (paper.arxivId) return `arxiv:${paper.arxivId}`;
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  if (paper.openAlexId) return `openalex:${paper.openAlexId}`;
  if (paper.s2Id) return `s2:${paper.s2Id}`;
  if (paper.scholarCluster) return `scholar:${paper.scholarCluster}`;
  return `title:${hashTitle(normalizeTitle(paper.title))}`;
}

function hashTitle(title: string): string {
  let hash = 5381;
  for (let i = 0; i < title.length; i++) hash = (hash * 33) ^ title.charCodeAt(i);
  return (hash >>> 0).toString(16);
}
