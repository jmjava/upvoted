# upvoted

A daily, AI-generated briefing on small language model research, in about twelve minutes:
a host brings in a correspondent for each paper, who explains what the paper did and what it
found. Listen at **[upvoted.dev](https://upvoted.dev)**, which plays the latest episode.

It runs on Vercel as an [eve](https://vercel.com/docs/eve) agent (Functions, Workflows, Cron, Blob
and AI Gateway). Google Scholar is the main source. OpenAlex, Semantic Scholar and arXiv fill in
dates, abstracts and papers Scholar missed or couldn't be asked — Scholar often blocks automated
requests, and the field often has nothing new. On those mornings there is no episode. Claude writes
the script and Gemini voices it.

See [AGENTS.md](AGENTS.md) for the layout, the commands and the conventions.

## How it runs

Every morning between 09:00 and 09:59 UTC (4–5am Eastern), the agent's schedule
(`agent/schedules/daily-episode.ts`) starts a session for today's date in New York, unless that
day's episode is already published or nothing new has landed, in which case it does nothing and
spends nothing. The agent,
whose job and style guide are in [`agent/instructions.md`](agent/instructions.md):

1. picks three small-language-model papers, new ones first, skipping any covered in the past week,
2. reads each paper, and searches the web only when the paper itself isn't enough,
3. writes the script, checks it, and publishes it: the voices, the mix, and a new entry in
   `index.json` in Blob, which the site reads.

Run it by hand, or for another day:

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://upvoted.dev/api/episode
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://upvoted.dev/api/episode?date=2026-11-03"
# Make a published day's episode again, replacing it:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://upvoted.dev/api/episode?force=1"
```

It answers `{ "date": "...", "force": false, "status": "started", "sessionId": "..." }`,
`"status": "already published"` when that day already has an episode, or `"status": "nothing new"`
when no new paper turned up. Follow the session in the Vercel
dashboard under **Observability → Agent Runs**: every tool call, what the agent read, and the
tokens it spent. On a preview deployment the same call writes only under `preview/` in Blob, so
it can't touch the live episode (previews are behind Vercel Authentication, so add a protection
bypass header or use the dashboard's share link).

## One-time setup

- **AI Gateway credits.** In the Vercel dashboard, open **AI Gateway**, add credits, and keep
  auto top-up off so the balance caps spending. Each session also stops itself at about 500,000
  new input tokens (`agent/agent.ts`).
- **The Vercel project builds from the repo root** (Root Directory empty), where `vercel.ts`
  composes the Next.js site and the agent. Use Node.js 24, which eve needs. The public Blob store
  and `CRON_SECRET` are already set up. Deployments reach AI Gateway with Vercel's OIDC token, so
  there are no provider keys to add.

## Running locally

Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
vercel link && vercel env pull     # writes .env.local, with VERCEL_ENV=development
pnpm dev:agent                     # the agent, with eve's terminal UI
```

In the terminal UI, ask for an episode ("Produce the Upvoted episode for 2026-11-03, a briefing on small language model research"), or start a
run the way production does with `curl -X POST -H "Authorization: Bearer $CRON_SECRET"
http://localhost:2000/api/episode`. Because `vercel env pull` sets `VERCEL_ENV=development`, local
runs read and write under `preview/`, never the live files.

`pnpm episode` redoes the audio of a saved script: it voices, mixes and publishes
`episodes/<date>/script.json`, and with `UPVOTED_FAKE_VOICES=1` it uses tones instead of Gemini.
`pnpm dev` serves the site from whichever store is configured.

## Changing the voices

The cast and their voices are in `packages/lib/config.ts`:

- `cast.host` and `cast.correspondents[]` each have a `name` and a `voice`, a Gemini prebuilt
  voice name such as `Kore` or `Puck`. Correspondent `i` covers story `i`.
- `tts.model` is the AI Gateway speech model, and `tts.style` the show-wide speaking style.

Try a change on a saved script with `pnpm episode --until mix`. The cast's names and the show's
style also appear in `agent/instructions.md`; change both together.
