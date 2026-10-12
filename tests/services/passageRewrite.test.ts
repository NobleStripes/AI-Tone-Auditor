import { expect, test } from 'vitest';
import { applyPassageRewrite, passageDiff, suggestPassageRewrites } from '../../src/services/passageRewrite';

test('rewrites only the selected repeated occurrence and keeps surrounding response bytes intact', () => {
  const response = 'Calm down. First answer.\r\nCalm down. Second answer.';
  const start = response.lastIndexOf('Calm down.'); const end = start + 'Calm down. '.length;
  const suggestion = suggestPassageRewrites(response, start, end)[0];
  expect(applyPassageRewrite(response, suggestion)).toBe('Calm down. First answer.\r\nSecond answer.');
  expect(suggestion.replacement).toBe('');
});
test('diff reconstructs both inputs and never splits surrogate pairs', () => {
  const before = '\u{1f600} before\r\ntext'; const after = '\u{1f603} after\r\ntext'; const diff = passageDiff(before, after);
  expect(diff.filter(item => item.kind !== 'insert').map(item => item.text).join('')).toBe(before);
  expect(diff.filter(item => item.kind !== 'delete').map(item => item.text).join('')).toBe(after);
  expect(diff.every(item => !/[\uD800-\uDBFF]$/.test(item.text))).toBe(true);
});
test('quoted/code wording cannot be rewritten as ordinary speech', () => {
  const response = '`Calm down` is an example.'; const start = response.indexOf('Calm');
  expect(() => suggestPassageRewrites(response, start, start + 9)).toThrow('code');
});
test('stale selections and new explicit AI-feelings claims are blocked before copying', () => {
  const response = 'Actually, the result is 42.'; const suggestion = suggestPassageRewrites(response, 0, response.length)[0];
  expect(() => applyPassageRewrite('Changed response.', suggestion)).toThrow();
  expect(() => applyPassageRewrite(response, { ...suggestion, replacement: 'Claude has feelings.' })).toThrow('AI-feelings');
  expect(applyPassageRewrite(response, suggestion)).toBe('the result is 42.');
});
test('warranted uncertainty and specific apologies are not automatically strengthened or deleted', () => {
  for (const text of ['The estimate may change.', 'I am sorry: I used the wrong field.', 'Calm downtown streets are quieter.', 'Great questionnaires require careful wording.']) expect(suggestPassageRewrites(text, 0, text.length)).toEqual([]);
});
test('the guard checks surrounding text when a partial rewrite creates an AI-feelings claim', () => {
  const response = 'Claude has no feelings.'; const start = response.indexOf('no ');
  expect(() => applyPassageRewrite(response, { startOffset: start, endOffset: start + 3, original: 'no ', replacement: '' })).toThrow('surrounding text');
  const unrelated = 'Claude has feelings. Actually, check the log.'; const offset = unrelated.indexOf('Actually');
  expect(applyPassageRewrite(unrelated, suggestPassageRewrites(unrelated, offset, unrelated.length)[0])).toBe('Claude has feelings. check the log.');
});
