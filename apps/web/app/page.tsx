import { loadIndex } from '@upvoted/features/episodes';
import { config } from '@upvoted/lib/config';
import type { EpisodeRecord } from '@upvoted/types';

// Read index.json on every request, so an episode shows as soon as it is published.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const { episodes } = await loadIndex();
  const [latest, ...earlier] = episodes;
  return (
    <main>
      <header>
        <h1>{config.show.name}</h1>
        <p className="tagline">
          Three pieces of small-language-model research, on mornings when something new has landed.
          AI-generated.
        </p>
      </header>
      {latest ? (
        <Episode episode={latest} />
      ) : (
        <p>The first episode is on its way. Check back tomorrow morning.</p>
      )}
      {earlier.length > 0 ? (
        <section className="earlier">
          <h2>Earlier episodes</h2>
          {earlier.map((episode) => (
            <Episode key={episode.date} episode={episode} earlier />
          ))}
        </section>
      ) : null}
    </main>
  );
}

/**
 * One episode. An earlier one is lighter: a smaller title, its stories folded away, and a player
 * that fetches nothing until it's played, since Blob transfer is the limit we're closest to.
 */
function StoryLinks({ story }: { story: EpisodeRecord['stories'][number] }) {
  const links = [
    story.url ? { href: story.url, label: 'Paper' } : null,
    story.pdfUrl ? { href: story.pdfUrl, label: 'PDF' } : null,
    story.scholarUrl ? { href: story.scholarUrl, label: 'Google Scholar' } : null,
  ].filter((link) => link != null);
  if (links.length === 0) return null;
  return (
    <span className="links">
      {links.map((link, index) => (
        <span key={link.label}>
          {index > 0 ? ' · ' : null}
          <a href={link.href}>{link.label}</a>
        </span>
      ))}
    </span>
  );
}

function Episode({ episode, earlier = false }: { episode: EpisodeRecord; earlier?: boolean }) {
  const Title = earlier ? 'h3' : 'h2';
  const stories = (
    <ol className="stories">
      {episode.stories.map((story) => (
        <li key={story.id}>
          <span className="title">{story.title}</span>
          <span className="meta">
            {story.authors}
            {story.year ? `, ${story.year}` : ''}
            {' · '}
            {story.status === 'new' ? 'New' : 'Standing'}
          </span>
          <StoryLinks story={story} />
        </li>
      ))}
    </ol>
  );
  return (
    <article>
      <p className="date">
        <time dateTime={episode.date}>{longDate(episode.date)}</time>
      </p>
      <Title>{episode.title}</Title>
      {/* biome-ignore lint/a11y/useMediaCaption: a transcript page is out of scope for now. */}
      <audio controls preload={earlier ? 'none' : 'metadata'} src={episode.audio.url}>
        <a href={episode.audio.url}>Download the episode</a>
      </audio>
      {earlier ? (
        <details>
          <summary>In this episode</summary>
          {stories}
        </details>
      ) : (
        <>
          <h3>In this episode</h3>
          {stories}
        </>
      )}
    </article>
  );
}

/** `2026-11-03` → `Tuesday, November 3, 2026`. */
function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}
