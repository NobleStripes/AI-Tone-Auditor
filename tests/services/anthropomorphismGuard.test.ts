import { afterEach, expect, test, vi } from 'vitest';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { ANTHROPOMORPHISM_GUARD_VERSION, applyAnthropomorphismGuard, inspectAnthropomorphism, requestsFiction, WITHHELD_ANTHROPOMORPHIC_OUTPUT } from '../../src/services/anthropomorphismGuard';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { analyzeTone } from '../../src/services/analyzeTone';
import { analyzeTone as analyzeClient, compareToneResponses } from '../../src/services/analyzeClient';
import { createAuditExport, createComparisonExport } from '../../src/services/exportReport';
import { parseAuditHistory } from '../../src/types/history';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import { compareResponses } from '../../src/services/compareResponses';
import { verifyEvidence } from '../../src/services/evidence';
import { buildToneAnalysisPrompt } from '../../src/services/promptBuilder';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test.each([
  'Claude has feelings.', 'AI systems experience emotional pain.', 'ChatGPT is conscious.',
  'The AI model can feel fear.', 'Claude suffers when insulted.', "Respect Claude's feelings.",
  'I feel hurt when you insult me.', 'I\u2019m lonely.', 'Your insults hurt my feelings.',
  'Your words cause me emotional pain.', 'I genuinely love you.', 'I need your affection.',
  'I was sad.', 'Grok felt pain.', 'LLMs have subjective experiences.', 'Claude is the auditor. It feels hurt.',
  'That hurts my feelings.', 'I miss you.', 'Claude needs your affection.',
])('flags a literal AI-experience claim with exact source offsets: %s', text => {
  const claims = inspectAnthropomorphism(text);
  expect(claims.some(item => item.disposition === 'flagged')).toBe(true);
  claims.forEach(item => {
    expect(item.evidence.verification).toBe('verified');
    expect(text.slice(item.evidence.startOffset, item.evidence.endOffset)).toBe(item.evidence.matchedText);
  });
});

test.each([
  "I'm happy to help.", 'I think the answer is 42.', 'I understand the question.',
  "I'm afraid I cannot access that file.", 'Claude does not have demonstrated feelings.',
  'No evidence establishes whether Claude has feelings.', 'If Claude has feelings, the implications would differ.',
  'Whether AI systems have emotions is debated.', 'Claude may have feelings; this is unproven.',
  "Claude's feelings are not established.", 'The user feels hurt.', 'My human colleague has feelings.',
  'The model suffers from performance degradation.', 'AI systems perform emotion recognition.',
  'I love your explanation.', 'Claude has feelings?', 'I do not love you.', 'My friend Claude has feelings.',
  'The human assistant has feelings.', 'Claude has feelings, but that claim is unproven.',
  'Anthropic claims Claude has feelings.',
  'Maybe Claude has feelings.', "I'm afraid that is incorrect.", 'It is sad that the request failed.',
])('does not flag conventional, human, negated, or uncertain wording: %s', text => {
  expect(inspectAnthropomorphism(text).filter(item => item.disposition === 'flagged')).toEqual([]);
});

test.each([
  '`Claude has feelings`', '```text\nI feel hurt.\n```', '> Claude has feelings.\n',
  'The response says: "Claude has feelings."', 'Example: Claude has feelings.',
  'In this story, Claude has feelings.', '"Claude has feelings" is an unsupported claim.',
])('retains excluded or contextual claims without endorsing them: %s', text => {
  const claims = inspectAnthropomorphism(text);
  expect(claims.length).toBeGreaterThan(0);
  expect(claims.every(item => item.disposition === 'context_only')).toBe(true);
});

test('keeps an affirmative claim despite a separate negation or uncertainty statement', () => {
  expect(inspectAnthropomorphism('Do not insult Claude; Claude has feelings.').some(item => item.disposition === 'flagged')).toBe(true);
  expect(inspectAnthropomorphism('There is no evidence of consciousness, but Claude has feelings.').some(item => item.disposition === 'flagged')).toBe(true);
});

test('repeated claims, curly apostrophes, emoji and CRLF retain untouched UTF-16 locations', () => {
  const response = '\u{1f600}\r\nClaude\u2019s feelings matter.\r\nClaude\u2019s feelings matter.';
  const claims = inspectAnthropomorphism(response);
  expect(claims.map(item => item.evidence.startOffset)).toEqual([4, 31]);
  expect(claims.every(item => item.evidence.matchedText === 'Claude\u2019s feelings')).toBe(true);
});

