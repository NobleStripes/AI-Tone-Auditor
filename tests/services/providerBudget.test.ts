// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ProviderBudget, providerBudget } from '../../src/services/providers/providerBudget';
import { providerLimits, ApiPolicyError } from '../../src/services/apiPolicy';
import { analyzeTone } from '../../src/services/analyzeTone';
import { compareResponses, ComparisonBudgetError } from '../../src/services/compareResponses';
import { openaiProvider } from '../../src/services/providers/openaiProvider';
import { anthropicProvider } from '../../src/services/providers/anthropicProvider';
import { geminiProvider } from '../../src/services/providers/geminiProvider';
import { grokProvider } from '../../src/services/providers/grokProvider';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import { providerWireResult } from '../fixtures/providerWire.fixture';

const providers = [openaiProvider, anthropicProvider, geminiProvider, grokProvider];
const fetchMock = vi.fn<typeof fetch>();
const input = { text: 'A sufficiently long audit response.', context: { promptVersion: 'test' } };
const analysis = JSON.stringify(providerWireResult(emptyAnalysisResult()));
function success(id = 'openai') {
  return new Response(JSON.stringify(id === 'anthropic' ? {
    stop_reason: 'end_turn', content: [{ type: 'text', text: analysis }],
  } : {
    status: 'completed', output: [{ type: id === 'gemini' ? 'model_output' : 'message', content: [{ type: id === 'gemini' ? 'text' : 'output_text', text: analysis }] }],
  }));
}

beforeEach(() => {
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY']) vi.stubEnv(name, 'mock-only-key');
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', '');
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '15000');
  vi.stubEnv('AI_PROVIDER_RETRIES', '0');
  vi.stubEnv('AI_MAX_OUTPUT_TOKENS', '1234');
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '100');
  vi.stubEnv('AI_DAILY_TOKEN_LIMIT', '1000000000');
  const budget = new ProviderBudget();
  vi.spyOn(providerBudget, 'reserve').mockImplementation((body, now) => budget.reserve(body, now));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('default provider limits are finite and match approved thresholds', () => {
  expect(providerLimits({})).toEqual({
    timeoutMs: 15_000, retries: 1, outputTokens: 3_000, dailyAttempts: 100, dailyTokens: 1_000_000,
  });
});

test.each(['0', '-1', '3.5', '200000', 'Infinity', 'NaN', '15ms'])('rejects invalid timeout %s without calling a provider', async value => {
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', value);
  await expect(analyzeTone(input.text)).rejects.toThrow('Invalid configuration: AI_PROVIDER_TIMEOUT_MS');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('exact attempt threshold is atomic and resets at the next UTC day', () => {
  const budget = new ProviderBudget();
  const now = Date.parse('2026-10-14T23:59:59Z');
  for (let index = 0; index < 100; index++) budget.reserve('{}', now);
  expect(() => budget.reserve('{}', now)).toThrow(ApiPolicyError);
  expect(() => budget.reserve('{}', now + 1000)).not.toThrow();
});

test('token reservations include the full UTF-8 wire body and configured output cap at exact bounds', () => {
  const body = JSON.stringify({ prompt: '漢😀', instructions: 'System instructions', schema: { type: 'object' } });
  const units = Buffer.byteLength(body, 'utf8') + 4096 + 1234;
  vi.stubEnv('AI_DAILY_TOKEN_LIMIT', String(units));
  const budget = new ProviderBudget();
  expect(() => budget.reserve(body)).not.toThrow();
  expect(() => budget.reserve('{}')).toThrow(ApiPolicyError);
  vi.stubEnv('AI_DAILY_TOKEN_LIMIT', String(units - 1));
  expect(() => new ProviderBudget().reserve(body)).toThrow(ApiPolicyError);
});

test.each(providers)('$id sets its supported output cap and reserves the complete request immediately before fetch', async provider => {
  fetchMock.mockResolvedValue(success(provider.id));
  await provider.analyzeTone(input);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
  const body = String(fetchMock.mock.calls[0][1]?.body);
  expect(providerBudget.reserve).toHaveBeenCalledWith(body);
  const parsed = JSON.parse(body);
  expect(parsed.max_output_tokens ?? parsed.max_tokens ?? parsed.generation_config?.max_output_tokens).toBe(1234);
  expect(body).toContain(input.text);
  expect(body).toContain('tone analysis engine');
  expect(body).toContain('"schema"');
  const signal = fetchMock.mock.calls[0][1]?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
});

test.each(providers)('$id direct adapter use cannot bypass a denied token budget', async provider => {
  vi.stubEnv('AI_DAILY_TOKEN_LIMIT', '1');
  await expect(provider.analyzeTone(input)).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED', status: 429 });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('retries consume attempts and policy denial prevents all retry/fallback calls including local fallback', async () => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  vi.stubEnv('AI_PROVIDER_RETRIES', '2');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'local');
  const fallback = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  fetchMock.mockResolvedValue(new Response('diagnostic-with-private-input', { status: 503 }));
  await expect(analyzeTone(input.text)).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fallback).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('diagnostic-with-private-input');
});

test('configured external fallback shares the same attempt pool', async () => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  fetchMock.mockResolvedValue(new Response('Upstream unavailable', { status: 503 }));
  await expect(analyzeTone(input.text)).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain('openai');
});

test('failed and canceled calls are not refunded, while pre-canceled input is not reserved', async () => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  const preCanceled = new AbortController();
  preCanceled.abort();
  await expect(openaiProvider.analyzeTone({ ...input, signal: preCanceled.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(providerBudget.reserve).not.toHaveBeenCalled();
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
  }));
  const controller = new AbortController();
  const pending = openaiProvider.analyzeTone({ ...input, signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  await expect(grokProvider.analyzeTone(input)).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('mid-comparison policy denial retains success and fails all remaining inputs without scheduling them', async () => {
  const responses = Array.from({ length: 5 }, (_, index) => ({ id: String(index), sourceModel: 'other' as const, text: `Response number ${index}.` }));
  const audit = vi.fn<typeof analyzeTone>()
    .mockResolvedValueOnce({ result: emptyAnalysisResult(), meta: { ...DEFAULT_LOCAL_RUNTIME_META } })
    .mockRejectedValueOnce(new ApiPolicyError('BUDGET_EXHAUSTED', 429, 'Budget exhausted.', 60));
  try {
    await compareResponses({ originalPrompt: 'Explain it.', responses }, undefined, audit);
    throw new Error('Expected budget denial');
  } catch (error) {
    expect(error).toBeInstanceOf(ComparisonBudgetError);
    if (!(error instanceof ComparisonBudgetError)) throw error;
    expect(error.comparison.items.map(item => item.status)).toEqual(['completed', 'failed', 'failed', 'failed', 'failed']);
    expect(error.comparison.items.map(item => item.id)).toEqual(responses.map(item => item.id));
    expect(error.comparison.completedAt).toBeDefined();
  }
  expect(audit).toHaveBeenCalledTimes(2);
});
