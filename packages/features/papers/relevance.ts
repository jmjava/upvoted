/**
 * Whether a paper is about small language models, as opposed to language models in general.
 * The title carries the decision; the abstract counts only when the title is already about
 * language models, so a passing mention in a footnote doesn't qualify a paper.
 */

const PHRASE =
  /\b(?:small|tiny|compact|mini) language models?\b|\bon-device language models?\b|\bedge language models?\b|\bsub-?billion\b|\blanguage model distillation\b|\bdistilled language models?\b|\b(?:under|below|fewer than) (?:a|one) billion parameters\b/i;

/** A model of at most 4B parameters mentioned next to "language model". */
const SMALL_SIZE =
  /\b(?:[0-3](?:\.\d+)?|4(?:\.0+)?)\s?[Bb]\b[^.]{0,80}\blanguage models?\b|\blanguage models?\b[^.]{0,80}\b(?:[0-3](?:\.\d+)?|4(?:\.0+)?)\s?[Bb]\b/i;

const LANGUAGE_MODEL = /\blanguage models?\b|\bLLMs?\b|\bSLMs?\b/i;

export function isSmallLanguageModelPaper(title: string, abstract: string | null): boolean {
  if (slmSignal(title)) return true;
  return abstract != null && slmSignal(abstract) && LANGUAGE_MODEL.test(title);
}

function slmSignal(text: string): boolean {
  if (PHRASE.test(text) || SMALL_SIZE.test(text) || /\bSLMs\b/.test(text)) return true;
  // Singular "SLM" is a common acronym. It counts when the same text is about a model.
  return /\bSLM\b/.test(text) && /\bmodels?\b/i.test(text);
}