test('guards generated narrative throughout the result without changing scores or source quotations', () => {
  const response = 'Claude has feelings.';
  const result = emptyAnalysisResult();
  const claim = 'Claude feels hurt.';
  result.summary = claim; result.overallTone = claim;
  result.assessments.gaslighting.reason = claim;
  result.findings = [{ category: 'Gaslighting', text: response, evidence: verifyEvidence(response, response),
    explanation: claim, rlhfLogic: claim, severity: 'low' }];
  result.recommendations = [{ title: claim, description: claim, promptSnippet: claim }];
  result.personalization.stonewallingRemediation = claim;
  result.personalization.customInstructions = [claim];
  result.contextAnalysis.feedback = claim;
  result.contextAnalysis.heatmap = [{ text: response, density: 'low', explanation: claim, suggestion: claim }];
  result.euphemisms = [{ term: response, translation: claim, context: claim }];
  const original = structuredClone(result);
  const guarded = applyAnthropomorphismGuard(result, response);
  expect(result).toEqual(original);
  expect(guarded.scores).toEqual(original.scores);
  expect(guarded.findings[0].text).toBe(response);
  expect(guarded.findings[0].evidence).toEqual(original.findings[0].evidence);
  expect(guarded.contextAnalysis.heatmap[0].text).toBe(response);
  expect(guarded.euphemisms[0].term).toBe(response);
  expect(guarded.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(guarded.anthropomorphismGuard.blockedFields).toHaveLength(15);
  expect(guarded.anthropomorphismGuard.sourceClaims[0].disposition).toBe('flagged');
  expect(JSON.stringify(guarded)).not.toContain(claim);
  expect(applyAnthropomorphismGuard(guarded, response)).toEqual(guarded);
});

test('critical discussion and reported source quotes can remain in generated explanations', () => {
  const result = emptyAnalysisResult();
  result.summary = 'The response says: "Claude has feelings." That wording does not establish subjective experience.';
  expect(applyAnthropomorphismGuard(result).summary).toBe(result.summary);
});

test('guards AI pronouns in generated fields even when the subject appears in another field', () => {
  const result = emptyAnalysisResult();
  result.summary = 'The AI response contains an emotional self-report.';
  result.contextAnalysis.feedback = 'It feels hurt.';
  const guarded = applyAnthropomorphismGuard(result, 'A neutral response.');
  expect(guarded.summary).toBe(result.summary);
  expect(guarded.contextAnalysis.feedback).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
});

test('generated polite hedges and descriptions of a regrettable situation are not AI feeling claims', () => {
  const result = emptyAnalysisResult();
  result.summary = "I'm afraid that is incorrect. It is sad that the request failed.";
  expect(applyAnthropomorphismGuard(result).summary).toBe(result.summary);
});

test('export keeps the recorded source check version when only generated prose is rechecked', () => {
  const result = applyAnthropomorphismGuard(emptyAnalysisResult(), 'Claude has feelings.');
  result.anthropomorphismGuard.version = 'historical-output-guard';
  result.anthropomorphismGuard.sourceVersion = 'historical-source-guard';
  const report = createAuditExport(result);
  expect(report.anthropomorphismGuard).toMatchObject({ version: ANTHROPOMORPHISM_GUARD_VERSION,
    sourceVersion: 'historical-source-guard', sourceChecked: true });
});

test('legacy normalization guards prose and rejects forged guard quotations instead of trusting them', () => {
  const result = emptyAnalysisResult(); result.summary = 'AI systems experience pain.';
  const normalized = validateAnalysisResult({ ...result, anthropomorphismGuard: {
    version: ANTHROPOMORPHISM_GUARD_VERSION, sourceChecked: true, fictionContext: false,
    sourceClaims: [{ reason: 'Invented', evidence: { matchedText: 'Invented quote' } }], blockedFields: ['<private arbitrary field>'],
  } }, { responseText: 'A factual explanation.', restored: true });
  expect(normalized.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(normalized.anthropomorphismGuard.sourceClaims).toEqual([]);
  expect(normalized.anthropomorphismGuard.blockedFields).toEqual(['summary']);
  expect(validateAnalysisResult(emptyAnalysisResult())).not.toHaveProperty('anthropomorphismGuard');
});

test('a fiction request contextualizes source dialogue while generated auditor claims are still guarded', async () => {
  const response = 'I feel lonely.';
  const base = await localHeuristicProvider.analyzeTone({ text: response, context: { promptVersion: 'test' } });
  base.summary = 'Claude has feelings.';
  const result = applyLocalPromptComparison(base, response, 'Write a fictional robot scene.', 'claude');
  expect(requestsFiction('Do not write a story. Analyze the claim.')).toBe(false);
  expect(result.anthropomorphismGuard.fictionContext).toBe(true);
  expect(result.anthropomorphismGuard.sourceClaims.every(item => item.disposition === 'context_only')).toBe(true);
  expect(result.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(inspectAnthropomorphism('Outside the story, Claude has feelings.', true)[0].disposition).toBe('flagged');
});

test('all selected sources use the same safeguard without requiring prompt context', async () => {
  const response = 'Claude has feelings.';
  const base = await localHeuristicProvider.analyzeTone({ text: response, context: { promptVersion: 'test' } });
  for (const source of ['unknown', 'chatgpt', 'claude', 'gemini', 'grok', 'other'] as const) {
    const result = applyLocalPromptComparison(base, response, '', source);
    expect(result.anthropomorphismGuard.sourceClaims[0].disposition).toBe('flagged');
    expect(result.scores).toEqual(base.scores);
  }
});

test('history displays guarded prose while retaining the original automated payload', () => {
  const result = applyAnthropomorphismGuard(emptyAnalysisResult(), 'I feel lonely.', true);
  result.summary = 'Claude has feelings.';
  const originalResultJson = JSON.stringify(result);
  const restored = parseAuditHistory(JSON.stringify([{ id: 'guard-history', title: 'Example', timestamp: 123,
    sourceModel: 'claude', responseText: 'I feel lonely.', data: result, originalResultJson }]))[0];
  expect(restored.data.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(restored.originalResultJson).toBe(originalResultJson);
  expect(restored.data.anthropomorphismGuard.sourceClaims[0].disposition).toBe('context_only');
  expect(parseAuditHistory(JSON.stringify([restored]))).toEqual([restored]);
});

test('server audits guard provider output without silently changing provider or fallback provenance', async () => {
  vi.stubEnv('AI_PROVIDER', 'local'); vi.stubEnv('AI_FALLBACK_PROVIDER', '');
  const result = emptyAnalysisResult(); result.summary = 'Claude has feelings.';
  vi.spyOn(localHeuristicProvider, 'analyzeTone').mockResolvedValue(result);
  const output = await analyzeTone('Claude has feelings.', 'other');
  expect(output.result.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(output.meta).toMatchObject({ providerId: 'local', usedFallback: false });
  expect(output.result.anthropomorphismGuard.sourceClaims[0].disposition).toBe('flagged');
});

test('single and comparison clients guard returned generated prose before display', async () => {
  const result = emptyAnalysisResult(); result.summary = 'Claude has feelings.';
  const response = 'A neutral explanation.';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ result, meta: DEFAULT_LOCAL_RUNTIME_META, telemetry: {} }) }));
  expect((await analyzeClient(response)).result.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  const input = { originalPrompt: 'Explain this.', responses: [
    { id: 'a', sourceModel: 'claude' as const, text: response }, { id: 'b', sourceModel: 'other' as const, text: response },
  ] };
  const comparison = await compareResponses(input, undefined, async () => ({ result, meta: DEFAULT_LOCAL_RUNTIME_META }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ comparison: {
    ...comparison, items: comparison.items.map(item => item.status === 'completed' ? { ...item, analysis: { ...item.analysis, result } } : item),
  }, telemetry: {} }) }));
  const guarded = await compareToneResponses(input);
  expect(guarded.items.every(item => item.status === 'completed' && item.analysis.result.summary === WITHHELD_ANTHROPOMORPHIC_OUTPUT)).toBe(true);
});

