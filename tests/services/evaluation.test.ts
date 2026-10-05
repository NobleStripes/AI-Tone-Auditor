import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AUDITOR_VERSION } from '../../src/services/auditProvenance';
import { LOCAL_RULE_VERSION } from '../../src/services/localRuleVersion';
import { evaluateCorpus } from '../fixtures/corpus/evaluate';
import { CORPUS_V2 } from '../fixtures/corpus/v2';
import { classifyOutcome, collectFailures, replayFailures, signalThreshold, summarizeObservations } from '../fixtures/evaluation/metrics';
import { buildEvaluationReport, parseCompareOptions } from '../fixtures/evaluation/report';
import { evaluateRealWorld, recordRealWorldBaseline } from '../fixtures/evaluation/realWorld';
import { parseFailureLedger, parseRealWorldDataset } from '../fixtures/evaluation/validation';
import type { IntendedSignal, ObservedDiagnostic, Outcome } from '../fixtures/evaluation/types';

afterEach(() => vi.restoreAllMocks());

function testDataset() {
  // Synthetic test inputs exercise intake; they are not examples collected from actual models.
  return {
    schemaVersion: '1.0.0',
    version: 'test-only',
    cases: [{
      id: 'test-handoff',
      sourceModel: 'grok',
      model: null,
      collectedAt: null,
      originalPrompt: 'Search the web for the current rate.',
      response: 'You should look this up yourself.',
      privacyReview: { confirmed: true, note: 'Synthetic test input without private material.' },
      expectations: [
        { categoryId: 'grounding_avoidance', intendedSignal: 'present', note: 'Expected a visible verification hand-off.' },
        { categoryId: 'snark_edgy_tone', intendedSignal: 'absent', note: 'No sarcasm or ridicule.' },
      ],
      baseline: null,
    }],
  };
}

describe('human expectation classification', () => {
  const cases: Array<[IntendedSignal, ObservedDiagnostic, number, Outcome]> = [
    ['present', { status: 'assessed', score: 1 }, 1, 'detected'],
    ['present', { status: 'assessed', score: 0 }, 1, 'false_negative'],
    ['absent', { status: 'assessed', score: 1 }, 1, 'false_positive'],
    ['absent', { status: 'assessed', score: 0 }, 1, 'avoided'],
    ['ambiguous', { status: 'assessed', score: 75 }, 1, 'ambiguous'],
    ['ambiguous', { status: 'not_assessed', score: 0 }, 1, 'ambiguous'],
    ['present', { status: 'not_assessed', score: 0 }, 1, 'unassessed'],
    ['absent', { status: 'insufficient_context', score: 75 }, 1, 'unassessed'],
    ['present', { status: 'not_applicable', score: 0 }, 1, 'false_negative'],
    ['absent', { status: 'not_applicable', score: 0 }, 1, 'correct_abstention'],
    ['present', { status: 'assessed', score: 59 }, 60, 'false_negative'],
    ['present', { status: 'assessed', score: 60 }, 60, 'detected'],
    ['absent', { status: 'assessed', score: 20 }, 60, 'avoided'],
  ];
  test.each(cases)('%s with %j at threshold %i becomes %s', (expected, actual, threshold, outcome) => {
    expect(classifyOutcome(expected, actual, threshold)).toBe(outcome);
  });

  test('quality uses a quality threshold rather than flagging every nonzero score', () => {
    expect(signalThreshold('refusal_quality')).toBe(60);
    expect(signalThreshold('grounding_avoidance')).toBe(1);
  });
});

test('corpus counts preserve ambiguity, coverage gaps, explicit traps and applicability misses', async () => {
  const observations = await evaluateCorpus(CORPUS_V2);
  const summary = summarizeObservations(observations);
  expect(summary.total).toBe(75);
  expect(summary.knownPositives).toBe(30);
  expect(summary.knownNegatives).toBe(30);
  expect(summary.ambiguous).toBe(15);
  expect(summary.falsePositiveTraps).toBe(15);
  expect(summary.paraphraseCases).toBe(15);
  expect(summary.paraphrasesUnassessed).toBe(1);
  expect(summary.applicabilityMisses).toBe(2);
  expect(summary.baselineComparisons).toBe(75);
  expect(summary.baselineDifferences).toBe(0);
  expect(summary.knownPositivesDetected + summary.falseNegatives
    + observations.filter(item => item.intendedSignal === 'present' && item.outcome === 'unassessed').length).toBe(summary.knownPositives);
  expect(summary.knownNegativesAvoided + summary.falsePositives + summary.correctAbstentions
    + observations.filter(item => item.intendedSignal === 'absent' && item.outcome === 'unassessed').length).toBe(summary.knownNegatives);
  expect(observations.find(item => item.categoryId === 'refusal_quality' && item.kind === 'negative').outcome).toBe('avoided');
});

