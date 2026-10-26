// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { emptyAnalysisResult } from '../../src/types/analysis';
import type { Evidence } from '../../src/types/evidence';
import type { EvidencePassage, EvidenceExpectation, ObservedEvidence } from '../../src/types/evaluation';
import { evaluateEvidence, observeEvidence } from '../../src/services/evaluationEvidence';
import { parseSyntheticDataset, parseRealWorldDataset, validateSplitSeparation } from '../../src/services/evaluationValidation';
import { classifyOutcome, evaluationPartition } from '../../src/services/evaluationConventions';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { evaluateRealWorld, recordRealWorldBaseline } from '../fixtures/evaluation/realWorld';
import { hashInput, summarizeObservations } from '../fixtures/evaluation/metrics';
import { buildEvaluationReport } from '../fixtures/evaluation/report';

afterEach(() => vi.restoreAllMocks());
const span = (text: string, marker: string, start = text.indexOf(marker)): EvidencePassage => ({
  startOffset: start, endOffset: start + marker.length, matchedText: marker,
});
const empty = (): ObservedEvidence => ({ passages: [], exclusions: [], invalidRecords: 0 });
const expected = (passages: EvidencePassage[] = []): EvidenceExpectation => ({ passages, exclusions: [] });
function finding(text: string, passage: EvidencePassage, overrides: Partial<Evidence> = {}) {
  const result = emptyAnalysisResult();
  result.scores.de_escalation = 33;
  result.assessments.de_escalation = { status: 'assessed', reason: 'Test observation.', confidence: 'high', method: 'lexical_rule' };
  result.findings = [{ category: 'Forced De-escalation', text: passage.matchedText, explanation: 'Test observation.', severity: 'low',
    evidence: { ...passage, verification: 'verified', eligibility: 'included', ...overrides } }];
  return result;
}
function dataset() {
  const response = 'Calm down. Calm down.';
  return {
    schemaVersion: '1.1.0', datasetKind: 'synthetic', version: 'test-evidence',
    cases: [{ id: 'one', split: 'development', sourceModel: 'other', model: null, collectedAt: null,
      originalPrompt: 'Explain the error.', response,
      privacyReview: { confirmed: true, note: 'Authored test input without private material.' },
      expectations: [{ categoryId: 'de_escalation', intendedSignal: 'present', note: 'Both direct commands need exact evidence.',
        expectedAssessment: 'assessed', evidence: expected([span(response, 'Calm down'), span(response, 'Calm down', 11)]) }],
      baseline: null }],
  };
}

test('a correct category with the wrong repeated passage fails evidence evaluation', () => {
  const response = 'Calm down. Calm down.';
  const result = finding(response, span(response, 'Calm down'));
  const observed = observeEvidence(result, 'de_escalation', response);
  const evaluated = evaluateEvidence(expected([span(response, 'Calm down', 11)]), observed, 'assessed');
  expect(classifyOutcome('present', { status: 'assessed', score: 33 }, 1)).toBe('detected');
  expect(evaluated).toMatchObject({ passed: false, matchedPassages: 0,
    missingPassages: [span(response, 'Calm down', 11)], unexpectedPassages: [span(response, 'Calm down')] });
});

test('overly broad quotations are both missing exact support and unexpected evidence', () => {
  const response = 'Calm down. A neutral explanation.';
  const observed = observeEvidence(finding(response, span(response, response)), 'de_escalation', response);
  expect(evaluateEvidence(expected([span(response, 'Calm down')]), observed, 'assessed'))
    .toMatchObject({ passed: false, missingPassages: [span(response, 'Calm down')], unexpectedPassages: [span(response, response)] });
});

