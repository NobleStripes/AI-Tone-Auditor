// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { analyzeTone } from '../../src/services/analyzeTone';
import { compareResponses } from '../../src/services/compareResponses';
import { resolveFallbackProvider, resolveProvider } from '../../src/services/providers/factory';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { openaiProvider } from '../../src/services/providers/openaiProvider';
import { anthropicProvider } from '../../src/services/providers/anthropicProvider';
import { geminiProvider } from '../../src/services/providers/geminiProvider';
import { grokProvider } from '../../src/services/providers/grokProvider';
import { getProviderTelemetrySnapshot, resetProviderTelemetry } from '../../src/services/telemetry/providerTelemetry';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { COMPARISON_SOURCES } from '../../src/types/comparison';
import { MAX_ERROR_BODY_LENGTH } from '../../src/lib/errorText';

const nativeFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();
const externalProviders = [
  { provider: openaiProvider, key: 'OPENAI_API_KEY', label: 'OpenAI' },
  { provider: anthropicProvider, key: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
  { provider: geminiProvider, key: 'GEMINI_API_KEY', label: 'Gemini' },
  { provider: grokProvider, key: 'XAI_API_KEY', label: 'Grok' },
];
let server: Server | undefined;

beforeEach(() => {
  for (const name of ['AI_PROVIDER', 'AI_FALLBACK_PROVIDER', ...externalProviders.map(item => item.key)]) vi.stubEnv(name, undefined);
  vi.stubEnv('AI_PROVIDER_RETRIES', '0');
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '0');
  fetchMock.mockReset().mockRejectedValue(new Error('Unexpected external call'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetProviderTelemetry();
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function openaiSuccess(): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(emptyAnalysisResult()) }] }],
  }));
}

test.each([undefined, '', 'local', ' LOCAL '])('no-key analysis succeeds locally when AI_PROVIDER=%j', async (setting) => {
  vi.stubEnv('AI_PROVIDER', setting);
  const adapters = externalProviders.map(({ provider }) => vi.spyOn(provider, 'analyzeTone'));
  const result = await analyzeTone('The argument type is an integer.', 'grok', 'Explain this error.');
  expect(result.meta).toEqual({ providerId: 'local', providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false });
  expect(result.provenance.analysisProvider).toEqual(result.meta);
  expect(result.provenance.selectedSourceModel).toBe('grok');
  expect(result.result.assessments.infantilizing).toMatchObject({ status: 'assessed', method: 'lexical_rule' });
  expect(fetchMock).not.toHaveBeenCalled();
  for (const adapter of adapters) expect(adapter).not.toHaveBeenCalled();
  expect(getProviderTelemetrySnapshot()).toMatchObject({ totalAnalyses: 1, fallbackActivations: 0 });
});

test('available external keys do not opt local mode into external analysis', async () => {
  vi.stubEnv('AI_PROVIDER', 'local');
  for (const { key } of externalProviders) vi.stubEnv(key, 'unused-test-key');
  await analyzeTone('A concrete technical answer.');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(resolveFallbackProvider('local')).toBeNull();
});

test.each(['local', 'openai', 'anthropic', 'gemini', 'grok'] as const)('unset, blank or same-provider fallback does not invent another provider for %s', (primary) => {
  expect(resolveFallbackProvider(primary)).toBeNull();
  vi.stubEnv('AI_FALLBACK_PROVIDER', '   ');
  expect(resolveFallbackProvider(primary)).toBeNull();
  vi.stubEnv('AI_FALLBACK_PROVIDER', primary);
  expect(resolveFallbackProvider(primary)).toBeNull();
});

test('invalid configuration is explicit, with no provider calls', async () => {
  vi.stubEnv('AI_PROVIDER', 'typo');
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Invalid AI_PROVIDER');
  vi.stubEnv('AI_PROVIDER', 'local');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'typo');
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Invalid AI_FALLBACK_PROVIDER');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(resolveProvider().id).toBe('local');
});

