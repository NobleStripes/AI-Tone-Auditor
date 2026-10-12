import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyAnalysisResult } from '../../src/types/analysis';
let receive: (message: unknown) => void;
async function openPanel(permission = vi.fn().mockResolvedValue(true)) {
  vi.resetModules(); window.history.replaceState({}, '', '/?tab=1');
  document.documentElement.innerHTML = readFileSync('extension/panel.html', 'utf8');
  const postMessage = vi.fn();
  vi.stubGlobal('chrome', { tabs: { connect: vi.fn(() => ({ postMessage, disconnect: vi.fn(), onMessage: { addListener: (callback: typeof receive) => { receive = callback; } }, onDisconnect: { addListener: vi.fn() } })) }, permissions: { request: permission } });
  await import('../../extension/panel'); return postMessage;
}
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
function capture(mode = 'response', id = 'snapshot-1') {
  receive({ type: 'snapshot', snapshot: { id, text: 'Calm down. Inspect the error log.', mode, sourceModel: 'other', adapter: 'generic', version: 'test' } });
}
function review() { const input = document.getElementById('reviewed') as HTMLInputElement; input.checked = true; input.dispatchEvent(new Event('change')); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.documentElement.innerHTML = '<head></head><body></body>'; });
test('capture requires review and explicit audit; changed page text disables results and exports', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await openPanel(); capture();
  expect(button('audit').disabled).toBe(true); expect(document.getElementById('results').textContent).toBe('');
  review(); button('audit').click(); await vi.waitFor(() => expect(button('export').disabled).toBe(false));
  expect(fetch).not.toHaveBeenCalled(); expect(document.getElementById('results').textContent).toContain('insufficient_context');
  receive({ type: 'invalidated', id: 'snapshot-1' });
  expect(button('audit').disabled).toBe(true); expect(button('export').disabled).toBe(true); expect(document.getElementById('results').textContent).toBe('');
});
test('starting a new capture invalidates the old reviewed snapshot before a result arrives', async () => {
  const send = await openPanel(); capture(); review(); button('pick').click();
  expect(send).toHaveBeenCalledWith({ type: 'start-pick' }); expect(button('audit').disabled).toBe(true); expect(button('rewrite').disabled).toBe(true);
  receive({ type: 'error', message: 'Unsupported response.' }); expect(button('audit').disabled).toBe(true);
});
test('provisional results cannot be exported and a stopped watch requires a new reviewed audit', async () => {
  const send = await openPanel(); capture(); review(); button('watch').click();
  expect(send).toHaveBeenCalledWith({ type: 'watch', sourceModel: 'other' });
  capture('response', 'snapshot-2'); receive({ type: 'provisional', id: 'snapshot-2', result: emptyAnalysisResult() });
  expect(document.getElementById('results').textContent).toContain('Provisional'); expect(button('export').disabled).toBe(true);
  button('stop').click(); expect(send).toHaveBeenCalledWith({ type: 'stop-watch' }); expect(button('audit').disabled).toBe(true);
  capture('selection', 'snapshot-3'); review(); expect(button('watch').disabled).toBe(true);
});
test('canceling while permission is pending prevents a later API request', async () => {
  let resolvePermission: (value: boolean) => void; const permission = vi.fn(() => new Promise(resolve => { resolvePermission = resolve; }));
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await openPanel(permission); capture(); review();
  const server = document.getElementById('server') as HTMLInputElement; server.checked = true; server.dispatchEvent(new Event('change'));
  button('audit').click(); expect(permission).toHaveBeenCalled(); button('cancel').click(); resolvePermission(true); await Promise.resolve(); await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled(); expect(button('export').disabled).toBe(true);
});
test('an opted-in API failure is explicit and never replaced with local findings', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }); vi.stubGlobal('fetch', fetch); await openPanel(); capture(); review();
  const server = document.getElementById('server') as HTMLInputElement; server.checked = true; server.dispatchEvent(new Event('change'));
  button('audit').click(); await vi.waitFor(() => expect(document.getElementById('status').textContent).toContain('503'));
  expect(fetch).toHaveBeenCalledTimes(1); expect(button('export').disabled).toBe(true); expect(document.getElementById('results').textContent).toBe('');
});
