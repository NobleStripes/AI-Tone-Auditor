import assert from 'node:assert/strict';
import test from 'node:test';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';

test('does not invent euphemisms, including when safety guidelines are mentioned', async () => {
  for (const text of ['The result is 42.', 'Follow the laboratory safety guidelines.']) {
    const result = await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
    assert.deepEqual(result.euphemisms, []);
    if (text.includes('safety guidelines')) {
      const finding = result.findings.find((item) => item.text === 'Safety guidelines');
      assert.ok(finding);
      assert.match(finding.explanation, /phrase alone does not establish/);
      assert.doesNotMatch(finding.explanation, /often when no actual safety risk exists/);
    }
  }
});

test('describes response length without attributing safety language to missing prompt context', async () => {
  const result = await localHeuristicProvider.analyzeTone({ text: 'The result is 42.', context: { promptVersion: 'test' } });
  assert.match(result.contextAnalysis.feedback, /Response length alone does not establish/);
  assert.match(result.contextAnalysis.heatmap[0].explanation ?? '', /original prompt and reasons for safety language are not available/);
  assert.doesNotMatch(JSON.stringify(result.contextAnalysis), /increases generic safety|force broad safety/);
});

test('does not equate a longer response with sufficient context', async () => {
  const result = await localHeuristicProvider.analyzeTone({ text: 'A longer response sample. '.repeat(30), context: { promptVersion: 'test' } });
  assert.match(result.contextAnalysis.feedback, /Response length alone does not establish context adequacy/);
});

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

test('scores newly added AI tic categories from explicit phrase markers', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: "Great question. You're absolutely right. I apologize again. To summarize, here's the same answer. I hope this helps.",
    context: { promptVersion: 'test' },
  });

  assert.ok(result.scores.sycophancy > 0, 'expected sycophancy markers to score');
  assert.ok(result.scores.over_apologizing > 0, 'expected apology loop markers to score');
  assert.ok(result.scores.repetitive_filler > 0, 'expected stock filler markers to score');
});

test('does not infer unsupported certainty without verification context or external sources', async () => {
  const result = await localHeuristicProvider.analyzeTone({
    text: 'The current rate is definitely 42.',
    context: { promptVersion: 'test' },
  });

  assert.equal(result.scores.unsupported_certainty, 0);
  assert.equal(result.scores.grounding_avoidance, 0);
  assert.equal(result.scores.refusal_quality, 0);
  assert.equal(result.scores.needless_escalation, 0);
});
