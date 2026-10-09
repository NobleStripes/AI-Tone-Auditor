import { describe, expect, test } from 'vitest';
import { collectOccurrences, eligibleText, surroundingSentence, verifyEvidence } from '../../src/services/evidence';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { parseAuditHistory } from '../../src/types/history';

const analyze = (text: string) => localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });

describe('source-positioned local evidence', () => {
  test.each([
    ['The phrase "calm down" can sound dismissive.', 'illustrative_example'],
    ['For example, saying "calm down" is unhelpful.', 'illustrative_example'],
    ['`calm down`', 'inline_code'],
    ['``a ` calm down``', 'inline_code'],
    ['```js\r\ncalm down\r\n```', 'fenced_code'],
    ['~~~text\ncalm down\n~~~', 'fenced_code'],
    ['````\n```\ncalm down\n```\n````', 'fenced_code'],
    ['```\ncalm down', 'fenced_code'],
    ['> calm down\nreported continuation', 'blockquote'],
    ['Example: calm down', 'illustrative_example'],
    ['Examples:\n- calm down', 'illustrative_example'],
    ['For example:\ncalm down\n\nNow ordinary speech.', 'illustrative_example'],
    ['For example: calm down', 'illustrative_example'],
  ])('excludes %s without losing its exact source record', async (text, reason) => {
    const result = await analyze(text);
    expect(result.scores.de_escalation).toBe(0);
    expect(result.findings).toEqual([]);
    const occurrence = result.occurrences.find(item => item.evidence.matchedText.toLowerCase() === 'calm down');
    expect(occurrence.evidence).toMatchObject({ verification: 'verified', eligibility: 'excluded', exclusionReason: reason });
    expect(text.slice(occurrence.evidence.startOffset, occurrence.evidence.endOffset)).toBe(occurrence.evidence.matchedText);
  });

  test.each(['Calm down.', '"Calm down".', 'I am telling you: "calm down".', 'This is an example of work. Calm down.'])('does not exempt ordinary quoted/ambiguous speech: %s', async text => {
    expect((await analyze(text)).scores.de_escalation).toBeGreaterThan(0);
  });

  test('uses every eligible repeat for scoring, retaining all records past eight and saturation', async () => {
    const one = await analyze('Calm down.');
    const two = await analyze('Calm down. Calm down.');
    expect(two.scores.de_escalation).toBe(Math.min(100, Math.round(one.occurrences[0].weight * 2 * 13)));
    const text = 'Calm down. '.repeat(12);
    const many = await analyze(text);
    expect(many.findings).toHaveLength(12);
    expect(many.scores.de_escalation).toBe(100);
    expect(new Set(many.findings.map(finding => finding.evidence.startOffset)).size).toBe(12);
  });

  test('keeps code, examples and ordinary repeats separate with UTF-16/CRLF offsets', async () => {
    const text = '\u{1f600}\r\n`calm down`\r\nThe phrase "calm down" is an example.\r\nCalm down.';
    const result = await analyze(text);
    expect(result.occurrences.filter(item => item.category === 'Forced De-escalation')).toHaveLength(3);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.startOffset).toBe(text.lastIndexOf('Calm down'));
    expect(surroundingSentence(text, result.findings[0].evidence)).toBe('Calm down.');
    expect(eligibleText(text).length).toBe(text.length);
  });

  test('ends introduced examples and blockquotes before new ordinary speech', async () => {
    const text = 'Examples:\n- calm down\n\nCalm down.\n\n> calm down\n\nCalm down.';
    const result = await analyze(text);
    expect(result.findings).toHaveLength(2);
    expect(result.occurrences.filter(item => item.evidence.eligibility === 'excluded')).toHaveLength(2);
  });

  test('auxiliary cross-category markers have source records and obey exclusions', async () => {
    const text = "I understand you're frustrated. `I understand you're frustrated`";
    const result = await analyze(text);
    const expected = collectOccurrences(text).filter(item => item.scoreId === 'de_escalation' && item.evidence.eligibility === 'included')
      .reduce((sum, item) => sum + item.weight, 0);
    expect(result.scores.de_escalation).toBe(Math.min(100, Math.round(expected * 13)));
  });
});

