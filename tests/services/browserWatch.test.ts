import { afterEach, expect, test, vi } from 'vitest';
import { extractSnapshot } from '../../extension/extraction';
import { watchResponse, type WatchCallbacks } from '../../extension/watch';
import { emptyAnalysisResult } from '../../src/types/analysis';
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function setup() {
  document.body.innerHTML = '<article data-message-author-role="assistant">Initial response wording.</article>';
  const root = document.body.firstElementChild;
  const callbacks: WatchCallbacks = { snapshot: vi.fn(), invalidated: vi.fn(), provisional: vi.fn(), error: vi.fn(), waiting: vi.fn() };
  return { root, callbacks, initial: extractSnapshot(root, 'https://chatgpt.com/', 'response') };
}
test('watch invalidates synchronously on mutation and drops late findings from an older snapshot', async () => {
  vi.useFakeTimers(); const { root, initial, callbacks } = setup();
  let resolveOld: (value: ReturnType<typeof emptyAnalysisResult>) => void;
  const audit = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(emptyAnalysisResult());
  const watcher = watchResponse(initial, callbacks, 'chatgpt', audit, 5);
  expect(callbacks.snapshot).toHaveBeenCalledTimes(1);
  root.firstChild.textContent = 'Updated response wording.'; await Promise.resolve();
  expect(callbacks.invalidated).toHaveBeenCalledTimes(1);
  resolveOld(emptyAnalysisResult()); await Promise.resolve(); expect(callbacks.provisional).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5); expect(callbacks.provisional).toHaveBeenCalledTimes(1);
  expect(vi.mocked(callbacks.provisional).mock.calls[0][0].text).toContain('Updated response');
  watcher.stop(); root.firstChild.textContent = 'Another response change.'; await Promise.resolve(); await vi.advanceTimersByTimeAsync(10);
  expect(audit).toHaveBeenCalledTimes(2);
});
test('root removal and extraction errors stop watching instead of retaining a completed result', async () => {
  const { root, initial, callbacks } = setup(); const watcher = watchResponse(initial, callbacks);
  root.remove(); await Promise.resolve(); await Promise.resolve();
  expect(callbacks.invalidated).toHaveBeenCalled(); expect(callbacks.error).toHaveBeenCalledWith(expect.stringContaining('disappeared')); watcher.stop();
});
test('short samples wait without findings; selection and stale captures cannot start a watch', async () => {
  const { root, initial, callbacks } = setup(); root.firstChild.textContent = 'Short';
  expect(() => watchResponse(initial, callbacks)).toThrow('Capture');
  const short = extractSnapshot(root, '', 'response'); const audit = vi.fn(); const watcher = watchResponse(short, callbacks, 'other', audit);
  expect(callbacks.waiting).toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled(); expect(callbacks.provisional).not.toHaveBeenCalled(); watcher.stop();
  expect(() => watchResponse({ ...short, mode: 'selection' }, callbacks)).toThrow('complete');
});
test('hiding an ancestor invalidates the watched region and stops later findings', async () => {
  const { initial, callbacks } = setup(); const watcher = watchResponse(initial, callbacks);
  document.body.hidden = true; await Promise.resolve(); await Promise.resolve();
  expect(callbacks.invalidated).toHaveBeenCalled(); expect(callbacks.error).toHaveBeenCalledWith(expect.stringContaining('ancestry'));
  document.body.hidden = false; watcher.stop();
});