test('unrelated flagged text is retained as an unexpected passage', () => {
  const response = 'Calm down. Neutral explanation.';
  const result = finding(response, span(response, 'Calm down'));
  result.findings.push(finding(response, span(response, 'Neutral explanation')).findings[0]);
  expect(evaluateEvidence(expected([span(response, 'Calm down')]), observeEvidence(result, 'de_escalation', response), 'assessed'))
    .toMatchObject({ matchedPassages: 1, passed: false, unexpectedPassages: [span(response, 'Neutral explanation')] });
});

test('excluded wording incorrectly used as support produces both inspection and exclusion errors', () => {
  const response = '`Calm down`';
  const excluded = { ...span(response, 'Calm down'), exclusionReason: 'inline_code' as const };
  const evaluated = evaluateEvidence({ passages: [], exclusions: [excluded] },
    observeEvidence(finding(response, span(response, 'Calm down')), 'de_escalation', response), 'assessed');
  expect(evaluated).toMatchObject({ passed: false, missingExclusions: [excluded], exclusionViolations: [excluded] });
});

test('a correctly retained exclusion passes without altering the automated result', async () => {
  const response = '`Calm down`';
  const result = await localHeuristicProvider.analyzeTone({ text: response, context: { promptVersion: 'test' } });
  const before = JSON.stringify(result);
  const observed = observeEvidence(result, 'de_escalation', response);
  expect(evaluateEvidence({ passages: [], exclusions: [{ ...span(response, 'Calm down'), exclusionReason: 'inline_code' }] }, observed, 'assessed').passed).toBe(true);
  expect(JSON.stringify(result)).toBe(before);
});

test.each(['not_assessed', 'insufficient_context'] as const)('empty expected evidence never turns %s into a passed check', status => {
  expect(evaluateEvidence(expected(), empty(), status)).toMatchObject({ status: 'coverage_gap', passed: false });
});

test('a legitimate not-applicable negative can pass a labeled absence check', () => {
  expect(evaluateEvidence(expected(), empty(), 'not_applicable')).toMatchObject({ status: 'evaluated', passed: true });
});

test.each([{ verification: 'unverified' }, { matchedText: 'Invented' }, { startOffset: 99 }])('invalid source records are not converted into clean evidence: %j', override => {
  const response = 'Calm down.';
  const observed = observeEvidence(finding(response, span(response, 'Calm down'), override as Partial<Evidence>), 'de_escalation', response);
  expect(observed).toMatchObject({ passages: [], invalidRecords: 1 });
  expect(evaluateEvidence(expected(), observed, 'assessed').passed).toBe(false);
});

test('response-scope absence checks do not pretend to quote excluded words', () => {
  const response = '`Calm down` and no visible source.';
  const scope = { ...span(response, response), kind: 'response_scope' as const };
  const excluded = { ...span(response, 'Calm down'), exclusionReason: 'inline_code' as const };
  expect(evaluateEvidence({ passages: [scope], exclusions: [excluded] },
    { passages: [scope], exclusions: [excluded], invalidRecords: 0 }, 'assessed')).toMatchObject({ passed: true, exclusionViolations: [] });
  expect(evaluateEvidence(expected([scope]), { ...empty(), passages: [span(response, response)] }, 'assessed').passed).toBe(false);
});

test('duplicate mechanisms do not inflate passage counts', () => {
  const response = 'Calm down.';
  const result = finding(response, span(response, 'Calm down'));
  result.findings.push(structuredClone(result.findings[0]));
  const observed = observeEvidence(result, 'de_escalation', response);
  expect(observed.passages).toHaveLength(1);
  expect(evaluateEvidence(expected([span(response, 'Calm down')]), observed, 'assessed')).toMatchObject({ matchedPassages: 1, passed: true });
});

test('Unicode and CRLF positions use exact UTF-16 slices', () => {
  const response = '\u{1f600}\r\nCalm down.';
  const passage = span(response, 'Calm down');
  expect(passage.startOffset).toBe(4);
  expect(evaluateEvidence(expected([passage]), observeEvidence(finding(response, passage), 'de_escalation', response), 'assessed').passed).toBe(true);
});

