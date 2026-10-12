import { afterEach, expect, test } from 'vitest';
import { captureSelection, extractSnapshot, passageRange, responseRoot, snapshotCurrent } from '../../extension/extraction';
import { evidenceAt, verifyEvidence } from '../../src/services/evidence';

afterEach(() => { document.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });
function mount(html: string) { document.body.innerHTML = html; return document.body.firstElementChild; }
test('visible extraction preserves Unicode and excludes controls while retaining code and quotation context', () => {
  const root = mount('<article><p>😀 Calm down.</p><button>Calm down hidden control</button><p hidden>secret</p><span contenteditable="true">private draft</span><pre><code>Calm down. ```</code></pre><blockquote>Calm down.</blockquote><p>End of response.</p></article>');
  const snapshot = extractSnapshot(root, 'https://chatgpt.com/', 'response');
  expect(snapshot.text).toContain('😀 Calm down.'); expect(snapshot.text).not.toMatch(/secret|private draft|hidden control/);
  expect(snapshot.text).toContain('````\nCalm down. ```\n````'); expect(snapshot.text).toContain('> Calm down.');
  const offset = snapshot.text.indexOf('Calm down.'); const first = evidenceAt(snapshot.text, offset, offset + 'Calm down.'.length);
  expect(passageRange(snapshot, first)?.toString()).toBe('Calm down.');
  expect(snapshotCurrent(snapshot)).toBe(true);
  root.querySelector('p').firstChild.textContent = 'Changed response.';
  expect(snapshotCurrent(snapshot)).toBe(false); expect(passageRange(snapshot, first)).toBeNull();
});
test('selection preserves partial inline-code exclusion and rejects cross-response selections', () => {
  const root = mount('<main><article data-message-author-role="assistant"><p>Before <code>Calm down.</code> after.</p></article><article data-message-author-role="assistant">Other response.</article></main>');
  const code = root.querySelector('code').firstChild; const range = document.createRange(); range.setStart(code, 0); range.setEnd(code, 9);
  document.getSelection().addRange(range);
  const snapshot = captureSelection(document, 'https://chatgpt.com/'); expect(snapshot.text).toContain('`Calm down`');
  expect(verifyEvidence(snapshot.text, 'Calm down').eligibility).toBe('excluded');
  range.setEnd(root.lastElementChild.firstChild, 5); document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
  expect(() => captureSelection(document, 'https://chatgpt.com/')).toThrow('boundaries');
});
test('source mapping refuses virtual separators, hidden intervening content and replaced DOM nodes', () => {
  const root = mount('<article>First<span hidden>private</span> second<p>Third passage.</p></article>');
  const snapshot = extractSnapshot(root, 'https://example.org', 'response');
  expect(passageRange(snapshot, verifyEvidence(snapshot.text, 'First second'))).toBeNull();
  expect(passageRange(snapshot, verifyEvidence(snapshot.text, 'second\nThird'))).toBeNull();
  const evidence = verifyEvidence(snapshot.text, 'Third passage.'); expect(passageRange(snapshot, evidence)?.toString()).toBe('Third passage.');
  root.querySelector('p').innerHTML = 'Third passage.'; expect(snapshotCurrent(snapshot)).toBe(false);
});
test('site adapters select only a known response and unsupported sites still support explicit selection', () => {
  for (const [url, html] of [
    ['https://chatgpt.com/', '<article data-message-author-role="assistant"><span>Response sample.</span></article>'],
    ['https://claude.ai/', '<article data-testid="assistant-message"><span>Response sample.</span></article>'],
    ['https://gemini.google.com/', '<model-response><span>Response sample.</span></model-response>'],
    ['https://grok.com/', '<article data-role="assistant"><span>Response sample.</span></article>'],
  ]) { const root = mount(html); expect(responseRoot(root.firstElementChild, url)).toBe(root); }
  const root = mount('<article><span>Response sample.</span></article>'); expect(responseRoot(root, 'https://example.org/')).toBeNull();
  const range = document.createRange(); range.selectNodeContents(root.firstElementChild); document.getSelection().addRange(range);
  expect(captureSelection(document, 'https://example.org/').text).toBe('Response sample.');
});
test('hidden ancestry and empty or oversized captures fail closed', () => {
  const root = mount('<article hidden><span>Secret sample.</span></article>'); expect(() => extractSnapshot(root.firstElementChild, '', 'selection')).toThrow('hidden');
  root.removeAttribute('hidden'); root.textContent = ''; expect(() => extractSnapshot(root, '', 'response')).toThrow('No visible');
  root.textContent = 'x'.repeat(50_001); expect(() => extractSnapshot(root, '', 'response')).toThrow('50,000');
});