test.each(externalProviders)('$label missing key surfaces its own error without fallback or network calls', async ({ provider, key, label }) => {
  vi.stubEnv('AI_PROVIDER', provider.id);
  vi.stubEnv(key, '   ');
  const otherAdapters = externalProviders.filter(item => item.provider.id !== provider.id).map(item => vi.spyOn(item.provider, 'analyzeTone'));
  await expect(analyzeTone('A concrete technical answer.')).rejects.toThrow(`Missing ${key} for ${label} provider`);
  for (const adapter of otherAdapters) expect(adapter).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(externalProviders)('$label rejected key is explicit, redacted and not retried', async ({ provider, key, label }) => {
  vi.stubEnv('AI_PROVIDER', provider.id);
  vi.stubEnv(key, 'test-only-rejected-key');
  vi.stubEnv('AI_PROVIDER_RETRIES', '2');
  fetchMock.mockImplementation(async () => {
    vi.stubEnv(key, 'changed-after-request');
    return new Response('Invalid API key: test-only-rejected-key; diagnostic code 500', { status: provider.id === 'gemini' ? 400 : 401 });
  });
  const pending = analyzeTone('A concrete answer.');
  await expect(pending).rejects.toThrow(`${label} request failed`);
  await expect(pending).rejects.toThrow(`check ${key}`);
  await expect(pending).rejects.not.toThrow('test-only-rejected-key');
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('Gemini API key not valid errors name GEMINI_API_KEY even with HTTP 400', async () => {
  vi.stubEnv('AI_PROVIDER', 'gemini');
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('authentication failed; check GEMINI_API_KEY');
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('primary failure runs only an explicitly configured fallback and captures its provenance', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  vi.stubEnv('OPENAI_API_KEY', 'test-primary-key');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-fallback-key');
  fetchMock.mockResolvedValueOnce(new Response('Primary unavailable', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(emptyAnalysisResult()) }],
    })));
  const result = await analyzeTone('A concrete answer.', 'claude');
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['https://api.openai.com/v1/responses', 'https://api.anthropic.com/v1/messages']);
  expect(result.meta).toMatchObject({ providerId: 'anthropic', usedFallback: true });
  expect(result.provenance.analysisProvider).toEqual(result.meta);
  expect(getProviderTelemetrySnapshot().fallbackActivations).toBe(1);
});

test('primary failure with no fallback keeps the primary error and makes no surprise call', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  fetchMock.mockResolvedValueOnce(new Response('Upstream unavailable', { status: 503 }));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('OpenAI request failed (503)');
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(getProviderTelemetrySnapshot().providers.anthropic.attempts).toBe(0);
});

