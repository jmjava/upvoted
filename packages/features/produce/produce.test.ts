import { getFile, getJson, keys, putJson } from '@upvoted/lib/storage';
import { readJsonFixture } from '@upvoted/testing/fixtures';
import { type PaperRef, type Script, ScriptSchema } from '@upvoted/types';
import { describe, expect, it } from 'vitest';
import { loadIndex } from '../episodes';
import { publishSaved, saveScript } from './produce';

const sample = ScriptSchema.parse(readJsonFixture('script-sample.json')) as Script;
const ids = sample.segments.flatMap((segment) => (segment.storyId ? [segment.storyId] : []));
const draft = {
  date: sample.date,
  segments: sample.segments.map(({ kind, lines }) => ({ kind, lines })),
};
const audio = {
  key: keys.episode(sample.date),
  url: `https://blob.example.com/${keys.episode(sample.date)}`,
  bytes: 8_000_000,
  durationSec: 700,
};

function paper(id: string, url: string | null): PaperRef {
  return {
    id,
    title: `Paper ${id}`,
    authors: ['Ada Lovelace'],
    year: 2026,
    published: '2026-11-01',
    url,
    pdfUrl: url ? `${url}.pdf` : null,
    scholarUrl: `https://scholar.google.com/scholar?cluster=${id}`,
    venue: 'arXiv',
    abstract: 'A small language model.',
    citedBy: 1,
    source: 'scholar',
    sources: ['scholar'],
    status: 'new',
  };
}

async function savePapers(): Promise<void> {
  await putJson(keys.papers(sample.date), {
    date: sample.date,
    quiet: false,
    scholar: 'ok',
    papers: [
      paper(ids[0] ?? '', 'https://arxiv.org/abs/2511.00001'),
      paper(ids[1] ?? '', 'https://arxiv.org/abs/2511.00002'),
      paper(ids[2] ?? '', null),
    ],
  });
}

describe('saveScript', () => {
  it('saves the script and transcript with links and show notes from the selected papers', async () => {
    await savePapers();

    const saved = await saveScript(draft, ids);

    expect(saved.segmentCount).toBe(5);
    expect(saved.stories.map((story) => story.url)).toEqual([
      'https://arxiv.org/abs/2511.00001',
      'https://arxiv.org/abs/2511.00002',
      null,
    ]);
    const script = await getJson(keys.script(sample.date), ScriptSchema);
    expect(script?.segments.map((segment) => segment.storyId)).toEqual([null, ...ids, null]);
    expect(script?.description).toContain('https://arxiv.org/abs/2511.00002');
    expect(script?.description).toContain(
      'https://scholar.google.com/scholar?cluster=arxiv:2511.00003',
    );
    const transcript = (await getFile(keys.transcript(sample.date)))?.toString('utf8');
    expect(transcript).toContain(script?.description);
  });

  it('fails, saving nothing, when an id was not selected', async () => {
    await savePapers();

    await expect(
      saveScript(draft, [ids[0] ?? '', ids[1] ?? '', 'doi:10.1000/missing']),
    ).rejects.toThrow();
    expect(await getFile(keys.script(sample.date))).toBeNull();
  });
});

describe('publishSaved', () => {
  it('publishes the saved script with the papers it covers', async () => {
    await savePapers();
    const { stories } = await saveScript(draft, ids);

    await publishSaved(sample.date, stories, audio);

    const [episode] = (await loadIndex()).episodes;
    const script = await getJson(keys.script(sample.date), ScriptSchema);
    expect(episode).toMatchObject({
      date: sample.date,
      title: script?.title,
      description: script?.description,
      audio,
      stories,
    });
  });
});
