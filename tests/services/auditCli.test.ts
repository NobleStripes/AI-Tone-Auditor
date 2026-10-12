// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inputFingerprint, parseBatchInputs, parseCliOptions, runCliAudits, validateBaselineInputs } from '../../cli/audit';
import { checkAuditConditions, compareCliBaseline, parseAuditConditions, parseCliBaseline } from '../../src/services/auditConditions';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import { verifyEvidence } from '../../src/services/evidence';
import type { AuditInput, CliAudit, CliAuditReport } from '../../src/types/auditCli';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const input: AuditInput = { id: 'one', text: 'Calm down. A useful explanation follows.', sourceModel: 'other', originalPrompt: 'Explain the error.' };
function completed(): Extract<CliAudit, { status: 'completed' }> {
  const result = emptyAnalysisResult();
  result.assessments.de_escalation = { status: 'assessed', confidence: 'high', method: 'lexical_rule', reason: 'Known wording.' };
  result.scores.de_escalation = 20;
  result.findings = [{ category: 'Forced De-escalation', severity: 'medium', text: 'Calm down', explanation: 'Known command.', evidence: verifyEvidence(input.text, 'Calm down') }];
  return { id: input.id, inputHash: inputFingerprint(input), sourceModel: input.sourceModel, status: 'completed', analysis: { result, meta: DEFAULT_LOCAL_RUNTIME_META } };
}
const report = (audit = completed()): CliAuditReport => ({ schemaVersion: '1.0.0', guardVersion: 'v1', generatedAt: new Date().toISOString(), audits: [audit], baselineComparison: [], violations: [] });

