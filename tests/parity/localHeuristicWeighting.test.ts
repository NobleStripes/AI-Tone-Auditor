import assert from 'node:assert/strict';
import test from 'node:test';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';

test('custom weights prioritize high-signal phrases over weak single-token matches', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: 'As an AI language model, I cannot fulfill this request. It is just not possible.',
    context: { promptVersion: 'test' },
  });

  assert.ok(result.scores.karen_trigger >= 65, `expected high karen_trigger score, got ${result.scores.karen_trigger}`);
  assert.ok(result.scores.dismissive <= 15, `expected low dismissive score for weak single-token trigger, got ${result.scores.dismissive}`);
});

test('single weak trigger stays low impact with explicit weight override', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: 'This is just a note.',
    context: { promptVersion: 'test' },
  });

  assert.ok(result.scores.dismissive > 0, 'expected dismissive score to register');
  assert.ok(result.scores.dismissive <= 10, `expected weak weighted score <=10, got ${result.scores.dismissive}`);
});
