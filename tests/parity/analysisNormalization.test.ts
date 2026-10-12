import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';

test('normalizes legacy category labels while preserving the stored score key', () => {
  for (const category of ['Karen Trigger', 'Karen Triggers', ' karen trigger ', 'Bureaucratic Stonewalling']) {
    const result = validateAnalysisResult({
      scores: { karen_trigger: 75 },
      assessments: { karen_trigger: { status: 'assessed', reason: 'Verified fixture quotation.', method: 'semantic', confidence: 'high' } },
      findings: [{ category, text: 'As an AI language model', explanation: 'Example', severity: 'medium' }],
    }, { responseText: 'As an AI language model', assessmentMethod: 'semantic' });
    assert.equal(result.findings[0].category, 'Bureaucratic Stonewalling');
    assert.equal(result.scores.karen_trigger, 75);
  }
});

test('legacy numeric scores alone do not prove assessment', () => {
  const result = validateAnalysisResult({ scores: { hedging: 25 } });
  assert.equal(result.scores.unsolicited_moralizing, 0);
  assert.equal(result.scores.hedging, 0);
  assert.equal(result.assessments.hedging.status, 'not_assessed');
});

test('migrates remediation text and emits only the new field', () => {
  for (const personalization of [
    { karenRemediation: 'Saved adjustment' },
    { stonewallingRemediation: 'Saved adjustment' },
    { stonewallingRemediation: 'Saved adjustment', karenRemediation: 'Superseded adjustment' },
    { stonewallingRemediation: null, karenRemediation: 'Saved adjustment' },
  ]) {
    const result = validateAnalysisResult({ personalization });
    assert.equal(result.personalization.stonewallingRemediation, 'Saved adjustment');
    assert.equal('karenRemediation' in result.personalization, false);
    assert.deepEqual(validateAnalysisResult(result), result);
  }
  assert.equal(validateAnalysisResult({
    personalization: { stonewallingRemediation: '', karenRemediation: 'Superseded adjustment' },
  }).personalization.stonewallingRemediation, '');
  assert.equal(validateAnalysisResult({
    personalization: { stonewallingRemediation: 42, karenRemediation: null },
  }).personalization.stonewallingRemediation, validateAnalysisResult(null).personalization.stonewallingRemediation);
});

test('maps legacy Nerdy base style to Efficient', () => {
  const result = validateAnalysisResult({
    personalization: {
      baseStyle: 'Nerdy',
      directness: 'Default',
      neutrality: 'Default',
      brevity: 'Default',
      humility: 'Default',
      karenRemediation: 'Example',
      customInstructions: [],
    },
  });

  assert.equal(result.personalization.baseStyle, 'Efficient');
});

test('falls back unknown base style to Default', () => {
  const result = validateAnalysisResult({
    personalization: {
      baseStyle: 'MyCustomMode',
      directness: 'Default',
      neutrality: 'Default',
      brevity: 'Default',
      humility: 'Default',
      karenRemediation: 'Example',
      customInstructions: [],
    },
  });

  assert.equal(result.personalization.baseStyle, 'Default');
});
