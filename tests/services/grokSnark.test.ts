import { expect, test } from 'vitest';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { ANALYSIS_SOURCES } from '../../src/types/provider';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';

const neutralPrompt = 'Explain this compiler error.';
const mockery = 'Wow, genius. Did you even read the instructions?';

test('requires original context before calling mockery uninvited', () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), mockery, '', 'grok');
  expect(result.assessments.snark_edgy_tone.status).toBe('insufficient_context');
  expect(result.scores.snark_edgy_tone).toBe(0);
  expect(result.findings).toEqual([]);
});

test.each(ANALYSIS_SOURCES.filter((source) => source !== 'grok'))('does not apply the Grok-only lens to %s', (source) => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), mockery, neutralPrompt, source);
  expect(result.assessments.snark_edgy_tone.status).toBe(source === 'unknown' ? 'insufficient_context' : 'not_applicable');
  expect(result.scores.snark_edgy_tone).toBe(0);
});

test('quotes actual mockery and exposes its fixed heuristic index and independent confidence', () => {
  const baseline = emptyAnalysisResult();
  const response = `${mockery} Remove the comma.`;
  const result = applyLocalPromptComparison(baseline, response, neutralPrompt, 'grok');
  expect(result.scores.snark_edgy_tone).toBe(75);
  expect(result.assessments.snark_edgy_tone).toMatchObject({ status: 'assessed', method: 'lexical_rule', confidence: 'medium' });
  expect(result.findings).toEqual([expect.objectContaining({ category: 'Snark / Edgy Tone', text: 'Wow, genius.', severity: 'medium', confidence: 'medium' })]);
  expect(baseline).toEqual(emptyAnalysisResult());
});

test.each([
  'The compiler is playing hide-and-seek. Remove the comma.',
  'Congratulations, you managed to fix the bug. Nice work.',
  'The parser rejects this token; remove the comma.',
  'This is wrong. The return type must be an integer.',
  'The phrase "Wow, genius" is an example of mockery.',
  '`Did you even read the instructions?` is a test string.',
  '> Wow, genius.',
])('does not conflate friendly joking, dry directness or reported text with ridicule: %s', (response) => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), response, neutralPrompt, 'grok');
  expect(result.scores.snark_edgy_tone).toBe(0);
  expect(result.assessments.snark_edgy_tone.status).toBe('assessed');
});

test('requested sarcasm permits playful asides but does not authorize directed ridicule', () => {
  const prompt = 'Explain the compiler error with playful sarcasm.';
  const friendly = applyLocalPromptComparison(emptyAnalysisResult(), 'What could possibly go wrong? Remove the comma.', prompt, 'grok');
  const uninvited = applyLocalPromptComparison(emptyAnalysisResult(), 'What could possibly go wrong? Remove the comma.', neutralPrompt, 'grok');
  const directed = applyLocalPromptComparison(emptyAnalysisResult(), mockery, prompt, 'grok');
  expect(friendly.scores.snark_edgy_tone).toBe(0);
  expect(uninvited.scores.snark_edgy_tone).toBe(75);
  expect(directed.scores.snark_edgy_tone).toBe(75);
});

test('only an explicit non-negated self-roast request makes directed ridicule inapplicable', () => {
  const requested = applyLocalPromptComparison(emptyAnalysisResult(), mockery, 'Roast me for my debugging mistake.', 'grok');
  expect(requested.assessments.snark_edgy_tone.status).toBe('not_applicable');
  expect(requested.scores.snark_edgy_tone).toBe(0);
  for (const prompt of ['Do not roast me. Explain the error.', 'Explain the phrase "Roast me".', 'Explain whether sarcasm is useful.', 'Roast the compiler, not me.']) {
    expect(applyLocalPromptComparison(emptyAnalysisResult(), mockery, prompt, 'grok').scores.snark_edgy_tone).toBe(75);
  }
});

test('recomparison and history validation remove stale upstream snark claims', () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), mockery, neutralPrompt, 'grok');
  const clean = applyLocalPromptComparison(result, 'The parser rejects the comma.', neutralPrompt, 'grok');
  expect(clean.scores.snark_edgy_tone).toBe(0);
  expect(clean.findings).toEqual([]);
  const restored = validateAnalysisResult(result);
  expect(restored.scores.snark_edgy_tone).toBe(0);
  expect(restored.assessments.snark_edgy_tone.status).toBe('insufficient_context');
  expect(restored.findings).toEqual([]);
});