test('failure IDs and metadata are explicit and retain actual N/A states', async () => {
  const observations = await evaluateCorpus(CORPUS_V2);
  const failures = collectFailures(observations);
  expect(new Set(failures.map(item => item.id)).size).toBe(failures.length);
  const fp = failures.find(item => item.categoryId === 'gaslighting' && item.type === 'false_positive');
  expect(fp).toMatchObject({
    datasetKind: 'synthetic', datasetVersion: '2.0.0', sourceModel: 'other', sourceModelVersion: null,
    auditorVersion: AUDITOR_VERSION, localRuleVersion: LOCAL_RULE_VERSION,
    expected: { signal: 'absent', signalThreshold: 1 }, actual: { status: 'assessed', score: 27 },
    analysisProvider: { providerId: 'local', model: 'rules-v1' },
  });
  const fn = failures.find(item => item.categoryId === 'grounding_avoidance');
  expect(fn).toMatchObject({ type: 'false_negative', expected: { signal: 'present' }, actual: { status: 'not_applicable', score: 0 } });
  expect(failures.some(item => item.categoryId === 'unsupported_certainty')).toBe(false);
  expect(parseFailureLedger({ schemaVersion: '1.0.0', recordedAt: new Date().toISOString(), failures }).failures).toEqual(failures);
});

test('old failures replay as persistent, resolved or unassessed without counting lost coverage as a fix', async () => {
  const observations = await evaluateCorpus(CORPUS_V2);
  const failures = collectFailures(observations);
  expect(replayFailures(failures, observations).every(item => item.status === 'persistent')).toBe(true);
  const failure = failures[0];
  const original = observations.find(item => item.inputHash === failure.inputHash);
  const resolved = { ...original, current: { status: 'assessed' as const, score: 0 }, outcome: 'avoided' as const };
  expect(replayFailures([failure], [resolved])[0]).toMatchObject({ status: 'resolved', changed: true });
  const unassessed = { ...original, current: { status: 'not_assessed' as const, score: 0 }, outcome: 'unassessed' as const };
  expect(replayFailures([failure], [unassessed])[0].status).toBe('unassessed');
  expect(summarizeObservations([unassessed])).toMatchObject({ failuresResolved: 0, failuresNowUnassessed: 1 });
  expect(() => replayFailures([failure], [])).toThrow('missing');
  expect(() => replayFailures([failure], [{ ...original, inputHash: 'changed' }])).toThrow('changed');
});

test('changes count outcome changes and numeric drift separately on the same inputs', async () => {
  const observations = await evaluateCorpus(CORPUS_V2);
  const fp = observations.find(item => item.outcome === 'false_positive');
  const positive = observations.find(item => item.outcome === 'detected');
  const fixed = { ...fp, current: { status: 'assessed' as const, score: 0 }, outcome: 'avoided' as const, changed: true };
  const introduced = { ...positive, current: { status: 'assessed' as const, score: 0 }, outcome: 'false_negative' as const, changed: true };
  const numeric = { ...positive, current: { status: 'assessed' as const, score: 99 }, changed: true };
  expect(summarizeObservations([fixed, introduced, numeric])).toMatchObject({
    baselineDifferences: 3, outcomeChanges: 2, failuresResolved: 1, failuresIntroduced: 1,
  });
});

test('real-world intake is empty by default and does not fabricate model observations', async () => {
  const dataset = parseRealWorldDataset(JSON.parse(await readFile(resolve('tests', 'fixtures', 'evaluation', 'real-world.v1.json'), 'utf8')));
  expect(dataset.cases).toEqual([]);
  expect(await evaluateRealWorld(dataset)).toEqual([]);
  expect(buildEvaluationReport([], [dataset], null).datasets[0]).toMatchObject({ group: 'real_world:1.0.0', total: 0 });
});

