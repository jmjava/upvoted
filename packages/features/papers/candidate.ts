import type { PaperSource } from '@upvoted/types';

/** One hit from one index, before the same paper is merged across sources. */
export interface PaperCandidate {
  title: string;
  authors: string[];
  year: number | null;
  /** `YYYY-MM-DD` when the source gave a day. */
  published: string | null;
  url: string | null;
  pdfUrl: string | null;
  scholarUrl: string | null;
  venue: string | null;
  abstract: string | null;
  citedBy: number | null;
  source: PaperSource;
  arxivId: string | null;
  doi: string | null;
  openAlexId: string | null;
  s2Id: string | null;
  scholarCluster: string | null;
}
