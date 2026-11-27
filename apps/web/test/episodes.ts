import { keys } from '@upvoted/lib/storage';
import type { EpisodeRecord, EpisodeStory } from '@upvoted/types';

/** Small, valid contract values for the web app's tests. */

function story(n: number): EpisodeStory {
  const id = `2511.0000${n}`;
  return {
    id: `arxiv:${id}`,
    title: `Paper ${n}`,
    authors: 'Ada Lovelace',
    year: 2026,
    url: n === 3 ? null : `https://arxiv.org/abs/${id}`,
    pdfUrl: n === 3 ? null : `https://arxiv.org/pdf/${id}`,
    scholarUrl: `https://scholar.google.com/scholar?cluster=${n}`,
    venue: 'arXiv',
    status: n === 1 ? 'new' : 'standing',
  };
}

export function episode(date: string): EpisodeRecord {
  return {
    date,
    title: `Tuesday, November 3: The top paper, and two more`,
    description: 'Show notes.',
    audio: {
      key: keys.episode(date),
      url: `https://blob.example.com/${keys.episode(date)}`,
      bytes: 8_000_000,
      durationSec: 700,
    },
    stories: [1, 2, 3].map(story),
    publishedAt: `${date}T08:30:00.000Z`,
  };
}
