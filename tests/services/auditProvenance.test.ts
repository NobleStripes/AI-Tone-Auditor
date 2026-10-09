import { afterEach, expect, test, vi } from 'vitest';
import { AUDITOR_VERSION, createAnalysisProvenance, normalizeAnalysisProvenance } from '../../src/services/auditProvenance';
import { createAuditExport, createComparisonExport } from '../../src/services/exportReport';
import { ANALYSIS_PROMPT_VERSION } from '../../src/services/promptBuilder';
import { LOCAL_RULE_VERSION } from '../../src/services/localRuleVersion';
import { analyzeTone } from '../../src/services/analyzeTone';
import { compareResponses } from '../../src/services/compareResponses';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { parseAuditHistory } from '../../src/types/history';
import type { ProviderRuntimeMeta } from '../../src/types/provider';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const meta: ProviderRuntimeMeta = { providerId: 'local', providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };

test('records stable audit provenance, while repeated exports get their own UTC export timestamp', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T02:00:00Z'));
  const provider = { ...meta };
  const provenance = createAnalysisProvenance(provider, 'grok', 'session-1');
  provider.model = 'changed-after-analysis';
  vi.setSystemTime(new Date('2026-10-06T02:00:00Z'));
  const report = createAuditExport(emptyAnalysisResult(), provenance);
  expect(report.exportMetadata).toEqual({
    schemaVersion: '1.1.0', auditorVersion: AUDITOR_VERSION, exporterVersion: AUDITOR_VERSION,
    promptVersion: ANALYSIS_PROMPT_VERSION, localRuleVersion: LOCAL_RULE_VERSION,
    analysisProvider: meta, selectedSourceModel: 'grok',
    analyzedAt: '2026-10-05T02:00:00.000Z', exportedAt: '2026-10-06T02:00:00.000Z',
    comparisonSessionId: 'session-1', assessmentContext: 'live', originalPromptIncluded: false,
  });
  vi.setSystemTime(new Date('2026-10-07T02:00:00Z'));
  const again = createAuditExport(emptyAnalysisResult(), provenance);
  expect(again.exportMetadata.analyzedAt).toBe(report.exportMetadata.analyzedAt);
  expect(again.exportMetadata.exportedAt).not.toBe(report.exportMetadata.exportedAt);
});

test('does not retroactively assign current versions or audit timestamps to legacy results', () => {
  const provenance = normalizeAnalysisProvenance(undefined, meta, 'claude', 'restored_without_prompt');
  const report = createAuditExport(emptyAnalysisResult(), provenance);
  expect(report.exportMetadata).toMatchObject({
    auditorVersion: null, promptVersion: null, localRuleVersion: null, analyzedAt: null,
    analysisProvider: meta, selectedSourceModel: 'claude', assessmentContext: 'restored_without_prompt',
  });
  expect(report.exportMetadata.exportedAt).toEqual(expect.any(String));
  expect(Object.keys(report.assessments)).toEqual(Object.keys(report.scores));
});

test('history retains provenance but explicitly reports that context-dependent assessments were reset', () => {
  const data = emptyAnalysisResult();
  data.scores.grounding_avoidance = 75;
  data.assessments.grounding_avoidance = { status: 'assessed', reason: 'A visible hand-off.', confidence: 'medium', method: 'lexical_rule' };
  const provenance = createAnalysisProvenance(meta, 'claude');
  const entry = parseAuditHistory(JSON.stringify([{
    id: 'saved', title: 'Saved', timestamp: 123, sourceModel: 'claude', responseText: 'You should verify this yourself.', data, meta, provenance,
  }]))[0];
  expect(entry.provenance).toEqual({ ...provenance, assessmentContext: 'restored_without_prompt' });
  expect(entry.data.assessments.grounding_avoidance.status).toBe('insufficient_context');
  expect(createAuditExport(entry.data, entry.provenance).exportMetadata.analyzedAt).toBe(provenance.analyzedAt);
});

