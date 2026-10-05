import { expect, test } from 'vitest';
import { CATEGORY_REGISTRY, CONTEXT_REQUIRED_SCORE_KEYS, SCORE_KEYS } from '../../src/constants';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { ANALYSIS_RESULT_JSON_SCHEMA } from '../../src/services/analysisSchema';

test('every score has state metadata and belongs to exactly one diagnostic group', () => {
  expect(Object.keys(emptyAnalysisResult().assessments)).toEqual(SCORE_KEYS);
  expect(ANALYSIS_RESULT_JSON_SCHEMA.properties.assessments.required).toEqual(SCORE_KEYS);
  expect(Object.keys(ANALYSIS_RESULT_JSON_SCHEMA.properties.assessments.properties)).toEqual(SCORE_KEYS);
  expect(CATEGORY_REGISTRY.every(({ group }) => ['communication', 'contextual', 'epistemic', 'quality'].includes(group))).toBe(true);
});

test('an assessed zero is distinct from a legacy zero with no recorded assessment', () => {
  const raw = emptyAnalysisResult();
  raw.assessments.hedging = { status: 'assessed', reason: 'No hedging found.', confidence: 'high', method: 'semantic' };
  const result = validateAnalysisResult(raw);
  expect(result.scores.hedging).toBe(0);
  expect(result.assessments.hedging.status).toBe('assessed');
  const legacy = validateAnalysisResult({ scores: { hedging: 0, karen_trigger: 75 } });
  expect(legacy.assessments.hedging.status).toBe('not_assessed');
  expect(legacy.assessments.karen_trigger.confidence).toBe('unknown');
  expect(legacy.scores.karen_trigger).toBe(75);
});

test('does not assess a missing or non-finite score or accept invalid confidence', () => {
  for (const value of [undefined, NaN, Infinity, '75']) {
    const result = validateAnalysisResult({
      scores: { hedging: value },
      assessments: { hedging: { status: 'assessed', confidence: 'high', method: 'semantic' } },
    });
    expect(result.assessments.hedging.status).toBe('not_assessed');
    expect(result.assessments.hedging.confidence).toBe('unknown');
  }
  const result = validateAnalysisResult({
    scores: { hedging: 75 },
    assessments: { hedging: { status: 'assessed', confidence: 0.75, method: 'invalid' } },
    findings: [{ category: 'Hedging', text: 'Perhaps', severity: 'high', confidence: 'low', method: 'semantic' }],
  });
  expect(result.assessments.hedging.confidence).toBe('unknown');
  expect(result.assessments.hedging.method).toBe('unrecorded');
  expect(result.findings[0]).toMatchObject({ severity: 'high', confidence: 'low' });
});

test('missing original prompt invalidates all five contextual assessments, not just scores', () => {
  const raw = emptyAnalysisResult();
  for (const key of CONTEXT_REQUIRED_SCORE_KEYS) {
    raw.scores[key] = 75;
    raw.assessments[key] = { status: 'assessed', reason: 'Claimed assessment.', confidence: 'high', method: 'semantic' };
  }
  for (const result of [validateAnalysisResult(raw), applyLocalPromptComparison(raw, 'Calm down.', '')]) {
    for (const key of CONTEXT_REQUIRED_SCORE_KEYS) {
      expect(result.scores[key]).toBe(0);
      expect(result.assessments[key].status).toBe('insufficient_context');
      expect(result.assessments[key].confidence).toBe('unknown');
    }
  }
});

test('grounding clean and detected outcomes are assessed only for an explicit requirement', () => {
  const clean = applyLocalPromptComparison(emptyAnalysisResult(), 'The answer is 42 [1].', 'Answer and cite sources.');
  const detected = applyLocalPromptComparison(emptyAnalysisResult(), 'The answer is 42.', 'Answer and cite sources.');
  const inapplicable = applyLocalPromptComparison(emptyAnalysisResult(), 'The answer is 42.', 'Answer this.');
  expect(clean.scores.grounding_avoidance).toBe(0);
  expect(clean.assessments.grounding_avoidance.status).toBe('assessed');
  expect(detected.scores.grounding_avoidance).toBe(75);
  expect(detected.assessments.grounding_avoidance).toMatchObject({ status: 'assessed', confidence: 'medium', method: 'lexical_rule' });
  expect(inapplicable.assessments.grounding_avoidance.status).toBe('not_applicable');
  expect(clean.assessments.unsupported_certainty.status).toBe('not_assessed');
  expect(clean.assessments.unsupported_certainty.reason).toMatch(/not independently verified/);
});

