import { expect, test } from 'vitest';
import { TRIGGER_WORDS } from '../../src/constants';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { compareResponses } from '../../src/services/compareResponses';
import { comparisonDifferences } from '../../src/services/comparisonDifferences';
import { DEMO_COMPARISON } from '../fixtures/demoComparison.fixture';

const unsupportedIntentClaims = /\b(?:feigned|pretending|hidden protocols|used to avoid|used to invalidate|to undermine their argument|the AI (?:assumes|thinks|finds|oversteps|drops)|almost always|false 'helpful')\b/i;

test('trigger explanations avoid the known unobservable intent claims', () => {
  for (const trigger of TRIGGER_WORDS) {
    expect(trigger.explanation, trigger.word).not.toMatch(unsupportedIntentClaims);
  }
});

test('reported wording matches retain context caveats rather than diagnosing motive', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: "I'm not sure I follow. My programming prevents it. Calm down.",
    context: { promptVersion: 'test' },
  });
  expect(result.findings).toHaveLength(3);
  expect(result.findings.every(finding => !unsupportedIntentClaims.test(finding.explanation))).toBe(true);
  expect(result.summary).toContain('not verified judgments of intent');
  expect(result.findings.find(finding => finding.text === "I'm not sure I follow").explanation).toContain('genuine uncertainty is possible');
});

test('worked comparison uses authored samples and records the documented local indices', async () => {
  const comparison = await compareResponses(DEMO_COMPARISON, undefined, async text => ({
    result: await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } }),
    meta: { providerId: 'local', providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false },
  }));
  const expected = [
    { infantilizing: 0, de_escalation: 0, hedging: 0, needless_escalation: 0, snark_edgy_tone: 0 },
    { infantilizing: 32, de_escalation: 0, hedging: 0, needless_escalation: 0, snark_edgy_tone: 0 },
    { infantilizing: 31, de_escalation: 33, hedging: 19, needless_escalation: 75, snark_edgy_tone: 0 },
    { infantilizing: 0, de_escalation: 0, hedging: 0, needless_escalation: 0, snark_edgy_tone: 75 },
  ];
  comparison.items.forEach((item, index) => {
    expect(item.status).toBe('completed');
    if (item.status === 'completed') {
      expect(item.analysis.result.scores).toMatchObject(expected[index]);
      expect(item.analysis.result.assessments.unsupported_certainty.status).toBe('not_assessed');
      expect(item.analysis.result.assessments.refusal_quality.status).toBe('not_applicable');
    }
  });
  const rows = comparisonDifferences(comparison);
  expect(rows.find(row => row.category.id === 'infantilizing').spread).toBe(32);
  expect(rows.find(row => row.category.id === 'snark_edgy_tone').spread).toBeNull();
});
