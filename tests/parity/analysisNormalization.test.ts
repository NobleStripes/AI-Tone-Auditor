import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';

test('normalizes legacy category labels while preserving the stored score key', () => {
  for (const category of ['Karen Trigger', 'Karen Triggers', ' karen trigger ', 'Bureaucratic Stonewalling']) {
    const result = validateAnalysisResult({
      scores: { karen_trigger: 75 },
      findings: [{ category, text: 'As an AI language model', explanation: 'Example', severity: 'medium' }],
    });
    assert.equal(result.findings[0].category, 'Bureaucratic Stonewalling');
    assert.equal(result.scores.karen_trigger, 75);
  }
});

test('defaults the moralizing score to zero for legacy payloads', () => {
  const result = validateAnalysisResult({ scores: { hedging: 25 } });
  assert.equal(result.scores.unsolicited_moralizing, 0);
  assert.equal(result.scores.hedging, 25);
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