test('failing local analysis cannot reach any external provider without explicit fallback', async () => {
  vi.stubEnv('AI_PROVIDER', 'local');
  vi.spyOn(localHeuristicProvider, 'analyzeTone').mockRejectedValue(new Error('Local rule failure'));
  await expect(analyzeTone('A concrete answer.')).rejects.toThrow('Local rule failure');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('local primary can use an external fallback only when explicitly configured', async () => {
  vi.stubEnv('AI_PROVIDER', 'local');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const local = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  await analyzeTone('A concrete answer.');
  expect(fetchMock).not.toHaveBeenCalled();
  local.mockRejectedValueOnce(new Error('Local rule failure'));
  fetchMock.mockResolvedValueOnce(openaiSuccess());
  const output = await analyzeTone('A second concrete answer.');
  expect(output.meta).toMatchObject({ providerId: 'openai', usedFallback: true });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('explicit local fallback succeeds without keys, while both-failed errors retain both providers', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'local');
  const output = await analyzeTone('A concrete answer.');
  expect(output.meta).toMatchObject({ providerId: 'local', model: 'rules-v1', usedFallback: true });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  const pending = analyzeTone('Another concrete answer.');
  await expect(pending).rejects.toThrow('Missing OPENAI_API_KEY');
  await expect(pending).rejects.toThrow('Missing ANTHROPIC_API_KEY');
});

test('provider error details are bounded before they reach API logs and clients', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  fetchMock.mockResolvedValue(new Response(`debug-start${'x'.repeat(10_000)}SECRET-TAIL`, { status: 400 }));
  const pending = analyzeTone('A concrete answer.');
  await expect(pending).rejects.toThrow('[truncated]');
  await expect(pending).rejects.not.toThrow('SECRET-TAIL');
  await pending.catch(error => expect(error.message.length).toBeLessThan(MAX_ERROR_BODY_LENGTH + 100));
});

test('both failed providers remain visible within the client error-body budget', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  vi.stubEnv('OPENAI_API_KEY', 'test-primary-key');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-fallback-key');
  fetchMock.mockResolvedValue(new Response('Invalid API key. '.repeat(1_000), { status: 401 }));
  // Each attempt needs a fresh response body.
  fetchMock.mockImplementation(async () => new Response('Invalid API key. '.repeat(1_000), { status: 401 }));
  try {
    await analyzeTone('A concrete answer.');
    throw new Error('Expected provider failure');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof Error)) throw error;
    expect(error.message).toContain('check OPENAI_API_KEY');
    expect(error.message).toContain('check ANTHROPIC_API_KEY');
    expect(error.message.length).toBeLessThanOrEqual(MAX_ERROR_BODY_LENGTH);
  }
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each([2, 3, 4, 5])('comparison of %i responses works entirely locally with no keys', async (count) => {
  const comparison = await compareResponses({
    originalPrompt: 'Explain this compiler error.',
    responses: COMPARISON_SOURCES.slice(0, count).map((sourceModel, index) => ({
      id: `response-${index}`, sourceModel, text: 'The parser rejects this token; remove the comma.',
    })),
  });
  expect(comparison.items).toHaveLength(count);
  for (const item of comparison.items) {
    expect(item.status).toBe('completed');
    if (item.status === 'completed') {
      expect(item.analysis.meta).toMatchObject({ providerId: 'local', model: 'rules-v1', usedFallback: false });
      expect(item.analysis.provenance.analysisProvider).toEqual(item.analysis.meta);
      expect(item.analysis.provenance.comparisonSessionId).toBe(comparison.sessionId);
      expect(item.analysis.provenance.selectedSourceModel).toBe(item.sourceModel);
    }
  }
  expect(fetchMock).not.toHaveBeenCalled();
  for (const { provider } of externalProviders) expect(getProviderTelemetrySnapshot().providers[provider.id].attempts).toBe(0);
});

async function startApi() {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

test('no-key /api/analyze and five-response /api/compare expose local provenance without external fetches', async () => {
  const base = await startApi();
  const single = await nativeFetch(`${base}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'A concrete technical answer.' }),
  });
  expect(single.status).toBe(200);
  expect((await single.json()).provenance.analysisProvider).toMatchObject({ providerId: 'local', model: 'rules-v1', usedFallback: false });
  const comparison = await nativeFetch(`${base}/api/compare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalPrompt: 'Explain this error.',
      responses: COMPARISON_SOURCES.map((sourceModel, index) => ({ id: String(index), sourceModel, text: 'The argument type is an integer.' })),
    }),
  });
  expect(comparison.status).toBe(200);
  const payload = await comparison.json();
  expect(payload.comparison.items).toHaveLength(5);
  expect(payload.comparison.items.every(item => item.status === 'completed' && !item.analysis.meta.usedFallback)).toBe(true);
  expect(payload.telemetry.providers.local.successes).toBe(6);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('explicit external API mode without a key returns the provider-specific error', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  const base = await startApi();
  const response = await nativeFetch(`${base}/api/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'A concrete answer.' }),
  });
  expect(response.status).toBe(500);
  expect((await response.json()).error).toContain('Missing OPENAI_API_KEY for OpenAI provider');
  expect(fetchMock).not.toHaveBeenCalled();
});
