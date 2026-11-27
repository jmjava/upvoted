import { ScriptDraftSchema } from '@upvoted/types';
import { z } from 'zod';

/** What check_script and publish_episode take: the script and the papers it covers. */
export const ScriptInputSchema = z.object({
  script: ScriptDraftSchema.describe(
    'The whole script: date, then segments intro, story, story, story, signoff, each with its lines',
  ),
  storyIds: z
    .array(z.string().min(1))
    .length(3)
    .describe("The ids of story segments 1, 2 and 3, in get_papers' order"),
});
export type ScriptInput = z.infer<typeof ScriptInputSchema>;
