// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { analyzeTone } from '../../src/services/analyzeTone';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { openaiProvider } from '../../src/services/providers/openaiProvider';
import { anthropicProvider } from '../../src/services/providers/anthropicProvider';
import { geminiProvider } from '../../src/services/providers/geminiProvider';
import { grokProvider } from '../../src/services/providers/grokProvider';
import { resetProviderTelemetry, getProviderTelemetrySnapshot } from '../../src/services/telemetry/providerTelemetry';

const nativeFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();
let server: Server | undefined;

beforeEach(() => {
  vi.stubEnv('AI_PROVIDER', 'openai'); vi.stubEnv('AI_FALLBACK_PROVIDER', 'local');
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '0'); vi.stubEnv('AI_PROVIDER_RETRIES', '1');
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY']) vi.stubEnv(name, 'test-only-key');
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetProviderTelemetry();
});
afterEach(async () => {
  vi.useRealTimers();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  server = undefined;
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

test('timeout aborts the underlying fetch before retrying without overlapping attempts', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '10'); vi.stubEnv('AI_FALLBACK_PROVIDER', '');
  let active = 0; let maxActive = 0;
  const signals: AbortSignal[] = [];
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    const signal = options.signal;
    signals.push(signal); active++; maxActive = Math.max(maxActive, active);
    signal.addEventListener('abort', () => { active--; reject(signal.reason); }, { once: true });
  }));
  const rejected = expect(analyzeTone('A long enough response.')).rejects.toThrow('timed out');
  await rejected;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(maxActive).toBe(1); expect(active).toBe(0);
  expect(getProviderTelemetrySnapshot().providers.openai).toEqual({ attempts: 2, successes: 0, failures: 2 });
});

test.each([openaiProvider, anthropicProvider, geminiProvider, grokProvider])('$id forwards cancellation to its fetch', async provider => {
  vi.stubEnv('AI_PROVIDER', provider.id);
  const fallback = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  let requestSignal: AbortSignal;
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    requestSignal = options.signal;
    requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true });
  }));
  const controller = new AbortController();
  const pending = analyzeTone('A long enough response.', 'unknown', '', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await rejected;
  expect(requestSignal.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
  expect(getProviderTelemetrySnapshot().totalAnalyses).toBe(0);
});

test('cancellation during retry backoff prevents another attempt or fallback', async () => {
  vi.useFakeTimers();
  const fallback = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  fetchMock.mockResolvedValue(new Response('Temporarily unavailable', { status: 503 }));
  const controller = new AbortController();
  const rejected = expect(analyzeTone('A long enough response.', 'unknown', '', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(0);
  expect(console.warn).toHaveBeenCalled();
  controller.abort(); await rejected; await vi.advanceTimersByTimeAsync(1000);
  expect(fetchMock).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
});

test('pre-aborted input makes no provider calls', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(analyzeTone('A long enough response.', 'unknown', '', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('cancellation rejects a noncooperative attempt and never starts fallback after its late failure', async () => {
  let rejectPrimary: (error: Error) => void;
  fetchMock.mockImplementation(() => new Promise((_resolve, reject) => { rejectPrimary = reject; }));
  const fallback = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  const controller = new AbortController();
  const rejected = expect(analyzeTone('A long enough response.', 'unknown', '', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await rejected;
  rejectPrimary(new Error('Late upstream failure.')); await Promise.resolve();
  expect(fallback).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledOnce();
});

test.each(['analyze', 'compare'])('disconnecting /api/%s aborts the active provider and prevents fallback', async route => {
  let notifyStarted: () => void;
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  let requestSignal: AbortSignal;
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    requestSignal = options.signal;
    requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true });
    notifyStarted();
  }));
  const fallback = vi.spyOn(localHeuristicProvider, 'analyzeTone');
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const controller = new AbortController();
  const body = route === 'analyze' ? { text: 'A long enough response.' } : {
    originalPrompt: 'Explain this error.', responses: [
      { id: 'one', sourceModel: 'other', text: 'A long enough response.' },
      { id: 'two', sourceModel: 'other', text: 'Another long enough response.' },
    ],
  };
  const rejected = expect(nativeFetch(`http://127.0.0.1:${address.port}/api/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
  })).rejects.toMatchObject({ name: 'AbortError' });
  await started; controller.abort(); await rejected;
  await vi.waitFor(() => expect(requestSignal.aborted).toBe(true));
  expect(fetchMock).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
  expect(getProviderTelemetrySnapshot().totalAnalyses).toBe(0);
});

test('invalid provider structure activates configured fallback instead of recording success', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'null' }] }],
  })));
  const output = await analyzeTone('A long enough response.');
  expect(output.meta).toMatchObject({ providerId: 'local', usedFallback: true });
  expect(getProviderTelemetrySnapshot().providers.openai).toEqual({ attempts: 1, successes: 0, failures: 1 });
});