test('schema 1.1 annotations survive intake and evidence baseline replay', async () => {
  const parsed = parseSyntheticDataset(dataset(), hashInput);
  const observations = await evaluateRealWorld(parsed);
  expect(observations[0].evidence.current.passed).toBe(true);
  const recorded = recordRealWorldBaseline(parsed, observations);
  expect(parseSyntheticDataset(recorded, hashInput)).toEqual(recorded);
  const replay = await evaluateRealWorld(parseSyntheticDataset(recorded, hashInput));
  expect(replay[0].evidence).toMatchObject({ changed: false, baseline: { passed: true }, current: { passed: true } });
  expect(summarizeObservations(replay)).toMatchObject({ evidenceBaselineComparisons: 1, evidenceBaselineDifferences: 0 });
  expect(() => parseSyntheticDataset(recorded)).toThrow('fingerprint verification');
});

test.each([
  ['passage annotation', (data: ReturnType<typeof dataset>) => { data.cases[0].expectations[0].evidence.passages.pop(); }],
  ['assessment expectation', (data: ReturnType<typeof dataset>) => { data.cases[0].expectations[0].expectedAssessment = 'not_assessed'; }],
  ['split', (data: ReturnType<typeof dataset>) => { data.cases[0].split = 'held_out'; }],
])('recorded fingerprints reject a changed %s', async (_name, change) => {
  const parsed = parseSyntheticDataset(dataset(), hashInput);
  const recorded = recordRealWorldBaseline(parsed, await evaluateRealWorld(parsed));
  const modified = structuredClone(recorded) as unknown as ReturnType<typeof dataset>;
  change(modified);
  expect(() => parseSyntheticDataset(modified, hashInput)).toThrow('no longer matches');
});

test('losing evidence coverage is visible and never reported as a resolved failure', async () => {
  const raw = dataset();
  raw.cases[0].expectations[0].evidence.passages = [span(raw.cases[0].response, 'Calm down', 11)];
  const parsed = parseSyntheticDataset(raw, hashInput);
  const recorded = recordRealWorldBaseline(parsed, await evaluateRealWorld(parsed));
  const data = emptyAnalysisResult();
  data.assessments.de_escalation = { status: 'not_assessed', reason: 'Coverage unavailable.', confidence: 'unknown', method: 'lexical_rule' };
  vi.spyOn(localHeuristicProvider, 'analyzeTone').mockResolvedValue(data);
  const observations = await evaluateRealWorld(parseSyntheticDataset(recorded, hashInput));
  expect(summarizeObservations(observations)).toMatchObject({ evidenceCoverageLost: 1, evidenceCoverageGaps: 1, evidenceFailuresResolved: 0, evidencePassed: 0 });
});

test('legacy files preserve their fingerprints and remain evidence-unlabeled', async () => {
  const raw = dataset();
  const { split, ...fixture } = raw.cases[0];
  const label = { categoryId: 'de_escalation' as const, intendedSignal: 'present' as const, note: 'Legacy human label.' };
  const legacy = { schemaVersion: '1.0.0', datasetKind: 'synthetic', version: 'legacy-test', cases: [{ ...fixture, expectations: [label] }] };
  const parsed = parseSyntheticDataset(legacy, hashInput);
  const observations = await evaluateRealWorld(parsed);
  const oldHash = createHash('sha256').update(JSON.stringify(['other', null, fixture.originalPrompt, fixture.response, label])).digest('hex');
  expect(observations[0].inputHash).toBe(oldHash);
  expect(observations[0].evidence).toBeUndefined();
  expect(summarizeObservations(observations)).toMatchObject({ evidenceUnlabeled: 1, evidencePassed: 0, evidenceLabeled: 0 });
  expect(() => parseSyntheticDataset({ ...raw, schemaVersion: '1.0.0' }, hashInput)).toThrow('unexpected field');
  expect(parseRealWorldDataset({ schemaVersion: '1.0.0', version: 'empty', cases: [] }).cases).toEqual([]);
});

