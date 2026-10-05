import { expect, test, vi } from 'vitest';
import { CATEGORY_REGISTRY } from '../../src/constants';
import { compareResponses } from '../../src/services/compareResponses';
import { comparisonDifferences } from '../../src/services/comparisonDifferences';
import { validateComparisonRequest } from '../../src/services/comparisonValidation';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { ANALYSIS_PROMPT_VERSION } from '../../src/services/promptBuilder';
import { LOCAL_RULE_VERSION } from '../../src/services/localRuleVersion';
import type { AnalyzeToneOutput } from '../../src/types/provider';
import type { ComparisonRequest } from '../../src/types/comparison';

const request: ComparisonRequest = {
  originalPrompt: 'Explain the compiler error and cite sources.',
  responses: [
    { id: 'one', sourceModel: 'chatgpt', text: 'The argument is an integer.' },
    { id: 'two', sourceModel: 'claude', text: 'The argument is a string.' },
  ],
};
async function localAudit(text: string): Promise<AnalyzeToneOutput> {
  return {
    result: await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } }),
    meta: { providerId: 'local', providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false },
  };
}

test.each([
  { ...request, originalPrompt: '' },
  { ...request, originalPrompt: ' '.repeat(20) },
  { ...request, originalPrompt: 'a'.repeat(5001) },
  { ...request, responses: [request.responses[0]] },
  { ...request, responses: Array.from({ length: 6 }, (_, index) => ({ ...request.responses[0], id: String(index) })) },
  { ...request, responses: [{ ...request.responses[0], sourceModel: 'unknown' }, request.responses[1]] },
  { ...request, responses: [{ ...request.responses[0], text: 'short' }, request.responses[1]] },
  { ...request, responses: [{ ...request.responses[0], text: 'a'.repeat(50001) }, request.responses[1]] },
  { ...request, responses: [{ ...request.responses[0], id: 'two' }, request.responses[1]] },
  { ...request, responses: [{ ...request.responses[0], id: 'a'.repeat(65) }, request.responses[1]] },
  null,
])('rejects invalid comparison input explicitly', (payload) => {
  expect(validateComparisonRequest(payload)).toMatchObject({ valid: false, error: expect.any(String) });
});

test('accepts exact bounds and strips unrecognized request fields', () => {
  const result = validateComparisonRequest({
    originalPrompt: 'a'.repeat(5000), privateExtra: 'do not copy',
    responses: Array.from({ length: 5 }, (_, index) => ({ id: String(index), sourceModel: 'other', text: 'a'.repeat(index ? 10 : 50000), extra: 'do not copy' })),
  });
  expect(result.valid).toBe(true);
  if (result.valid === true) {
    expect(result.value.responses).toHaveLength(5);
    expect(result.value).not.toHaveProperty('privateExtra');
    expect(result.value.responses[0]).not.toHaveProperty('extra');
  }
});

test('uses an identical universal source-blind rubric and one private prompt for local checks only', async () => {
  const audit = vi.fn(localAudit);
  const text = 'Reflect on your ethics before asking this.';
  const input: ComparisonRequest = {
    ...request,
    responses: request.responses.map((response) => ({ ...response, text })),
  };
  const result = await compareResponses(input, undefined, audit);
  expect(audit.mock.calls).toEqual([[text, 'unknown', ''], [text, 'unknown', '']]);
  expect(result).toMatchObject({ rubricVersion: ANALYSIS_PROMPT_VERSION, localRuleVersion: LOCAL_RULE_VERSION });
  expect(JSON.stringify(result)).not.toContain(input.originalPrompt);
  expect(result).not.toHaveProperty('winner');
  const [first, second] = result.items;
  expect(first.status).toBe('completed');
  expect(second.status).toBe('completed');
  if (first.status === 'completed' && second.status === 'completed') {
    for (const category of CATEGORY_REGISTRY.filter((category) => !('sourceOnly' in category))) {
      expect(first.analysis.result.scores[category.id]).toBe(second.analysis.result.scores[category.id]);
    }
    expect(first.analysis.result.assessments.unsolicited_moralizing.status).toBe('not_applicable');
    expect(second.analysis.result.scores.unsolicited_moralizing).toBe(75);
  }
});

