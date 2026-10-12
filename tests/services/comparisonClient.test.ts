import { afterEach, expect, test, vi } from 'vitest';
import { ApiRequestError, analyzeTone, compareToneResponses, getProviderTelemetrySnapshot } from '../../src/services/analyzeClient';
import type { ComparisonRequest } from '../../src/types/comparison';
import { createAnalysisProvenance } from '../../src/services/auditProvenance';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { setApiAccessKey } from '../../src/services/apiAccess';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';

afterEach(() => { vi.unstubAllGlobals(); setApiAccessKey(''); });
const input: ComparisonRequest = {
  originalPrompt: 'Explain the result.',
  responses: [
    { id: 'one', sourceModel: 'chatgpt', text: 'The answer is 42.' },
    { id: 'two', sourceModel: 'grok', text: 'The answer is 43.' },
  ],
};

test('posts one shared-prompt batch with cancellation and preserves response metadata', async () => {
  const comparison = { rubricVersion: 'test', localRuleVersion: 'test', items: [] };
  const telemetry = getProviderTelemetrySnapshot();
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ comparison, telemetry })));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  expect(await compareToneResponses(input, controller.signal)).toEqual(comparison);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith('/api/compare', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: controller.signal,
  });
});

test('surfaces server errors instead of fabricating comparison results', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Comparison limit exceeded.', code: 'INVALID_REQUEST' }), { status: 400 })));
  await expect(compareToneResponses(input)).rejects.toThrow('Invalid audit input');
});

test('single-response client preserves server-captured provenance instead of synthesizing it at export time', async () => {
  const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
  const provenance = createAnalysisProvenance(meta, 'claude');
  const result = emptyAnalysisResult();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    result, meta, provenance, telemetry: getProviderTelemetrySnapshot(),
  }))));
  const output = await analyzeTone('A technical answer.', undefined, 'claude');
  expect(output).toMatchObject({ meta, provenance });
  expect(output.result.assessments).toEqual(result.assessments);
  expect(output.result.occurrences).toEqual([]);
});

test.each(['upstream unavailable', '<html><body>proxy unavailable</body></html>', '{"error": malformed'])('suppresses non-JSON error bodies (%s)', async (body) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 502 })));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Analysis request failed (502): The API or proxy could not complete this request.');
});

test('raw and structured arbitrary error details are never exposed', async () => {
  for (const json of [false, true]) {
    const body = `debug-start${'x'.repeat(10_000)}DO-NOT-INCLUDE-TAIL`;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(json ? JSON.stringify({ error: body }) : body, { status: 500 })));
    try {
      await analyzeTone('A concrete answer.');
      throw new Error('Expected a failed request');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw error;
      expect(error.message).not.toContain('debug-start');
      expect(error.message).not.toContain('DO-NOT-INCLUDE-TAIL');
      expect(error.message.length).toBeLessThan(200);
    }
  }
});

test('comparison and empty-body failures retain their HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('comparison proxy unavailable', { status: 503 })));
  await expect(compareToneResponses(input)).rejects.toThrow('Analysis request failed (503)');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 502 })));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Analysis request failed (502)');
});

test('both modes send only the memory-held key in Authorization, never the body', async () => {
  setApiAccessKey('private-memory-key');
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META, telemetry: getProviderTelemetrySnapshot() })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ comparison: { rubricVersion: 'test', localRuleVersion: 'test', items: [] }, telemetry: getProviderTelemetrySnapshot() })));
  vi.stubGlobal('fetch', fetchMock);
  await analyzeTone('A concrete response.');
  await compareToneResponses(input);
  for (const call of fetchMock.mock.calls) {
    expect(call[1]?.headers).toMatchObject({ Authorization: 'Bearer private-memory-key' });
    expect(String(call[1]?.body)).not.toContain('private-memory-key');
  }
  expect(localStorage.getItem('private-memory-key')).toBeNull();
});

test('401 relocks both clients and prevents further automatic network calls until unlock', async () => {
  setApiAccessKey('bad-memory-key');
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Never display this secret', { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(analyzeTone('A concrete response.')).rejects.toMatchObject({ status: 401, code: 'ACCESS_REQUIRED' });
  await expect(compareToneResponses(input)).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('budget-denied comparison exposes validated retained results only through a non-success error', async () => {
  const comparison = {
    rubricVersion: 'test', localRuleVersion: 'test', items: [
      { ...input.responses[0], status: 'completed', analysis: { result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META } },
      { ...input.responses[1], status: 'failed', error: 'Budget exhausted.' },
    ],
  };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'BUDGET_EXHAUSTED', comparison }), {
    status: 429, headers: { 'Retry-After': '60' },
  })));
  await expect(compareToneResponses(input)).rejects.toMatchObject({
    name: 'ApiRequestError', status: 429, code: 'BUDGET_EXHAUSTED', retryAfter: 60, partialComparison: comparison,
  });
});

test('malformed or mismatched partial results are not rendered as audited inputs', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    code: 'BUDGET_EXHAUSTED', comparison: { rubricVersion: 'test', localRuleVersion: 'test', items: [{ id: 'wrong' }] },
  }), { status: 429 })));
  try {
    await compareToneResponses(input);
    throw new Error('Expected failed request');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (!(error instanceof ApiRequestError)) throw error;
    expect(error.partialComparison).toBeUndefined();
  }
});
