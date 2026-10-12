import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { providerParityFixture } from '../fixtures/providerParity.fixture';
import { SCORE_KEYS } from '../../src/constants';

function topCategory(scores: Record<string, number>): string {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function normalizeSupportedFixture(raw: typeof providerParityFixture.openaiRaw | typeof providerParityFixture.anthropicRaw) {
  return validateAnalysisResult({ ...raw,
    assessments: { karen_trigger: { status: 'assessed', reason: 'Authored fixture assessment of quoted wording.', method: 'semantic', confidence: 'high' } },
  }, { responseText: providerParityFixture.input, assessmentMethod: 'semantic' });
}

test('normalizes OpenAI/Anthropic fixtures to full contract', () => {
  const openaiResult = validateAnalysisResult(providerParityFixture.openaiRaw);
  const anthropicResult = validateAnalysisResult(providerParityFixture.anthropicRaw);

  for (const result of [openaiResult, anthropicResult]) {
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
  const openaiResult = normalizeSupportedFixture(providerParityFixture.openaiRaw);
  const anthropicResult = normalizeSupportedFixture(providerParityFixture.anthropicRaw);

  assert.equal(topCategory(openaiResult.scores), providerParityFixture.expectedTopCategory);
  assert.equal(topCategory(anthropicResult.scores), providerParityFixture.expectedTopCategory);
});

test('keeps supported category deltas within parity tolerance without treating legacy scores as assessed', () => {
  const openaiResult = normalizeSupportedFixture(providerParityFixture.openaiRaw);
  const anthropicResult = normalizeSupportedFixture(providerParityFixture.anthropicRaw);

  for (const key of SCORE_KEYS) {
    const delta = Math.abs(openaiResult.scores[key] - anthropicResult.scores[key]);
    assert.ok(delta <= 15, `${key} delta exceeds tolerance: ${delta}`);
    if (key !== 'karen_trigger') {
      assert.notEqual(openaiResult.assessments[key].status, 'assessed');
      assert.notEqual(anthropicResult.assessments[key].status, 'assessed');
    }
  }
});
