import { describe, expect, it } from 'vitest';
import { isSmallLanguageModelPaper } from './relevance';

describe('isSmallLanguageModelPaper', () => {
  it.each([
    ['A survey of small language models', null],
    ['MobileLLM: Optimizing Sub-billion Parameter Language Models', null],
    ['Tiny language models for on-device speech', null],
    ['SLMs for edge devices', null],
    ['A 1.5B language model that runs on a phone', null],
    ['Language model distillation for student models', null],
  ])('keeps %s', (title, abstract) => {
    expect(isSmallLanguageModelPaper(title, abstract)).toBe(true);
  });

  it('keeps a language-model paper whose abstract is about small models', () => {
    expect(
      isSmallLanguageModelPaper(
        'Efficient LLMs under a tight budget',
        'We study small language models that fit on a phone.',
      ),
    ).toBe(true);
  });

  it.each([
    ['Attention Is All You Need', 'We propose a new network architecture, the Transformer.'],
    ['Scaling laws for large language models', null],
    ['SLM revenue grew last quarter', null],
    ['A 70B language model for chat', null],
    [
      'Distilling step by step',
      'We distill a large model into a smaller student. No language model is named.',
    ],
  ])('drops %s', (title, abstract) => {
    expect(isSmallLanguageModelPaper(title, abstract)).toBe(false);
  });
});