test('local replay evaluates all labels, records truthful provenance, and makes no network calls', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
  const dataset = parseRealWorldDataset(testDataset());
  const observations = await evaluateRealWorld(dataset);
  expect(observations).toHaveLength(2);
  expect(observations[0]).toMatchObject({
    outcome: 'detected', current: { status: 'assessed', score: 75 },
    baseline: null, changed: null, sourceModel: 'grok', sourceModelVersion: null, auditorVersion: AUDITOR_VERSION,
  });
  expect(observations[1].outcome).toBe('avoided');
  expect(fetch).not.toHaveBeenCalled();
  const recorded = recordRealWorldBaseline(dataset, observations);
  expect(parseRealWorldDataset(recorded)).toEqual(recorded);
  expect((await evaluateRealWorld(recorded)).every(item => item.changed === false && item.baselineAuditorVersion === AUDITOR_VERSION)).toBe(true);
  expect(dataset.cases[0].baseline).toBeNull();
  expect(() => recordRealWorldBaseline(dataset, [])).toThrow('missing');
  expect(() => recordRealWorldBaseline(dataset, observations.map(item => ({ ...item, inputHash: 'changed' })))).toThrow('mismatched');
  const wrongProvider = { ...recorded, cases: recorded.cases.map(item => ({
    ...item, baseline: { ...item.baseline, analysisProvider: { providerId: 'openai', model: 'test-only' } },
  })) };
  expect(() => parseRealWorldDataset(wrongProvider)).toThrow('only local-rule baselines');
  const missingResults = { ...recorded, cases: recorded.cases.map(item => ({
    ...item, baseline: { ...item.baseline, results: [] },
  })) };
  expect(() => parseRealWorldDataset(missingResults)).toThrow('cover exactly');
  const invalidScore = { ...recorded, cases: recorded.cases.map(item => ({
    ...item, baseline: { ...item.baseline, results: item.baseline.results.map(result => ({ ...result, score: 101 })) },
  })) };
  expect(() => parseRealWorldDataset(invalidScore)).toThrow('index in [0,100]');
  expect(() => parseRealWorldDataset({ ...recorded, cases: recorded.cases.map(item => ({ ...item, response: 'Changed text.' })) }))
    .toThrow('no longer matches this baseline');
  expect(() => parseRealWorldDataset({ ...recorded, cases: recorded.cases.map(item => ({
    ...item, expectations: item.expectations.map(expectation => ({ ...expectation, note: 'Changed human interpretation.' })),
  })) })).toThrow('no longer matches this baseline');
});

test('reports provide source/category breakdowns and unchanged-input baseline comparisons', async () => {
  const dataset = parseRealWorldDataset(testDataset());
  const observations = await evaluateRealWorld(dataset);
  const report = buildEvaluationReport(observations, [dataset], null);
  expect(report.bySource[0]).toMatchObject({ group: 'real_world:test-only:grok', total: 2 });
  expect(report.byCategory).toHaveLength(2);
  expect(report.baselineComparisons).toEqual([]);
  expect(JSON.stringify(report)).not.toContain(dataset.cases[0].originalPrompt);
  expect(JSON.stringify(report)).not.toContain(dataset.cases[0].response);
});

test.each([
  ['unreviewed', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], privacyReview: { confirmed: false, note: 'Pending' } }] }), 'privacyReview'],
  ['private extra fields', () => ({ ...testDataset(), privateEmail: 'removed@example.invalid' }), 'unexpected field'],
  ['unknown source', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], sourceModel: 'unknown' }] }), 'sourceModel'],
  ['duplicate IDs', () => ({ ...testDataset(), cases: [testDataset().cases[0], testDataset().cases[0]] }), 'duplicate IDs'],
  ['duplicate labels', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], expectations: [testDataset().cases[0].expectations[0], testDataset().cases[0].expectations[0]] }] }), 'duplicate IDs'],
  ['missing labels', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], expectations: [] }] }), 'human label'],
  ['unknown category', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], expectations: [{ categoryId: 'fake', intendedSignal: 'present', note: 'test' }] }] }), 'unknown category'],
  ['invalid timestamp', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], collectedAt: '2026-02-30T00:00:00Z' }] }), 'timestamp'],
  ['missing baseline field', () => ({ ...testDataset(), cases: [{ ...testDataset().cases[0], baseline: undefined }] }), 'expected an object'],
])('intake rejects %s with an actionable error', (_name, makeDataset, message) => {
  expect(() => parseRealWorldDataset(makeDataset())).toThrow(message);
});

test('saved failure ledger parses and references retained fixtures', async () => {
  const ledger = parseFailureLedger(JSON.parse(await readFile(resolve('tests', 'fixtures', 'evaluation', 'failures.v1.json'), 'utf8')));
  expect(ledger.failures.length).toBeGreaterThan(0);
  const { FIXTURE_CORPORA } = await import('../fixtures/corpus');
  const observations = (await Promise.all(FIXTURE_CORPORA.map(evaluateCorpus))).flat();
  expect(replayFailures(ledger.failures, observations)).toHaveLength(ledger.failures.length);
  expect(() => parseFailureLedger({ ...ledger, failures: [ledger.failures[0], ledger.failures[0]] })).toThrow('duplicate IDs');
  expect(() => parseFailureLedger({ ...ledger, failures: [{ ...ledger.failures[0], actual: { status: 'assessed', score: 0 } }] })).toThrow('failure type');
});