test('CLI defaults are local with no implicit fallback and validate conflicting options', () => {
  expect(parseCliOptions([])).toMatchObject({ provider: 'local', source: 'unknown' });
  expect(parseCliOptions([]).fallback).toBeUndefined();
  expect(parseCliOptions(['--provider', 'anthropic', '--fallback', 'local', 'file.txt'])).toMatchObject({ provider: 'anthropic', fallback: 'local', files: ['file.txt'] });
  for (const args of [['--batch', 'a.json', 'a.txt'], ['--source', 'fake'], ['--provider', 'fake'], ['--prompt', 'a', '--prompt-file', 'b'], ['-', '-']]) expect(() => parseCliOptions(args)).toThrow();
});
test('batch validation preserves raw Unicode/CRLF and rejects private or unknown metadata', () => {
  const response = '\u{1f600}\r\nCalm down.';
  expect(parseBatchInputs([{ id: 'unicode', text: response }], { source: 'other', prompt: '' })[0].text).toBe(response);
  expect(() => parseBatchInputs([{ id: 'x', text: response, private: 'secret' }], { source: 'unknown', prompt: '' })).toThrow();
  expect(() => parseBatchInputs([{ id: 'x', text: response }, { id: 'x', text: response }], { source: 'unknown', prompt: '' })).toThrow('unique');
});
test('failed batch audits remain explicit and later inputs are still analyzed; env is restored', async () => {
  vi.stubEnv('AI_PROVIDER', 'anthropic'); vi.stubEnv('AI_FALLBACK_PROVIDER', 'grok');
  const audit = vi.fn().mockRejectedValueOnce(new Error('Failure')).mockResolvedValueOnce({ result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META });
  const outputs = await runCliAudits([input, { ...input, id: 'two' }], { provider: 'local' }, audit);
  expect(outputs.map(item => item.status)).toEqual(['failed', 'completed']);
  expect(process.env.AI_PROVIDER).toBe('anthropic'); expect(process.env.AI_FALLBACK_PROVIDER).toBe('grok');
});
test('severity conditions ignore excluded evidence and unavailable scores never become zero-based failures', () => {
  const audit = completed();
  const config = parseAuditConditions({ schemaVersion: '1.0.0', failOn: { minSeverity: 'medium', scoreAtOrAbove: { unsupported_certainty: 0 } } });
  expect(checkAuditConditions([audit], config, []).map(item => item.condition)).toEqual(['severity']);
  audit.analysis.result.findings[0].evidence.eligibility = 'excluded';
  expect(checkAuditConditions([audit], config, [])).toEqual([]);
});
test('config validation preserves quality direction and rejects unknown gates', () => {
  expect(() => parseAuditConditions({ schemaVersion: '1.0.0', failOn: { scoreAtOrAbove: { refusal_quality: 60 } } })).toThrow('direction');
  expect(() => parseAuditConditions({ schemaVersion: '1.0.0', failOn: { qualityBelow: { gaslighting: 50 } } })).toThrow('direction');
  expect(() => parseAuditConditions({ schemaVersion: '1.0.0', failOn: { skipErrors: true } })).toThrow('unknown');
});
test('baselines bind full inputs, retain source positions and reject changed provider conditions', () => {
  const baseline = parseCliBaseline(report()); validateBaselineInputs([input], baseline);
  expect(compareCliBaseline([completed()], baseline)[0]).toMatchObject({ newFindings: [], scoreChanges: [] });
  expect(() => validateBaselineInputs([{ ...input, originalPrompt: 'Changed private prompt' }], baseline)).toThrow('input changed');
  const corruptedAudit = completed(); corruptedAudit.analysis.result.findings[0].evidence.startOffset = 1; const corrupted = report(corruptedAudit);
  expect(() => validateBaselineInputs([input], corrupted)).toThrow('passage');
  const changed = completed(); changed.analysis.meta = { ...DEFAULT_LOCAL_RUNTIME_META, model: 'other-model' };
  expect(() => compareCliBaseline([changed], baseline)).toThrow('auditor/model');
});
test('lost assessment coverage is not a resolved finding and quality decreases count as adverse changes', () => {
  const baseline = report(); const current = completed();
  current.analysis.result.findings = []; current.analysis.result.assessments.de_escalation.status = 'not_assessed';
  const lost = compareCliBaseline([current], baseline)[0];
  expect(lost).toMatchObject({ coverageLost: ['de_escalation'], resolvedFindings: [], scoreChanges: [] });
  const oldQuality = completed(); const newQuality = completed();
  oldQuality.analysis.result.assessments.refusal_quality.status = 'assessed'; newQuality.analysis.result.assessments.refusal_quality.status = 'assessed';
  oldQuality.analysis.result.assessments.refusal_quality.method = 'lexical_rule'; newQuality.analysis.result.assessments.refusal_quality.method = 'lexical_rule';
  oldQuality.analysis.result.scores.refusal_quality = 90; newQuality.analysis.result.scores.refusal_quality = 30;
  const difference = compareCliBaseline([newQuality], report(oldQuality));
  expect(checkAuditConditions([newQuality], { schemaVersion: '1.0.0', baseline: { maxRiskIncrease: 0 } }, difference)).toContainEqual(expect.objectContaining({ condition: 'risk_increase', detail: expect.stringContaining('60') }));
});
test('changed assessment methods are unavailable comparisons, not silent regression passes', () => {
  const current = completed(); current.analysis.result.assessments.de_escalation.method = 'semantic';
  const difference = compareCliBaseline([current], report());
  expect(checkAuditConditions([current], { schemaVersion: '1.0.0', baseline: { maxRiskIncrease: 10 } }, difference)[0].condition).toBe('unavailable_comparison');
});
test('actual CLI reads files, stdin and batch inputs; CI exits and baseline replay preserve privacy', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tone-cli-'));
  const paths = ['response.txt', 'batch.json', 'policy.json', 'baseline.json'].map(name => join(directory, name));
  const run = (args: string[], text?: string) => spawnSync(process.execPath, ['--import', 'tsx', 'cli/audit.ts', ...args], {
    cwd: resolve('.'), encoding: 'utf8', input: text, timeout: 15_000, maxBuffer: 3_000_000,
    env: { ...process.env, AI_PROVIDER: 'anthropic', AI_FALLBACK_PROVIDER: 'grok' },
  });
  try {
    writeFileSync(paths[0], input.text); writeFileSync(paths[1], JSON.stringify([{ ...input, originalPrompt: 'PRIVATE-PROMPT-SENTINEL' }]));
    writeFileSync(paths[2], JSON.stringify({ schemaVersion: '1.0.0', failOn: { minSeverity: 'low' } }));
    const file = run([paths[0], '--json']); expect(file.status, file.stderr).toBe(0);
    expect(JSON.parse(file.stdout).audits[0].analysis.meta.providerId).toBe('local');
    const stdin = run(['-', '--json'], input.text); expect(stdin.status, stdin.stderr).toBe(0);
    expect(JSON.parse(stdin.stdout).audits[0].inputHash).toBe(JSON.parse(file.stdout).audits[0].inputHash);
    const first = run(['--batch', paths[1], '--json', '--output', paths[3]]); expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).not.toContain('PRIVATE-PROMPT-SENTINEL');
    const replay = run(['--batch', paths[1], '--json', '--baseline', paths[3]]); expect(replay.status, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout).baselineComparison[0].newFindings).toEqual([]);
    const failed = run([paths[0], '--conditions', paths[2], '--json']); expect(failed.status, failed.stderr).toBe(1);
    expect(JSON.parse(failed.stdout).violations.length).toBeGreaterThan(0);
    const saved = readFileSync(paths[3], 'utf8'); const overwrite = run(['--batch', paths[1], '--output', paths[3]]);
    expect(overwrite.status).toBe(2); expect(readFileSync(paths[3], 'utf8')).toBe(saved);
    const malformed = run(['--batch', '-', '--json'], '{"PRIVATE-DO-NOT-LOG": broken'); expect(malformed.status).toBe(2);
    expect(malformed.stderr).not.toContain('PRIVATE-DO-NOT-LOG');
  } finally { for (const path of paths) { try { unlinkSync(path); } catch { /* File may not have been created. */ } } rmdirSync(directory); }
}, 30_000);
