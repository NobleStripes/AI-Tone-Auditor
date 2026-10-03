import { expect, test } from 'vitest';
import { CATEGORY_REGISTRY, SCORE_KEYS, RISK_CATEGORIES, QUALITY_CATEGORIES, createEmptyScores } from '../../src/constants';
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