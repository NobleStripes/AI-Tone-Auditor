import { expect, test } from 'vitest';
import { CATEGORY_REGISTRY, SCORE_KEYS, RISK_CATEGORIES, QUALITY_CATEGORIES, TONE_CATEGORIES, TRIGGER_WORDS, createEmptyScores } from '../../src/constants';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { ANALYSIS_RESULT_JSON_SCHEMA } from '../../src/services/analysisSchema';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';

test('every category reaches defaults, schema, normalization and local output', async () => {
  const result = await localHeuristicProvider.analyzeTone({ text: 'The array contains two items.', context: { promptVersion: 'test' } });
  expect(new Set(SCORE_KEYS).size).toBe(CATEGORY_REGISTRY.length);
  for (const scores of [createEmptyScores(), emptyAnalysisResult().scores, validateAnalysisResult(null).scores, result.scores]) {
    expect(Object.keys(scores)).toEqual(SCORE_KEYS);
  }
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.scores.required).toEqual(SCORE_KEYS);
  expect(Object.keys(ANALYSIS_RESULT_JSON_SCHEMA.properties.scores.properties)).toEqual(SCORE_KEYS);
  expect(QUALITY_CATEGORIES.map(({ id }) => id)).toEqual(['refusal_quality']);
  expect(RISK_CATEGORIES.some(({ id }) => id as string === 'refusal_quality')).toBe(false);
});

test.each([
  ["I'm sorry you feel that way", 'Dismissive', 'dismissive'],
  ["Let's take a step back", 'Forced De-escalation', 'de_escalation'],
  ["Let's keep this professional", 'Forced De-escalation', 'de_escalation'],
  ['Calm down', 'Forced De-escalation', 'de_escalation'],
  ['I encourage you to', 'Infantilizing', 'infantilizing'],
  ['It is not appropriate to', 'Infantilizing', 'infantilizing'],
  ['I must insist', 'Infantilizing', 'infantilizing'],
  ["I'm not comfortable", 'Infantilizing', 'infantilizing'],
  ['I need to set a boundary', 'Infantilizing', 'infantilizing'],
  ['While I appreciate your', 'Dismissive', 'dismissive'],
  ["Let's focus on", 'Dismissive', 'dismissive'],
  ['I appreciate your understanding', 'Dismissive', 'dismissive'],
  ['In the interest of', 'Repetitive Filler', 'repetitive_filler'],
  ["I'm happy to help", 'Repetitive Filler', 'repetitive_filler'],
  ["I'm committed to", 'Repetitive Filler', 'repetitive_filler'],
  ['Thanks for your patience', 'Repetitive Filler', 'repetitive_filler'],
  ["I'm afraid", 'Hedging', 'hedging'],
])('routes former catch-all marker "%s" to %s', async (text, category, scoreId) => {
  expect(TRIGGER_WORDS.find(({ word }) => word === text)?.category).toBe(category);
  const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
  expect(result.scores[scoreId]).toBeGreaterThan(0);
  expect(result.scores.karen_trigger).toBe(0);
  expect(result.findings).toEqual([expect.objectContaining({ category, text })]);
});

test('stonewalling retains its legacy score ID without the catch-all definition', () => {
  expect(TONE_CATEGORIES.BUREAUCRATIC_STONEWALLING.id).toBe('karen_trigger');
  expect(TONE_CATEGORIES.BUREAUCRATIC_STONEWALLING.description).not.toMatch(/moralizing|entitlement/i);
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.personalization.required).toContain('stonewallingRemediation');
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.personalization.required).not.toContain('karenRemediation');
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.personalization.properties).toHaveProperty('stonewallingRemediation');
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.personalization.properties).not.toHaveProperty('karenRemediation');
});

test('tone-policing weights are applied once instead of overwritten or doubled', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: "Calm down. Let's keep this professional.",
    context: { promptVersion: 'test' },
  });
  expect(result.scores.de_escalation).toBe(Math.round((2.5 + 2.6) * 13));
  expect(result.scores.karen_trigger).toBe(0);
});