import { getPaper } from '@upvoted/features/papers';
import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { selection } from '../lib/selection';

export default defineTool({
  description:
    'Reads one paper get_papers returned: its authors, abstract, and the HTML of the paper when ' +
    'it can be fetched (about 8,000 words). When the page cannot be read, text is null and ' +
    'textError says why; the abstract is still there. Use that, and do not invent the rest.',
  inputSchema: z.object({
    id: z.string().min(1).describe('The paper id from get_papers'),
  }),
  async execute({ id }) {
    const selected = selection.get();
    if (!selected) throw new Error('Call get_papers before get_paper.');
    return getPaper(selected.date, id);
  },
});