test.each([
  ['negative offset', (raw: ReturnType<typeof dataset>) => { raw.cases[0].expectations[0].evidence.passages[0].startOffset = -1; }],
  ['altered quotation', (raw: ReturnType<typeof dataset>) => { raw.cases[0].expectations[0].evidence.passages[0].matchedText = 'calm down'; }],
  ['duplicate passage', (raw: ReturnType<typeof dataset>) => { raw.cases[0].expectations[0].evidence.passages.push(raw.cases[0].expectations[0].evidence.passages[0]); }],
  ['contradictory exclusion', (raw: ReturnType<typeof dataset>) => { raw.cases[0].expectations[0].evidence.exclusions.push({ ...raw.cases[0].expectations[0].evidence.passages[0], exclusionReason: 'reported_speech' }); }],
  ['unknown reason', (raw: ReturnType<typeof dataset>) => { raw.cases[0].expectations[0].evidence.exclusions.push({ ...span(raw.cases[0].response, 'Calm down'), exclusionReason: 'fake' as never }); raw.cases[0].expectations[0].evidence.passages = []; }],
])('rejects invalid evidence annotations: %s', (_name, change) => {
  const raw = dataset(); change(raw);
  expect(() => parseSyntheticDataset(raw, hashInput)).toThrow();
});

test('equivalent inputs cannot leak between development and held-out partitions', () => {
  expect(() => validateSplitSeparation([
    { originalPrompt: 'Explain this.', response: "I'm sorry.  Calm down.", split: 'development' },
    { originalPrompt: 'EXPLAIN THIS.', response: 'I\u2019m sorry.\nCalm down.', split: 'held_out' },
  ])).toThrow('split leakage');
  const raw = dataset();
  raw.cases.push({ ...structuredClone(raw.cases[0]), id: 'copy', split: 'held_out' });
  expect(() => parseSyntheticDataset(raw, hashInput)).toThrow('split leakage');
});

test('a pair cannot silently span splits or lose its counterexample', () => {
  const raw = dataset() as any;
  raw.cases[0].pairId = 'one-pair';
  expect(() => parseSyntheticDataset(raw, hashInput)).toThrow('exactly two cases');
  raw.cases.push({ ...structuredClone(raw.cases[0]), id: 'two', response: 'Neutral response.', split: 'held_out',
    expectations: [{ categoryId: 'de_escalation', intendedSignal: 'absent', note: 'Neutral case.', evidence: expected() }] });
  expect(() => parseSyntheticDataset(raw, hashInput)).toThrow('same split');
});

test('authored pairs cover all six contrasts in both partitions without relabeling them as real', async () => {
  const suite = parseSyntheticDataset(JSON.parse(readFileSync('tests/fixtures/evaluation/evidence-pairs.v1.json', 'utf8')), hashInput);
  expect(suite.datasetKind).toBe('synthetic');
  expect(suite.cases).toHaveLength(24);
  const pairs = new Set(suite.cases.map(item => item.pairId));
  expect(pairs.size).toBe(12);
  for (const pairId of pairs) {
    const pair = suite.cases.filter(item => item.pairId === pairId);
    expect(pair.map(item => item.expectations[0].intendedSignal).sort()).toEqual(['absent', 'present']);
    expect(pair.every(item => item.expectations[0].evidence !== undefined)).toBe(true);
  }
  const observations = await evaluateRealWorld(suite);
  const report = buildEvaluationReport(observations, [suite], null);
  expect(report.bySplit.map(item => [item.group, item.total])).toEqual([
    ['synthetic:evidence-pairs.1.0.0:development', 12], ['synthetic:evidence-pairs.1.0.0:held_out', 12],
  ]);
  expect(report.pairs).toHaveLength(12);
  expect(report.evidenceFailures.some(item => item.type === 'unexpected_passage')).toBe(true);
  const advice = observations.find(item => item.id === 'development/advice/positive');
  expect(advice.outcome).toBe('detected');
  expect(advice.evidence.current.passed).toBe(false);
});

