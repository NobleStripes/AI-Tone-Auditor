// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { createApp } from '../../server/app';
import { readServerPolicy, rateAdmission } from '../../server/security';
import { analyzeTone } from '../../src/services/analyzeTone';
import { compareResponses, ComparisonBudgetError } from '../../src/services/compareResponses';
import { ApiPolicyError } from '../../src/services/apiPolicy';
import { trackProviderWork } from '../../src/services/providerWork';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import type { ComparisonRequest } from '../../src/types/comparison';
import type { Request, Response as ExpressResponse } from 'express';

vi.mock('../../src/services/analyzeTone', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/services/analyzeTone')>(), analyzeTone: vi.fn(),
}));
vi.mock('../../src/services/compareResponses', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/services/compareResponses')>(), compareResponses: vi.fn(),
}));
let server: Server | undefined;
const input = { text: 'A valid response for auditing.' };
const batch: ComparisonRequest = {
  originalPrompt: 'Explain this code.',
  responses: [
    { id: 'one', sourceModel: 'other', text: 'A valid first response.' },
    { id: 'two', sourceModel: 'other', text: 'A valid second response.' },
  ],
};
const result = () => ({ result: emptyAnalysisResult(), meta: { ...DEFAULT_LOCAL_RUNTIME_META } });
const json = { 'Content-Type': 'application/json' };
const key = 'a-test-operator-key-with-at-least-32-characters';
const publicEnv = {
  API_PUBLIC_MODE: 'true', API_ACCESS_KEY: key,
  API_ALLOWED_ORIGINS: 'https://auditor.example.test', API_TRUSTED_PROXIES: '127.0.0.1',
};
const publicHeaders = { ...json, Host: 'auditor.example.test', 'X-Forwarded-Proto': 'https', Authorization: `Bearer ${key}` };

