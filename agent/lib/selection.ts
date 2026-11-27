import type { Selection } from '@upvoted/features/script';
import { defineState } from 'eve/context';

/**
 * The papers get_papers picked in this session. check_script and publish_episode accept only a
 * script about exactly these, so the agent can't swap in a paper of its own.
 */
export const selection = defineState<Selection | null>('upvoted.selection', () => null);