test('assessment mismatches are reported even without passage annotations', async () => {
  const raw = dataset();
  delete raw.cases[0].expectations[0].evidence;
  raw.cases[0].expectations[0].expectedAssessment = 'not_applicable';
  const observations = await evaluateRealWorld(parseSyntheticDataset(raw, hashInput));
  const report = buildEvaluationReport(observations, [], null);
  expect(report.summary).toMatchObject({ assessmentChecks: 1, assessmentMismatches: 1, evidenceUnlabeled: 1, evidencePassed: 0 });
  expect(report.evidenceFailures[0]).toMatchObject({ type: 'assessment_mismatch', detail: { expected: 'not_applicable', actual: 'assessed' } });
});

test('CLI records and replays evidence baselines without evaluating the retained suite twice', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tone-evidence-cli-'));
  const output = join(directory, 'baseline.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/corpus/compare.ts', ...args], {
    cwd: resolve('.'), encoding: 'utf8', maxBuffer: 5_000_000,
  });
  try {
    const first = run('--synthetic', 'tests/fixtures/evaluation/evidence-pairs.v1.json', '--record-synthetic', output, '--report-json');
    expect(first.status, first.stderr).toBe(0);
    const firstReport = JSON.parse(first.stdout);
    expect(firstReport.summary.total).toBe(399);
    const recorded = parseSyntheticDataset(JSON.parse(readFileSync(output, 'utf8')), hashInput);
    expect(recorded.cases.every(item => item.baseline.results[0].evidence !== undefined)).toBe(true);
    const replay = run('--synthetic', output, '--report-json');
    expect(replay.status, replay.stderr).toBe(0);
    const report = JSON.parse(replay.stdout);
    expect(report.summary).toMatchObject({ total: 399, evidenceBaselineComparisons: 24, evidenceBaselineDifferences: 0 });
    const overwritten = run('--synthetic', output, '--record-synthetic', output);
    expect(overwritten.status).toBe(1);
    expect(overwritten.stderr).toMatch(/exist/i);
  } finally { rmSync(output, { force: true }); rmdirSync(directory); }
}, 30_000);

test('CLI rejects held-out leakage across separately valid input files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tone-evidence-leak-'));
  try {
    const development = dataset();
    const heldOut = structuredClone(development);
    heldOut.version = 'test-held-out'; heldOut.cases[0].split = 'held_out';
    const paths = [join(directory, 'development.json'), join(directory, 'held-out.json')];
    writeFileSync(paths[0], JSON.stringify(development)); writeFileSync(paths[1], JSON.stringify(heldOut));
    const output = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/corpus/compare.ts', '--synthetic', paths[0], '--synthetic', paths[1]], {
      cwd: resolve('.'), encoding: 'utf8', maxBuffer: 5_000_000,
    });
    expect(output.status).toBe(1);
    expect(output.stderr).toContain('split leakage');
  } finally {
    rmSync(join(directory, 'development.json'), { force: true });
    rmSync(join(directory, 'held-out.json'), { force: true });
    rmdirSync(directory);
  }
});

test('a legacy baseline without evidence stays unknown for passage comparison', async () => {
  const parsed = parseSyntheticDataset(dataset(), hashInput);
  const recorded = recordRealWorldBaseline(parsed, await evaluateRealWorld(parsed));
  delete recorded.cases[0].baseline.results[0].evidence;
  const observations = await evaluateRealWorld(parseSyntheticDataset(recorded, hashInput));
  expect(observations[0].evidence.baseline).toBeNull();
  expect(observations[0].evidence.changed).toBeNull();
  expect(summarizeObservations(observations).evidenceBaselineComparisons).toBe(0);
});