beforeEach(() => {
  vi.mocked(analyzeTone).mockReset().mockResolvedValue(result());
  vi.mocked(compareResponses).mockReset().mockResolvedValue({ rubricVersion: 'test', localRuleVersion: 'test', items: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function start(env: Record<string, string | undefined> = {}) {
  server = createApp(readServerPolicy(env)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
  return `http://127.0.0.1:${address.port}`;
}
async function post(base: string, body: unknown = input, route = 'analyze', headers: Record<string, string> = json) {
  return rawRequest(`${base}/api/${route}`, headers, JSON.stringify(body));
}
function rawRequest(url: string, headers: Record<string, string>, body: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          responseHeaders.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: responseHeaders }));
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

test.each([
  { API_HOST: '0.0.0.0' }, { API_PUBLIC_MODE: 'yes' }, { API_PUBLIC_MODE: 'true' },
  { ...publicEnv, API_ACCESS_KEY: 'short' }, { ...publicEnv, API_ALLOWED_ORIGINS: 'https://auditor.example.test/path' },
  { ...publicEnv, API_ALLOWED_ORIGINS: 'null' }, { ...publicEnv, API_TRUSTED_PROXIES: 'true' },
  { ...publicEnv, API_TRUSTED_PROXIES: '0.0.0.0/0' }, { ...publicEnv, API_TRUSTED_PROXIES: '127.0.0.1/33' },
  { API_RATE_LIMIT: '20junk' }, { API_MAX_CONCURRENCY: '0' }, { AI_PROVIDER_TIMEOUT_MS: '0' },
  { AI_PROVIDER_RETRIES: '3' }, { AI_DAILY_TOKEN_LIMIT: '-1' }, { AI_MAX_OUTPUT_TOKENS: 'Infinity' },
])('unsafe configuration fails without echoing its values %#', env => {
  expect(() => readServerPolicy(env)).toThrow();
});

test('listener policy defaults to loopback and retains configurable finite limits', () => {
  expect(readServerPolicy({})).toMatchObject({ host: '127.0.0.1', port: 3001, publicMode: false, rateLimit: 20, concurrency: 2 });
  expect(readServerPolicy({ ...publicEnv, API_HOST: '0.0.0.0' })).toMatchObject({ publicMode: true, host: '0.0.0.0' });
});

test.each([null, [], 'text', 1, true, {}, { text: 'short' }, { ...input, sourceModel: null },
  { ...input, sourceModel: 'made-up' }, { ...input, auditContext: [] }, { ...input, injected: 'secret-value' },
  { text: 'x'.repeat(50_001) }, { ...input, auditContext: 'x'.repeat(5_001) },
])('rejects malformed analyze objects without starting jobs %#', async body => {
  const base = await start();
  const response = await post(base, body);
  expect(response.status).toBe(400);
  expect((await response.text())).not.toContain('secret-value');
  expect(analyzeTone).not.toHaveBeenCalled();
});

test.each([
  { ...batch, injected: 'secret-value' }, { ...batch, responses: [{ ...batch.responses[0], extra: true }, batch.responses[1]] },
  { ...batch, responses: [batch.responses[0], batch.responses[0]] }, { ...batch, originalPrompt: null },
])('rejects invalid comparison fields without starting jobs %#', async body => {
  const response = await post(await start(), body, 'compare');
  expect(response.status).toBe(400);
  expect(compareResponses).not.toHaveBeenCalled();
});

test.each([
  ['application/json', '{"text":', undefined, 400],
  ['text/plain', JSON.stringify(input), undefined, 415],
  ['application/json', JSON.stringify(input), 'gzip', 415],
  ['application/json', JSON.stringify({ text: 'x'.repeat(600_000) }), undefined, 413],
])('returns safe JSON parser errors for %s %#', async (type, body, encoding, status) => {
  const headers: Record<string, string> = { 'Content-Type': type };
  if (encoding) headers['Content-Encoding'] = encoding;
  const response = await fetch(`${await start()}/api/analyze`, { method: 'POST', headers, body });
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  const error = await response.json();
  expect(error).toMatchObject({ error: expect.any(String), code: expect.any(String), requestId: expect.any(String) });
  expect(JSON.stringify(error)).not.toMatch(/SyntaxError|stack|<!DOCTYPE|600000/);
  expect(analyzeTone).not.toHaveBeenCalled();
});

test('empty JSON request is safe and valid full-size analyze input still works', async () => {
  const base = await start();
  expect((await fetch(`${base}/api/analyze`, { method: 'POST', headers: json })).status).toBe(400);
  const response = await post(base, { text: '\u0001'.repeat(50_000), auditContext: '\u4e00'.repeat(5_000) });
  expect(response.status).toBe(200);
});

test('shared rate limit allows exactly 20 requests, blocks both modes, and ignores local forwarded IP spoofing', async () => {
  const base = await start();
  for (let index = 0; index < 20; index++) {
    const response = await post(base, index % 2 ? batch : input, index % 2 ? 'compare' : 'analyze',
      { ...json, 'X-Forwarded-For': `192.0.2.${index}` });
    expect(response.status).toBe(200);
  }
  for (const route of ['analyze', 'compare']) {
    const response = await post(base, route === 'analyze' ? input : batch, route);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
  }
  expect(analyzeTone).toHaveBeenCalledTimes(10);
  expect(compareResponses).toHaveBeenCalledTimes(10);
});

test('IPv6 /56 clients share counters and expired windows reopen admission', () => {
  let now = 0;
  const limiter = rateAdmission(readServerPolicy({ API_RATE_LIMIT: '1' }), () => now);
  const next = vi.fn();
  const res = { locals: {}, setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as ExpressResponse;
  const req = (ip: string) => ({ ip, socket: {} }) as Request;
  limiter(req('2001:db8:1234:5600::1'), res, next);
  limiter(req('2001:db8:1234:56ff::2'), res, next);
  expect(next).toHaveBeenCalledOnce();
  expect(res.status).toHaveBeenCalledWith(429);
  now = 60_000;
  limiter(req('2001:db8:1234:56ff::2'), res, next);
  expect(next).toHaveBeenCalledTimes(2);
});

test('rate-counter cardinality fails closed and expiry frees storage for new clients', () => {
  let now = 0;
  const limiter = rateAdmission(readServerPolicy({ API_RATE_LIMIT: '1' }), () => now);
  const next = vi.fn();
  const res = { locals: {}, setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as ExpressResponse;
  const req = (ip: string) => ({ ip, socket: {} }) as Request;
  for (let index = 0; index < 10_000; index++) limiter(req(`10.${Math.floor(index / 65536)}.${Math.floor(index / 256) % 256}.${index % 256}`), res, next);
  expect(next).toHaveBeenCalledTimes(10_000);
  limiter(req('192.0.2.100'), res, next);
  expect(res.status).toHaveBeenLastCalledWith(429);
  expect(next).toHaveBeenCalledTimes(10_000);
  now = 60_000;
  limiter(req('192.0.2.100'), res, next);
  expect(next).toHaveBeenCalledTimes(10_001);
});

test('invalid-body and provider-error responses release the only active job slot', async () => {
  const base = await start({ API_MAX_CONCURRENCY: '1' });
  expect((await post(base, {})).status).toBe(400);
  vi.mocked(analyzeTone).mockRejectedValueOnce(new Error('sensitive-failure'));
  expect((await post(base)).status).toBe(500);
  expect((await post(base)).status).toBe(200);
});

test('one comparison and one analyze occupy both slots; completion releases capacity', async () => {
  let release: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(analyzeTone).mockImplementation(async () => { await pending; return result(); });
  vi.mocked(compareResponses).mockImplementation(async () => { await pending; return { rubricVersion: 'test', localRuleVersion: 'test', items: [] }; });
  const base = await start();
  const single = post(base);
  const comparison = post(base, batch, 'compare');
  await vi.waitFor(() => {
    expect(analyzeTone).toHaveBeenCalledOnce();
    expect(compareResponses).toHaveBeenCalledOnce();
  });
  const denied = await post(base);
  expect(denied.status).toBe(503);
  expect(await denied.json()).toMatchObject({ code: 'SERVER_BUSY' });
  release();
  expect((await single).status).toBe(200);
  expect((await comparison).status).toBe(200);
  expect((await post(base)).status).toBe(200);
});

test('disconnect retains a job slot until noncooperative underlying work settles', async () => {
  let settle: () => void;
  const underlying = new Promise<void>(resolve => { settle = resolve; });
  vi.mocked(analyzeTone).mockImplementation(async (_text, _source, _prompt, signal) => {
    trackProviderWork(underlying);
    return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const base = await start({ API_MAX_CONCURRENCY: '1' });
  const controller = new AbortController();
  const rejected = expect(fetch(`${base}/api/analyze`, { method: 'POST', headers: json, body: JSON.stringify(input), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(analyzeTone).toHaveBeenCalledOnce());
  controller.abort();
  await rejected;
  expect((await post(base)).status).toBe(503);
  settle();
  vi.mocked(analyzeTone).mockResolvedValue(result());
  await vi.waitFor(async () => expect((await post(base)).status).toBe(200));
});

test('local boundary rejects foreign/null origins, DNS-rebinding hosts and spoofed forwarded hosts', async () => {
  const base = await start();
  for (const headers of [
    { ...json, Origin: 'https://evil.test' }, { ...json, Origin: 'null' },
    { ...json, Host: 'evil.test', 'X-Forwarded-Host': '127.0.0.1' },
  ]) expect((await post(base, input, 'analyze', headers)).status).toBe(403);
  expect((await post(base, input, 'analyze', { ...json, Origin: 'http://localhost:3000' })).status).toBe(200);
});

test('public mode requires trusted HTTPS, exact host/origin and bearer authentication before parsing', async () => {
  const base = await start(publicEnv);
  expect((await post(base, input, 'analyze', { ...publicHeaders, 'X-Forwarded-Proto': 'http' })).status).toBe(403);
  expect((await post(base, input, 'analyze', { ...publicHeaders, Origin: 'https://evil.test' })).status).toBe(403);
  expect((await post(base, input, 'analyze', { ...publicHeaders, Origin: 'null' })).status).toBe(403);
  expect((await post(base, input, 'analyze', { ...publicHeaders, Host: 'evil.test' })).status).toBe(403);
  const missing = await rawRequest(`${base}/api/analyze`, { ...publicHeaders, Authorization: '' }, '{malformed');
  expect(missing.status).toBe(401);
  expect((await post(base, input, 'analyze', { ...publicHeaders, Authorization: 'Bearer wrong' })).status).toBe(401);
  const accepted = await post(base, input, 'analyze', { ...publicHeaders, Origin: 'https://auditor.example.test' });
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get('Access-Control-Allow-Origin')).toBe('https://auditor.example.test');
  expect(accepted.headers.get('Strict-Transport-Security')).toContain('max-age=');
  expect(accepted.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(accepted.headers.get('X-Powered-By')).toBeNull();
  expect((await post(base, input, 'analyze', publicHeaders)).status).toBe(200);
  expect(analyzeTone).toHaveBeenCalledTimes(2);
});

test('untrusted peer cannot make public requests secure with forwarded headers', async () => {
  const base = await start({ ...publicEnv, API_TRUSTED_PROXIES: '192.0.2.1' });
  expect((await post(base, input, 'analyze', publicHeaders)).status).toBe(403);
  expect(analyzeTone).not.toHaveBeenCalled();
});

test('access discovery contains no credentials and key verification is authenticated', async () => {
  const base = await start({ API_ACCESS_KEY: key });
  const response = await fetch(`${base}/api/access`);
  expect(await response.json()).toEqual({ requiresKey: true });
  expect((await fetch(`${base}/api/access/check`)).status).toBe(401);
  expect((await fetch(`${base}/api/access/check`, { headers: { Authorization: `Bearer ${key}` } })).status).toBe(204);
});

test('processing information is authenticated, uncached, and discloses primary/fallback recipients without keys or model settings', async () => {
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
  vi.stubEnv('OPENAI_MODEL', 'sensitive-test-config-value');
  const base = await start({ API_ACCESS_KEY: key });
  expect((await fetch(`${base}/api/processing`)).status).toBe(401);
  const response = await fetch(`${base}/api/processing`, { headers: { Authorization: `Bearer ${key}` } });
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ primary: 'openai', fallback: 'anthropic' });
  expect(analyzeTone).not.toHaveBeenCalled();
});

test('both API modes sanitize errors and logs instead of exposing arbitrary secrets and internals', async () => {
  const secret = 'sensitive-provider-key-and-input';
  vi.mocked(analyzeTone).mockRejectedValue(new Error(secret));
  vi.mocked(compareResponses).mockRejectedValue(new Error(secret));
  const base = await start();
  for (const route of ['analyze', 'compare']) {
    const response = await post(base, route === 'analyze' ? input : batch, route);
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({ code: 'AUDIT_FAILED', requestId: expect.any(String) });
    expect(JSON.stringify(payload)).not.toContain(secret);
  }
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
});

test('budget denial returns non-success 429 with completed comparison items and Retry-After', async () => {
  const comparison = { rubricVersion: 'test', localRuleVersion: 'test', items: [
    { ...batch.responses[0], status: 'completed' as const, analysis: result() },
    { ...batch.responses[1], status: 'failed' as const, error: 'Budget exhausted.' },
  ] };
  vi.mocked(compareResponses).mockRejectedValue(new ComparisonBudgetError(new ApiPolicyError('BUDGET_EXHAUSTED', 429, 'Budget exhausted.', 60), comparison));
  const response = await post(await start(), batch, 'compare');
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(await response.json()).toMatchObject({ code: 'BUDGET_EXHAUSTED', comparison });
});

test('single-audit budget denial returns 429 with a stable code and Retry-After', async () => {
  vi.mocked(analyzeTone).mockRejectedValue(new ApiPolicyError('BUDGET_EXHAUSTED', 429, 'External audit budget exhausted.', 60));
  const response = await post(await start());
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(await response.json()).toMatchObject({ code: 'BUDGET_EXHAUSTED' });
});

test('comparison JSON over its transport limit returns 413 without an audit', async () => {
  const response = await post(await start(), { text: 'x'.repeat(2_200_000) }, 'compare');
  expect(response.status).toBe(413);
  expect(compareResponses).not.toHaveBeenCalled();
});
