import { afterEach, expect, test, vi } from 'vitest';
import { analyzeTone, compareToneResponses, getProviderTelemetrySnapshot } from '../../src/services/analyzeClient';
import type { ComparisonRequest } from '../../src/types/comparison';
import { createAnalysisProvenance } from '../../src/services/auditProvenance';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { MAX_ERROR_BODY_LENGTH } from '../../src/lib/errorText';

afterEach(() => vi.unstubAllGlobals());
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
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Comparison limit exceeded.' }), { status: 400 })));
  await expect(compareToneResponses(input)).rejects.toThrow('Comparison limit exceeded.');
});

test('single-response client preserves server-captured provenance instead of synthesizing it at export time', async () => {
  const meta = { providerId: 'local' as const, providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false };
  const provenance = createAnalysisProvenance(meta, 'claude');
  const result = emptyAnalysisResult();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    result, meta, provenance, telemetry: getProviderTelemetrySnapshot(),
  }))));
  expect(await analyzeTone('A technical answer.', undefined, 'claude')).toEqual({ result, meta, provenance });
});

test.each(['upstream unavailable', '<html><body>proxy unavailable</body></html>', '{"error": malformed'])('preserves non-JSON /api/analyze error bodies for debugging (%s)', async (body) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 502 })));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow(`Analysis request failed (502): ${body}`);
});

test('raw and structured error details have a safe 2,000-character limit', async () => {
  for (const json of [false, true]) {
    const body = `debug-start${'x'.repeat(10_000)}DO-NOT-INCLUDE-TAIL`;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(json ? JSON.stringify({ error: body }) : body, { status: 500 })));
    try {
      await analyzeTone('A concrete answer.');
      throw new Error('Expected a failed request');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw error;
      expect(error.message).toContain('debug-start');
      expect(error.message).toContain('[truncated]');
      expect(error.message).not.toContain('DO-NOT-INCLUDE-TAIL');
      expect(error.message.length).toBe('Analysis request failed (500): '.length + MAX_ERROR_BODY_LENGTH);
    }
  }
});

test('comparison and empty-body failures retain their HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('comparison proxy unavailable', { status: 503 })));
  await expect(compareToneResponses(input)).rejects.toThrow('Analysis request failed (503): comparison proxy unavailable');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 502 })));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Analysis request failed (502)');
});