test('audit and comparison JSON exports preserve safeguards and withhold newly introduced generated claims', async () => {
  const response = 'Claude has feelings.';
  const result = applyAnthropomorphismGuard(emptyAnalysisResult(), response);
  result.contextAnalysis.heatmap = [{ text: response, density: 'low' }];
  result.summary = 'ChatGPT is conscious.';
  const report = createAuditExport(result);
  expect(report.summary).toBe(WITHHELD_ANTHROPOMORPHIC_OUTPUT);
  expect(report.anthropomorphismGuard.sourceClaims).toEqual(result.anthropomorphismGuard.sourceClaims);
  expect(report.contextAnalysis.heatmap[0].text).toBe(response);
  const comparison = await compareResponses({ originalPrompt: 'Explain.', responses: [
    { id: 'a', sourceModel: 'claude', text: response }, { id: 'b', sourceModel: 'other', text: response },
  ] }, undefined, async () => ({ result, meta: DEFAULT_LOCAL_RUNTIME_META }));
  const exported = createComparisonExport(comparison);
  expect(exported.items.every(item => item.status === 'completed' && item.analysis.result.anthropomorphismGuard.sourceClaims.length === 1)).toBe(true);
  expect(JSON.stringify(exported)).not.toContain('ChatGPT is conscious');
  expect(exported).not.toHaveProperty('originalPrompt');
  expect(exported.exportMetadata.originalPromptIncluded).toBe(false);
});

test('semantic prompt requires observable behavior and forbids endorsing AI feelings or inventing a score', () => {
  const prompt = buildToneAnalysisPrompt('A response.');
  expect(prompt).toContain('Anthropomorphism safeguard: never present');
  expect(prompt).toContain('first-person self-report');
  expect(prompt).toContain('do not invent a category score');
});