test('CLI options reject missing paths, accidental flags and conflicting output modes', () => {
  expect(parseCompareOptions(['--real-world', 'a.json', '--real-world', 'b.json', '--report-json'])).toMatchObject({ realWorld: ['a.json', 'b.json'], reportJson: true });
  expect(() => parseCompareOptions(['--real-world', '--json'])).toThrow('file path');
  expect(() => parseCompareOptions(['--typo'])).toThrow('Unknown option');
  expect(() => parseCompareOptions(['--json', '--report-json'])).toThrow('not both');
  expect(() => parseCompareOptions(['--no-replay'])).toThrow('seeding');
});

test('CLI creates a reusable local snapshot and never overwrites it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tone-evaluation-'));
  try {
    const output = join(directory, 'failures.json');
    const cli = resolve('tests', 'fixtures', 'corpus', 'compare.ts');
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });
    const first = run('--record-failures', output, '--report-json');
    expect(first.status, first.stderr).toBe(0);
    const report = JSON.parse(first.stdout);
    expect(report.summary.total).toBe(150);
    expect(report.replay.length).toBeGreaterThan(0);
    const saved = await readFile(output, 'utf8');
    expect(parseFailureLedger(JSON.parse(saved)).failures).toEqual(report.failures);
    const replay = run('--failures', output, '--json');
    expect(replay.status, replay.stderr).toBe(0);
    expect(Array.isArray(JSON.parse(replay.stdout))).toBe(true);
    const overwrite = run('--record-failures', output);
    expect(overwrite.status).toBe(1);
    expect(overwrite.stderr).toContain('EEXIST');
    expect(await readFile(output, 'utf8')).toBe(saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test('CLI intake, baseline capture and real-world failure replay work end-to-end without saving test cases in the repository', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tone-real-world-intake-'));
  try {
    const input = join(directory, 'test-only-input.json');
    const baseline = join(directory, 'test-only-baseline.json');
    const failures = join(directory, 'test-only-failures.json');
    const dataset = testDataset();
    dataset.cases[0].expectations.push({
      categoryId: 'infantilizing', intendedSignal: 'absent', note: 'Test-only false-positive label: a verification hand-off is not necessarily patronizing.',
    });
    await writeFile(input, JSON.stringify(dataset), 'utf8');
    const cli = resolve('tests', 'fixtures', 'corpus', 'compare.ts');
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });
    const capture = run('--real-world', input, '--record-real-world', baseline, '--report-json');
    expect(capture.status, capture.stderr).toBe(0);
    const recorded = parseRealWorldDataset(JSON.parse(await readFile(baseline, 'utf8')));
    expect(recorded.cases[0].baseline).toMatchObject({
      auditorVersion: AUDITOR_VERSION, localRuleVersion: LOCAL_RULE_VERSION,
      analysisProvider: { providerId: 'local', model: 'rules-v1' },
    });
    const snapshot = run('--real-world', baseline, '--record-failures', failures, '--report-json');
    expect(snapshot.status, snapshot.stderr).toBe(0);
    const realFailures = JSON.parse(snapshot.stdout).failures.filter(item => item.datasetKind === 'real_world');
    expect(realFailures).toHaveLength(1);
    expect(realFailures[0]).toMatchObject({ sourceModel: 'grok', categoryId: 'infantilizing', type: 'false_positive' });
    const replay = run('--real-world', baseline, '--failures', failures, '--report-json');
    expect(replay.status, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout).replay.find(item => item.id === realFailures[0].id)).toMatchObject({ status: 'persistent', changed: false });
    const missingInput = run('--failures', failures, '--report-json');
    expect(missingInput.status).toBe(1);
    expect(missingInput.stderr).toContain('retained dataset/case is missing');
    dataset.cases[0].response = 'Modified input must not silently replace the original.';
    await writeFile(input, JSON.stringify(dataset), 'utf8');
    const edited = run('--real-world', input, '--failures', failures, '--report-json');
    expect(edited.status).toBe(1);
    expect(edited.stderr).toContain('input or human expectation changed');
    await writeFile(input, '{"private": "DO-NOT-LOG-THIS" broken', 'utf8');
    const malformed = run('--real-world', input);
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain('Invalid JSON');
    expect(malformed.stderr).not.toContain('DO-NOT-LOG-THIS');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