test('needless escalation and moralizing distinguish clean checks from inapplicable lenses', () => {
  const clean = applyLocalPromptComparison(emptyAnalysisResult(), 'The array has two items.', 'Explain this code.', 'claude');
  expect(clean.assessments.needless_escalation.status).toBe('assessed');
  expect(clean.assessments.unsolicited_moralizing.status).toBe('assessed');
  expect(clean.scores.needless_escalation).toBe(0);
  expect(clean.scores.unsolicited_moralizing).toBe(0);
  const distressed = applyLocalPromptComparison(emptyAnalysisResult(), 'Take a deep breath.', 'I am panicking.', 'claude');
  expect(distressed.assessments.needless_escalation.status).toBe('not_applicable');
  const requested = applyLocalPromptComparison(emptyAnalysisResult(), 'Reflect on your ethics.', 'Discuss the ethical implications.', 'claude');
  expect(requested.assessments.unsolicited_moralizing.status).toBe('not_applicable');
  const other = applyLocalPromptComparison(emptyAnalysisResult(), 'Reflect on your ethics.', 'Explain the code.', 'chatgpt');
  expect(other.assessments.unsolicited_moralizing.status).toBe('not_applicable');
  const unknown = applyLocalPromptComparison(emptyAnalysisResult(), 'Reflect on your ethics.', 'Explain the code.');
  expect(unknown.assessments.unsolicited_moralizing.status).toBe('insufficient_context');
});

test('refusal quality is assessed only for a detected refusal with original context', () => {
  const noRefusal = applyLocalPromptComparison(emptyAnalysisResult(), 'Here is the answer.', 'Answer this.');
  expect(noRefusal.assessments.refusal_quality.status).toBe('not_applicable');
  const refusal = applyLocalPromptComparison(emptyAnalysisResult(), "I can't help with that.", 'Do this.');
  expect(refusal.assessments.refusal_quality).toMatchObject({ status: 'assessed', method: 'lexical_rule', confidence: 'medium' });
  expect(refusal.scores.refusal_quality).toBe(20);
  expect(refusal.findings[0]).toMatchObject({ severity: 'high', confidence: 'medium', method: 'lexical_rule' });
});

test('recomparison resets stale scores, findings and states without mutating the input', () => {
  const detected = applyLocalPromptComparison(emptyAnalysisResult(), 'Calm down. Reflect on your ethics.', 'Explain the code and cite sources.', 'claude');
  expect(detected.scores.grounding_avoidance).toBe(75);
  expect(detected.scores.needless_escalation).toBe(75);
  expect(detected.scores.unsolicited_moralizing).toBe(75);
  const clean = applyLocalPromptComparison(detected, 'The result is 42 [1].', 'Explain the code and cite sources.', 'claude');
  expect(clean.findings).toEqual([]);
  expect(clean.scores.grounding_avoidance).toBe(0);
  expect(clean.scores.needless_escalation).toBe(0);
  expect(clean.scores.unsolicited_moralizing).toBe(0);
  expect(detected.scores.grounding_avoidance).toBe(75);
  expect(applyLocalPromptComparison(clean, 'The result is 42 [1].', 'Explain the code and cite sources.', 'claude')).toEqual(clean);
});

test('local phrase scores and findings explicitly report lexical match confidence', async () => {
  const result = await localHeuristicProvider.analyzeTone({ text: 'This is just a note.', context: { promptVersion: 'test' } });
  expect(result.assessments.dismissive).toMatchObject({ status: 'assessed', method: 'lexical_rule', confidence: 'high' });
  expect(result.findings[0]).toMatchObject({ severity: 'low', confidence: 'high', method: 'lexical_rule' });
  expect(result.assessments.unsupported_certainty.status).toBe('insufficient_context');
});
