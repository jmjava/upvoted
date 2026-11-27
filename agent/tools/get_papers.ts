import { loadExcludeIds } from '@upvoted/features/episodes';
import { selectionTime, selectPapers } from '@upvoted/features/papers';
import { getJson, keys, putJson } from '@upvoted/lib/storage';
import { EpisodeDateSchema, PaperSetSchema } from '@upvoted/types';
import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { selection } from '../lib/selection';

export default defineTool({
  description:
    "Picks the episode's three small-language-model papers. Google Scholar is the main source; " +
    'OpenAlex, Semantic Scholar and arXiv fill in dates, abstracts and papers Scholar missed. ' +
    'New papers come first. When nothing has landed in the fresh window, quiet is true and papers ' +
    'is empty: do not write a script and do not publish. scholar is "unavailable" when Google ' +
    'Scholar could not be reached. Skips papers covered in the past week. Call it once, first.',
  inputSchema: z.object({ date: EpisodeDateSchema.describe('The episode date, YYYY-MM-DD') }),
  async execute({ date }) {
    const picked = (await getJson(keys.papers(date), PaperSetSchema)) ?? (await search(date));
    if (picked.quiet || picked.papers.length === 0) {
      selection.update(() => ({ date, ids: [], quiet: true }));
      console.log(`get_papers ${date}: nothing new (scholar=${picked.scholar})`);
      return { date, quiet: true, scholar: picked.scholar, papers: [] };
    }
    selection.update(() => ({
      date,
      ids: picked.papers.map((paper) => paper.id),
      quiet: false,
    }));
    console.log(
      `get_papers ${date}: quiet=${picked.quiet} scholar=${picked.scholar} ` +
        picked.papers.map((paper) => paper.id).join(', '),
    );
    return {
      date,
      quiet: picked.quiet,
      scholar: picked.scholar,
      papers: picked.papers.map((paper) => ({
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        published: paper.published,
        venue: paper.venue,
        citedBy: paper.citedBy,
        status: paper.status,
        source: paper.source,
        sources: paper.sources,
        url: paper.url,
        pdfUrl: paper.pdfUrl,
        scholarUrl: paper.scholarUrl,
      })),
    };
  },
});

/** Searches when this date has no saved pick yet. A quiet result is not saved. */
async function search(date: string) {
  const at = selectionTime(date, new Date());
  const picked = await selectPapers(at, await loadExcludeIds(at));
  const set = {
    date,
    quiet: picked.quiet,
    scholar: picked.scholar,
    papers: picked.papers,
  };
  if (!picked.quiet && picked.papers.length > 0) await putJson(keys.papers(date), set);
  return set;
}