test('malformed or extra provenance fields cannot invent valid timestamps or export private context', () => {
  const provenance = normalizeAnalysisProvenance({
    auditorVersion: 99, analyzedAt: 'invalid date', selectedSourceModel: 'invented',
    assessmentContext: 'invented', originalPrompt: 'Private context', analysisProvider: { providerId: 'invented' },
  });
  expect(provenance).toMatchObject({ auditorVersion: null, analyzedAt: null, selectedSourceModel: 'unknown', assessmentContext: 'unrecorded', analysisProvider: null });
  expect(JSON.stringify(provenance)).not.toContain('Private context');
});

test.each([false, true])('records the actual successful provider/model and selected source (fallback=%s)', async (fallback) => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  vi.stubEnv('AI_PROVIDER_RETRIES', '0');
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '0');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('OPENAI_MODEL', 'primary-auditor-at-request');
  vi.stubEnv('ANTHROPIC_MODEL', 'fallback-auditor-at-request');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init.body));
    if (fallback && body.model === 'primary-auditor-at-request') return new Response('Primary unavailable', { status: 400 });
    const text = JSON.stringify(emptyAnalysisResult());
    process.env.OPENAI_MODEL = 'changed-after-request';
    process.env.ANTHROPIC_MODEL = 'changed-after-request';
    return new Response(JSON.stringify(fallback
      ? { stop_reason: 'end_turn', content: [{ type: 'text', text }] }
      : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const output = await analyzeTone('A technical response.', 'grok', 'Explain this error.');
  expect(output.provenance).toMatchObject({
    auditorVersion: AUDITOR_VERSION, promptVersion: ANALYSIS_PROMPT_VERSION, localRuleVersion: LOCAL_RULE_VERSION,
    selectedSourceModel: 'grok', assessmentContext: 'live',
    analysisProvider: { providerId: fallback ? 'anthropic' : 'openai', model: fallback ? 'fallback-auditor-at-request' : 'primary-auditor-at-request', usedFallback: fallback },
  });
  expect(output.provenance.analysisProvider).toEqual(output.meta);
  expect(Number.isNaN(Date.parse(output.provenance.analyzedAt))).toBe(false);
  expect(warning).toHaveBeenCalledTimes(fallback ? 1 : 0);
});

test('comparison exports share one stable session ID and retain per-response provenance', async () => {
  const input = {
    originalPrompt: 'Search the web for the current rate.',
    responses: [
      { id: 'one', sourceModel: 'chatgpt' as const, text: 'The current rate is 17 percent.' },
      { id: 'two', sourceModel: 'grok' as const, text: 'You should look this up yourself.' },
    ],
  };
  const comparison = await compareResponses(input, undefined, async () => ({ result: emptyAnalysisResult(), meta }));
  expect(comparison.sessionId).toMatch(/^[a-f0-9-]{36}$/);
  expect(comparison.auditorVersion).toBe(AUDITOR_VERSION);
  expect(Date.parse(comparison.completedAt)).toBeGreaterThanOrEqual(Date.parse(comparison.startedAt));
  for (const item of comparison.items) {
    expect(item.status).toBe('completed');
    if (item.status === 'completed') {
      const report = createAuditExport(item.analysis.result, item.analysis.provenance);
      expect(report.exportMetadata.comparisonSessionId).toBe(comparison.sessionId);
      expect(report.exportMetadata.selectedSourceModel).toBe(item.sourceModel);
      expect(report.exportMetadata.analysisProvider).toEqual(meta);
    }
  }
  const report = createComparisonExport(comparison);
  expect(report.exportMetadata.comparisonSessionId).toBe(comparison.sessionId);
  expect(report.exportMetadata.promptVersion).toBe(comparison.rubricVersion);
  expect(createComparisonExport(comparison).exportMetadata.comparisonSessionId).toBe(comparison.sessionId);
  expect(JSON.stringify(report)).not.toContain(input.originalPrompt);
});
