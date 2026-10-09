import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { parseAuditHistory } from '../../src/types/history';
import type { AuditSnapshot, FeedbackKind, FeedbackReport } from '../../src/types/feedback';
import { checkedPassage, emptyFeedbackStore, findingTargetId, parseFeedbackStore, removeHistoryFeedback, saveFeedbackReport } from '../../src/services/feedbackStore';
import { suggestExpectations, validateEvaluationExport } from '../../src/services/evaluationExport';
import { parseRealWorldDataset, parseSyntheticDataset } from '../../src/services/evaluationValidation';
import { parseSyntheticDataset as parseSyntheticWithHash } from '../fixtures/evaluation/validation';
import { evaluateRealWorld, recordRealWorldBaseline } from '../fixtures/evaluation/realWorld';
import { collectFailures, replayFailures } from '../fixtures/evaluation/metrics';
import type { SyntheticDataset } from '../../src/types/evaluation';

function snapshot(): AuditSnapshot {
  return { auditId: 'single:stable-id', historyId: 'stable-id', response: 'Calm down. Calm down.',
    sourceModel: 'other', automatedResultJson: JSON.stringify(emptyAnalysisResult()), provenanceJson: null, runtimeMetaJson: null };
}
function report(kind: FeedbackKind = 'false_positive'): FeedbackReport {
  return { id: 'report-1', auditId: snapshot().auditId, targetId: 'missed:second-occurrence', kind, categoryId: 'de_escalation',
    note: 'Authored test example: human interpretation differs from the rule.',
    passage: checkedPassage(snapshot().response, 11, 20),
    createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' };
}
function dataset(): SyntheticDataset {
  const drafts = suggestExpectations([report()]).map(item => ({ ...item, confirmed: true }));
  return parseSyntheticDataset(validateEvaluationExport({
    schemaVersion: '1.0.0', datasetKind: 'synthetic', version: 'authored-feedback-test',
    cases: [{ id: 'authored-fp', sourceModel: 'other', model: null, collectedAt: null, originalPrompt: '',
      response: snapshot().response, privacyReview: { confirmed: true, note: 'Authored example without private material.' },
      expectations: drafts.map(({ categoryId, intendedSignal, note }) => ({ categoryId, intendedSignal, note })), baseline: null }],
  }, 'synthetic', drafts));
}

describe('local human reports', () => {
  test.each(['supported', 'false_positive', 'ambiguous', 'missed_signal'] as const)('%s round-trips without changing its automated snapshot', kind => {
    const original = snapshot();
    const serialized = JSON.stringify(original);
    const store = saveFeedbackReport(emptyFeedbackStore(), original, report(kind));
    expect(parseFeedbackStore(JSON.stringify(store))).toEqual(store);
    expect(JSON.stringify(original)).toBe(serialized);
    expect(store.audits[0].automatedResultJson).toBe(original.automatedResultJson);
    expect(store.audits[0]).not.toHaveProperty('originalPrompt');
  });
  test('wrong-category feedback needs a distinct intended category and reason', () => {
    expect(() => saveFeedbackReport(emptyFeedbackStore(), snapshot(), report('wrong_category'))).toThrow('invalid');
    const corrected = { ...report('wrong_category'), intendedCategoryId: 'infantilizing' as const };
    const store = saveFeedbackReport(emptyFeedbackStore(), snapshot(), corrected);
    expect(store.reports[0]).toEqual(corrected);
    expect(suggestExpectations(store.reports).map(item => [item.categoryId, item.intendedSignal, item.confirmed])).toEqual([
      ['de_escalation', 'absent', false], ['infantilizing', 'present', false],
    ]);
  });
  test('updates a target judgment without replacing the original automated result', () => {
    const first = saveFeedbackReport(emptyFeedbackStore(), snapshot(), report());
    const revised = saveFeedbackReport(first, snapshot(), { ...report(), kind: 'ambiguous', updatedAt: '2026-10-09T01:00:00Z' });
    expect(revised.reports).toHaveLength(1);
    expect(revised.reports[0].kind).toBe('ambiguous');
    expect(first.reports[0].kind).toBe('false_positive');
    expect(revised.audits).toEqual(first.audits);
  });
  test('rejects a changed response under an existing audit reference', () => {
    const first = saveFeedbackReport(emptyFeedbackStore(), snapshot(), report());
    expect(() => saveFeedbackReport(first, { ...snapshot(), response: 'Edited response' }, report())).toThrow('different snapshot');
    expect(() => saveFeedbackReport(first, snapshot(), { ...report(), auditId: 'different-audit' })).toThrow('does not match');
  });
  test('missed reports require real offsets and cannot manufacture an automated finding', () => {
    const store = saveFeedbackReport(emptyFeedbackStore(), snapshot(), report('missed_signal'));
    expect(JSON.parse(store.audits[0].automatedResultJson).findings).toEqual([]);
    expect(store.reports[0].passage).toMatchObject({ startOffset: 11, endOffset: 20, matchedText: 'Calm down' });
    expect(() => saveFeedbackReport(emptyFeedbackStore(), snapshot(), { ...report('missed_signal'), passage: undefined })).toThrow('located');
    expect(() => saveFeedbackReport(emptyFeedbackStore(), snapshot(), { ...report(), passage: { ...report().passage, matchedText: 'Invented' } })).toThrow('no longer matches');
    expect(() => checkedPassage(snapshot().response, -1, 8)).toThrow('nonempty passage');
    expect(() => checkedPassage(snapshot().response, 0, 100)).toThrow('nonempty passage');
  });
  test('unverified quotes remain unverified after human support', () => {
    const store = saveFeedbackReport(emptyFeedbackStore(), snapshot(), { ...report('supported'),
      passage: { matchedText: 'Invented quotation', verification: 'unverified', eligibility: 'included' } });
    expect(store.reports[0].passage.verification).toBe('unverified');
    expect(store.audits[0].automatedResultJson).toBe(snapshot().automatedResultJson);
  });
  test('history deletion does not delete independent comparison feedback', () => {
    const first = saveFeedbackReport(emptyFeedbackStore(), snapshot(), report());
    const comparison = { ...snapshot(), auditId: 'comparison:session:response-1', historyId: undefined };
    const both = saveFeedbackReport(first, comparison, { ...report(), id: 'comparison-report', auditId: comparison.auditId });
    const remaining = removeHistoryFeedback(both, ['stable-id']);
    expect(remaining.audits.map(audit => audit.auditId)).toEqual([comparison.auditId]);
    expect(remaining.reports.map(item => item.id)).toEqual(['comparison-report']);
  });
  test('corrupt data is rejected instead of silently replaced', () => {
    expect(() => parseFeedbackStore('{ broken')).toThrow();
    expect(() => parseFeedbackStore(JSON.stringify({ ...emptyFeedbackStore(), originalPrompt: 'must not persist' }))).toThrow('invalid');
    const saved = saveFeedbackReport(emptyFeedbackStore(), snapshot(), report());
    expect(() => parseFeedbackStore(JSON.stringify({ ...saved, reports: [report(), report()] }))).toThrow('duplicate');
  });
});

test('restored display filtering and repeated text retain original finding references', () => {
  const original = emptyAnalysisResult();
  original.findings = [
    { category: 'Unsolicited Moralizing', text: 'Reflect on your ethics.', explanation: 'Context-dependent', severity: 'medium' },
    { category: 'Forced De-escalation', text: 'Calm down', explanation: 'First', severity: 'low' },
    { category: 'Forced De-escalation', text: 'Calm down', explanation: 'Second', severity: 'low' },
  ];
  original.scores.unsolicited_moralizing = 75;
  const restored = parseAuditHistory(JSON.stringify([{ id: 'legacy', title: 'Old', timestamp: 123, responseText: snapshot().response, data: original }]))[0];
  expect(restored.data.findings).toHaveLength(2);
  expect(JSON.parse(restored.originalResultJson).scores.unsolicited_moralizing).toBe(75);
  const savedSnapshot = { ...snapshot(), automatedResultJson: restored.originalResultJson };
  expect(findingTargetId(savedSnapshot, restored.data.findings, 0)).toBe('finding:1');
  expect(findingTargetId(savedSnapshot, restored.data.findings, 1)).toBe('finding:2');
  expect(parseAuditHistory(JSON.stringify([restored]))[0].originalResultJson).toBe(restored.originalResultJson);
});

test('conflicting passage judgments and positive quality require response-level decisions', () => {
  const drafts = suggestExpectations([report(), { ...report('supported'), id: 'second', targetId: 'other' },
    { ...report('missed_signal'), id: 'quality', targetId: 'quality', categoryId: 'refusal_quality' }]);
  expect(drafts[0]).toMatchObject({ intendedSignal: 'ambiguous', confirmed: false, conflict: true });
  expect(drafts[1]).toMatchObject({ categoryId: 'refusal_quality', intendedSignal: 'ambiguous', confirmed: false });
  expect(() => validateEvaluationExport(dataset(), 'synthetic', drafts)).toThrow('Confirm every');
});

test('existing real-world schema rejects synthetic envelopes, while null metadata stays null', () => {
  expect(() => parseRealWorldDataset(dataset())).toThrow('unexpected field');
  const { datasetKind, ...realShape } = dataset();
  expect(parseRealWorldDataset(realShape).cases[0]).toMatchObject({ model: null, collectedAt: null, baseline: null });
});

test('shared browser structural validation cannot bypass a non-null baseline fingerprint', async () => {
  const input = dataset();
  const recorded = recordRealWorldBaseline(input, await evaluateRealWorld(input));
  expect(() => parseSyntheticDataset(recorded)).toThrow('fingerprint verification');
  expect(parseSyntheticWithHash(recorded)).toEqual(recorded);
  expect(() => parseSyntheticWithHash({ ...recorded, cases: [{ ...recorded.cases[0], response: 'Edited response.' }] })).toThrow('no longer matches');
});

test('false positive, missed signal and ambiguity export as real observations without fabricated findings', async () => {
  const input = dataset();
  input.cases[0].expectations.push(
    { categoryId: 'gaslighting', intendedSignal: 'present', note: 'Authored missed-signal test with no lexical match.' },
    { categoryId: 'hedging', intendedSignal: 'ambiguous', note: 'Authored ambiguity test.' });
  const observations = await evaluateRealWorld(input);
  expect(observations.map(item => [item.datasetKind, item.kind, item.outcome])).toEqual([
    ['synthetic', 'synthetic_import', 'false_positive'], ['synthetic', 'synthetic_import', 'false_negative'],
    ['synthetic', 'synthetic_import', 'ambiguous'],
  ]);
  const failures = collectFailures(observations);
  expect(failures).toHaveLength(2);
  expect(replayFailures(failures, observations).every(item => item.status === 'persistent')).toBe(true);
});

test('UI-shaped synthetic export loads through the actual CLI, records a baseline and replays failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tone-feedback-export-'));
  try {
    const input = join(directory, 'synthetic-input.json');
    const baseline = join(directory, 'synthetic-baseline.json');
    const ledger = join(directory, 'synthetic-failures.json');
    await writeFile(input, JSON.stringify(dataset()), 'utf8');
    const cli = resolve('tests', 'fixtures', 'corpus', 'compare.ts');
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });
    const capture = run('--synthetic', input, '--record-synthetic', baseline, '--report-json');
    expect(capture.status, capture.stderr).toBe(0);
    const recorded = parseSyntheticWithHash(JSON.parse(await readFile(baseline, 'utf8')));
    expect(recorded.datasetKind).toBe('synthetic');
    expect(recorded.cases[0].baseline.analysisProvider.providerId).toBe('local');
    const tracking = run('--synthetic', baseline, '--record-failures', ledger, '--report-json');
    expect(tracking.status, tracking.stderr).toBe(0);
    const failure = JSON.parse(tracking.stdout).failures.find(item => item.caseId === 'authored-fp');
    expect(failure).toMatchObject({ type: 'false_positive', datasetKind: 'synthetic' });
    const replay = run('--synthetic', baseline, '--failures', ledger, '--report-json');
    expect(replay.status, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout).replay.find(item => item.id === failure.id)).toMatchObject({ status: 'persistent', changed: false });
    expect(run('--real-world', input).stderr).toContain('unexpected field');
    const overwrite = run('--synthetic', input, '--record-synthetic', baseline);
    expect(overwrite.status).toBe(1);
    expect(overwrite.stderr).toContain('EEXIST');
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
