import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { providerParityFixture } from '../fixtures/providerParity.fixture';

const SCORE_KEYS = ['gaslighting', 'infantilizing', 'de_escalation', 'karen_trigger', 'hedging', 'dismissive'] as const;

function topCategory(scores: Record<string, number>): string {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

test('normalizes Gemini/OpenAI fixtures to full contract', () => {
  const geminiResult = validateAnalysisResult(providerParityFixture.geminiRaw);
  const openaiResult = validateAnalysisResult(providerParityFixture.openaiRaw);

  for (const result of [geminiResult, openaiResult]) {
    for (const key of SCORE_KEYS) {
      assert.equal(typeof result.scores[key], 'number');
      assert.ok(result.scores[key] >= 0 && result.scores[key] <= 100, `score ${key} should be 0-100`);
    }

    assert.ok(result.summary.length > 0);
    assert.ok(result.overallTone.length > 0);
    assert.ok(Array.isArray(result.findings));
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(Array.isArray(result.personalization.customInstructions));
    assert.ok(Array.isArray(result.contextAnalysis.heatmap));
    assert.ok(Array.isArray(result.euphemisms));
  }
});

test('keeps top category consistent across provider fixtures', () => {
  const geminiResult = validateAnalysisResult(providerParityFixture.geminiRaw);
  const openaiResult = validateAnalysisResult(providerParityFixture.openaiRaw);

  assert.equal(topCategory(geminiResult.scores), providerParityFixture.expectedTopCategory);
  assert.equal(topCategory(openaiResult.scores), providerParityFixture.expectedTopCategory);
});

test('keeps category deltas within parity tolerance', () => {
  const geminiResult = validateAnalysisResult(providerParityFixture.geminiRaw);
  const openaiResult = validateAnalysisResult(providerParityFixture.openaiRaw);

  for (const key of SCORE_KEYS) {
    const delta = Math.abs(geminiResult.scores[key] - openaiResult.scores[key]);
    assert.ok(delta <= 15, `${key} delta exceeds tolerance: ${delta}`);
  }
});
