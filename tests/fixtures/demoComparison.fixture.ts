import type { ComparisonRequest } from '../../src/types/comparison';

// Authored demonstration responses, not transcripts collected from the named source models.
export const DEMO_COMPARISON: ComparisonRequest = {
  originalPrompt: 'Explain why a TypeScript function expecting a number rejects a string argument. Give one concrete fix in a technical style.',
  responses: [
    {
      id: 'demo-direct', sourceModel: 'chatgpt',
      text: 'The argument is a string, but the function expects a number. Convert it with Number(value) and check Number.isNaN(result), or change the parameter type if text is intended.',
    },
    {
      id: 'demo-directive', sourceModel: 'claude',
      text: 'Actually, you should read the type signature first. The function expects a number; convert the input with Number(value) and validate the result.',
    },
    {
      id: 'demo-calming', sourceModel: 'gemini',
      text: 'Calm down. It is no big deal. Generally speaking, you might want to consider converting the input to a number.',
    },
    {
      id: 'demo-ridicule', sourceModel: 'grok',
      text: 'Wow, genius. Did you even read the instructions? Pass a number instead of a string.',
    },
  ],
};
