import { type EpisodeRun, loadExcludeIds } from '@upvoted/features/episodes';
import { selectionTime, selectPapers } from '@upvoted/features/papers';
import { keys, putJson } from '@upvoted/lib/storage';

/**
 * Whether `run` has new small-language-model papers. A quiet day starts no session and saves
 * nothing, so a morning with no news spends nothing on a script. When there is news, the pick is
 * saved for `get_papers` to read back.
 */
export async function newsworthy(run: EpisodeRun): Promise<'go' | 'nothing new'> {
  const at = selectionTime(run.date, new Date());
  const picked = await selectPapers(at, await loadExcludeIds(at));
  if (picked.quiet || picked.papers.length === 0) {
    console.log(`no episode ${run.date}: nothing new`);
    return 'nothing new';
  }
  await putJson(keys.papers(run.date), {
    date: run.date,
    quiet: false,
    scholar: picked.scholar,
    papers: picked.papers,
  });
  return 'go';
}