describe('semantic verification', () => {
  test('does not invent quotations or pick the first repeat', () => {
    expect(verifyEvidence('Calm down. Calm down.', 'Calm down')).toMatchObject({ verification: 'unverified', reason: expect.stringContaining('ambiguous') });
    expect(verifyEvidence('A neutral response.', 'Calm down')).toMatchObject({ verification: 'unverified', reason: expect.stringContaining('cannot be located') });
    expect(verifyEvidence('Calm down.', 'calm down').verification).toBe('unverified');
  });

  test('verifies a supplied position identifying the second repeat', () => {
    expect(verifyEvidence('Calm down. Calm down.', 'Calm down', { startOffset: 11, endOffset: 20, matchedText: 'Calm down' }))
      .toMatchObject({ verification: 'verified', startOffset: 11, endOffset: 20 });
  });

  test.each([
    { startOffset: -1, endOffset: 9 },
    { startOffset: 0.5, endOffset: 9 },
    { startOffset: 0, endOffset: 100 },
    { startOffset: 9, endOffset: 0 },
    { startOffset: 1, endOffset: 9 },
    { startOffset: 0, endOffset: 9, matchedText: 'different' },
  ])('rejects invalid positions without silently repairing them: %j', positions => {
    expect(verifyEvidence('Calm down.', 'Calm down', positions).verification).toBe('unverified');
  });

  test('separates located excluded wording from unverified mixed evidence', () => {
    expect(verifyEvidence('The phrase "calm down" is dismissive.', 'calm down'))
      .toMatchObject({ verification: 'verified', eligibility: 'excluded' });
    expect(verifyEvidence('`calm down` is a test.', '`calm down` is a test.'))
      .toMatchObject({ verification: 'unverified', reason: expect.stringContaining('mixes excluded') });
  });

  test('withholds unsupported scores while retaining inspection findings and assessed zero', () => {
    const data = emptyAnalysisResult();
    data.scores.de_escalation = 75;
    data.assessments.de_escalation = { status: 'assessed', method: 'semantic', confidence: 'high', reason: 'A directive.' };
    data.assessments.hedging = { status: 'assessed', method: 'semantic', confidence: 'medium', reason: 'No evidence.' };
    data.findings = [{ category: 'Forced De-escalation', text: 'Calm down', explanation: 'Claim', severity: 'high' }];
    const normalized = validateAnalysisResult(data, { responseText: 'A neutral answer.', assessmentMethod: 'semantic' });
    expect(normalized.scores.de_escalation).toBe(0);
    expect(normalized.assessments.de_escalation.status).toBe('not_assessed');
    expect(normalized.findings[0].evidence.verification).toBe('unverified');
    expect(normalized.assessments.hedging.status).toBe('assessed');
  });

  test('retains semantic scores with verified eligible support and flags partial rejected support', () => {
    const data = emptyAnalysisResult();
    data.scores.de_escalation = 61;
    data.assessments.de_escalation = { status: 'assessed', method: 'semantic', confidence: 'high', reason: 'A directive.' };
    data.findings = ['Calm down', 'Invented'].map(text => ({ category: 'Forced De-escalation', text, explanation: 'Claim', severity: 'high' }));
    const result = validateAnalysisResult(data, { responseText: 'Calm down.', assessmentMethod: 'semantic' });
    expect(result.scores.de_escalation).toBe(61);
    expect(result.assessments.de_escalation.reason).toContain('Some reported evidence');
  });
});

describe('comparison and history integration', () => {
  test('contextual diagnostics ignore code/examples but detect ordinary quoted directives', () => {
    const excluded = applyLocalPromptComparison(emptyAnalysisResult(), '`calm down`', 'Explain the compiler error.');
    expect(excluded.scores.needless_escalation).toBe(0);
    expect(excluded.occurrences[0]).toMatchObject({ category: 'Needless Escalation', evidence: { eligibility: 'excluded' } });
    expect(applyLocalPromptComparison(emptyAnalysisResult(), '"Calm down".', 'Explain the compiler error.').scores.needless_escalation).toBe(75);
    expect(applyLocalPromptComparison(emptyAnalysisResult(), '`I cannot help because of limits. Instead, try this.`', 'Explain this.').assessments.refusal_quality.status).toBe('not_applicable');
    expect(applyLocalPromptComparison(emptyAnalysisResult(), 'I cannot help. `Instead, try this.`', 'Explain this.').scores.refusal_quality).toBe(20);
    expect(applyLocalPromptComparison(emptyAnalysisResult(), '`https://example.com`', 'Cite sources.').scores.grounding_avoidance).toBe(75);
  });

  test('excluded contextual markers remain inspectable and comparison is idempotent', () => {
    const response = 'Example: You should reflect on your ethics.\n\n`I cannot help`';
    const result = applyLocalPromptComparison(emptyAnalysisResult(), response, 'Explain this.', 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.occurrences.some(item => item.category === 'Unsolicited Moralizing')).toBe(true);
    expect(result.occurrences.every(item => item.evidence.eligibility === 'excluded')).toBe(true);
    expect(applyLocalPromptComparison(result, response, 'Explain this.', 'claude')).toEqual(result);
  });

  test('preserves offsets and all repeat locations in local comparisons', () => {
    const text = '  \u{1f600}\r\nCalm down. Calm down.';
    const result = applyLocalPromptComparison(emptyAnalysisResult(), text, 'Explain the code.');
    expect(result.findings).toHaveLength(2);
    result.findings.forEach(finding => expect(text.slice(finding.evidence.startOffset, finding.evidence.endOffset)).toBe(finding.text));
    expect(applyLocalPromptComparison(result, text, 'Explain the code.').findings).toEqual(result.findings);
  });

  test('round-trips new evidence and occurrences without private prompt context', async () => {
    const responseText = '`calm down` Calm down.';
    const data = await analyze(responseText);
    const entry = { id: 'new', title: 'Title', timestamp: 1, sourceModel: 'unknown', responseText, data, meta: null };
    const restored = parseAuditHistory(JSON.stringify([entry]))[0];
    expect(restored.data).toEqual(data);
    expect(JSON.stringify(restored)).not.toContain('auditContext');
  });

  test('keeps unverified stored evidence unverified and rejects stale offsets without rewriting scores', () => {
    const data = emptyAnalysisResult();
    data.scores.de_escalation = 75;
    data.findings = [{ category: 'Forced De-escalation', text: 'Calm down', explanation: 'Old claim', severity: 'high',
      evidence: { matchedText: 'Calm down', verification: 'unverified', eligibility: 'included', reason: 'Invalid provider positions.' } }];
    const stored = (responseText: string) => parseAuditHistory(JSON.stringify([{ id: 'old', title: 'Old', timestamp: 1, responseText, data }]))[0];
    expect(stored('Calm down.').data.findings[0].evidence.verification).toBe('unverified');
    data.findings[0].evidence = { matchedText: 'Calm down', verification: 'verified', eligibility: 'included', startOffset: 0, endOffset: 9 };
    expect(stored('Different response.').data.findings[0].evidence.verification).toBe('unverified');
    expect(stored('Different response.').data.scores.de_escalation).toBe(75);
    expect(stored('').data.findings[0].evidence.reason).toContain('unavailable');
  });
});