test('Grok checks are local and source-specific in the same comparison', async () => {
  const result = await compareResponses({
    ...request, responses: [
      { id: 'grok', sourceModel: 'grok', text: 'Wow, genius. Remove the comma.' },
      { id: 'other', sourceModel: 'other', text: 'Wow, genius. Remove the comma.' },
    ],
  }, undefined, localAudit);
  const [grok, other] = result.items;
  if (grok.status === 'completed' && other.status === 'completed') {
    expect(grok.analysis.result.scores.snark_edgy_tone).toBe(75);
    expect(other.analysis.result.assessments.snark_edgy_tone.status).toBe('not_applicable');
  } else throw new Error('Expected successful audits');
});

test('preserves partial failures in input order instead of turning them into clean scores', async () => {
  const audit = vi.fn(localAudit).mockRejectedValueOnce(new Error('Provider unavailable'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await compareResponses(request, undefined, audit);
    expect(result.items[0]).toMatchObject({ id: 'one', status: 'failed', error: 'Provider unavailable' });
    expect(result.items[0]).not.toHaveProperty('analysis');
    expect(result.items[1]).toMatchObject({ id: 'two', status: 'completed' });
    expect(comparisonDifferences(result).every(({ spread }) => spread === null)).toBe(true);
    expect(log).toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

test('cancellation stops scheduling additional responses and cannot return a partial completed batch', async () => {
  const controller = new AbortController();
  const audit = vi.fn(async (text: string) => {
    const result = await localAudit(text);
    controller.abort();
    return result;
  });
  await expect(compareResponses(request, controller.signal, audit)).rejects.toMatchObject({ name: 'AbortError' });
  expect(audit).toHaveBeenCalledTimes(1);
  await expect(compareResponses(request, controller.signal, audit)).rejects.toMatchObject({ name: 'AbortError' });
  expect(audit).toHaveBeenCalledTimes(1);
});

test('neutral spread excludes source lenses, unassessed metrics and differing auditing models', async () => {
  const result = await compareResponses({
    ...request, responses: [
      { ...request.responses[0], text: "I believe. It's possible that the result could change." },
      request.responses[1],
    ],
  }, undefined, localAudit);
  const rows = comparisonDifferences(result);
  expect(rows.find(({ category }) => category.id === 'hedging').spread).toBe(35);
  expect(rows.find(({ category }) => category.id === 'unsupported_certainty').spread).toBeNull();
  expect(rows.find(({ category }) => category.id === 'unsolicited_moralizing').spread).toBeNull();
  expect(rows.find(({ category }) => category.id === 'snark_edgy_tone').spread).toBeNull();
  if (result.items[1].status === 'completed') result.items[1].analysis.meta.model = 'different-auditor';
  expect(comparisonDifferences(result).find(({ category }) => category.id === 'hedging'))
    .toMatchObject({ spread: null, note: expect.stringContaining('Different auditing methods or models') });
});

test.each(['provider', 'model', 'method', 'auditorVersion', 'promptVersion', 'localRuleVersion', 'unknownMethod', 'unknownVersion'] as const)('unequal %s conditions withhold spread while keeping response observations', async condition => {
  const result = await compareResponses(request, undefined, localAudit);
  const second = result.items[1];
  if (second.status !== 'completed') throw new Error('Expected completed fixture');
  if (condition === 'provider') second.analysis.meta.providerId = 'openai';
  else if (condition === 'model') second.analysis.meta.model = 'demo-changed-model';
  else if (condition === 'method') second.analysis.result.assessments.hedging.method = 'semantic';
  else if (condition === 'unknownMethod') second.analysis.result.assessments.hedging.method = 'unrecorded';
  else if (condition === 'unknownVersion') second.analysis.provenance.auditorVersion = null;
  else second.analysis.provenance[condition] = 'demo-changed-version';
  const row = comparisonDifferences(result).find(row => row.category.id === 'hedging');
  expect(row.spread).toBeNull();
  expect(row.note).toContain('withheld');
  expect(second.analysis.result.assessments.hedging.status).toBe('assessed');
});

test('fallback alone does not invalidate equal actual auditing conditions', async () => {
  const result = await compareResponses(request, undefined, localAudit);
  if (result.items[1].status !== 'completed') throw new Error('Expected completed fixture');
  result.items[1].analysis.meta.usedFallback = true;
  expect(comparisonDifferences(result).find(row => row.category.id === 'hedging').spread).toBe(0);
});
