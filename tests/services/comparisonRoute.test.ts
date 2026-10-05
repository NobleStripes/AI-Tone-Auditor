// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { compareResponses } from '../../src/services/compareResponses';
import type { ComparisonRequest } from '../../src/types/comparison';

vi.mock('../../src/services/compareResponses', () => ({ compareResponses: vi.fn() }));
let server: Server | undefined;

afterEach(async () => {
  vi.clearAllMocks();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

async function startServer() {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

const input: ComparisonRequest = {
  originalPrompt: 'Explain the code.',
  responses: [
    { id: 'one', sourceModel: 'chatgpt', text: 'The result is 42.' },
    { id: 'two', sourceModel: 'grok', text: 'The result is 43.' },
  ],
};

test('invalid batches return 400 without invoking an auditor', async () => {
  const base = await startServer();
  const response = await fetch(`${base}/api/compare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, originalPrompt: '' }),
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('originalPrompt') });
  expect(compareResponses).not.toHaveBeenCalled();
});

test.each(['\u4e00', '\u0001'])('valid batches support Unicode and JSON-escaped characters at the full payload bounds (%j)', async (character) => {
  vi.mocked(compareResponses).mockResolvedValue({ rubricVersion: 'test', localRuleVersion: 'test', items: [] });
  const base = await startServer();
  const largeInput = {
    ...input, responses: Array.from({ length: 5 }, (_, index) => ({
      id: `response-${index}`, sourceModel: 'other', text: character.repeat(50_000),
    })),
  };
  const response = await fetch(`${base}/api/compare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(largeInput),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ comparison: { rubricVersion: 'test' }, telemetry: expect.any(Object) });
  expect(compareResponses).toHaveBeenCalledWith(largeInput, expect.any(AbortSignal));
});

test('disconnecting the client aborts the batch scheduling signal', async () => {
  let started: () => void;
  const running = new Promise<void>((resolve) => { started = resolve; });
  let serverSignal: AbortSignal;
  vi.mocked(compareResponses).mockImplementation(async (_input, signal) => {
    serverSignal = signal;
    started();
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const base = await startServer();
  const controller = new AbortController();
  const pending = fetch(`${base}/api/compare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal,
  });
  const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await running;
  controller.abort();
  await rejection;
  await vi.waitFor(() => expect(serverSignal.aborted).toBe(true));
});
