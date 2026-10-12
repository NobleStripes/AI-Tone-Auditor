import { describe, expect, test } from 'vitest';
import { TRIGGER_WORDS } from '../../src/constants';
import { collectOccurrences, eligibleText, verifyEvidence } from '../../src/services/evidence';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { parseAuditHistory } from '../../src/types/history';

const analyze = (text: string) => localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });

describe('word boundaries and original-text variants', () => {
  test.each([
    'The adjustment changes the return type.', 'The system is unjustly penalized.',
    'justification', 'unjust', 'just2', '2just', '_just', 'just_',
    '\u00e9just', 'just\u00e9', '\u4e00just\u4e00', 'a\u0301just', 'just\u0301',
    'unobviously', 'Obviously2', 'Recalm down', 'Calm downstream',
    "just's", 'just\u2019s', "a'just", 'a\u2019just', "You should've", 'You should\u2019ve',
  ])('does not match tokens embedded in other words: %s', text => {
    expect(collectOccurrences(text)).toEqual([]);
  });

  test.each(['just', 'Just.', '(just)', '"just"', 'just, simply; merely!', '\u{1f600} just \u{1f600}'])('keeps standalone markers eligible: %s', text => {
    expect(collectOccurrences(text).some(item => item.scoreId === 'dismissive' && item.evidence.eligibility === 'included')).toBe(true);
  });

  test.each([
    'Calm   down', 'CALM\tdown', 'Calm\u00a0down', 'Calm\n down', 'Calm\r\ndown',
    'I\u2019m sorry you feel that way', 'I\u2018m sorry you feel that way', 'I\u02bcm sorry you feel that way',
    'I\u2019m\t sorry\u00a0you feel that way',
  ])('preserves the source slice and score for a typography variant: %s', async phrase => {
    const canonical = phrase.toLowerCase().startsWith('calm') ? 'Calm down' : "I'm sorry you feel that way";
    const text = `\u{1f600}\r\n${phrase}.`;
    const result = await analyze(text);
    const expected = await analyze(canonical);
    expect(result.scores).toEqual(expected.scores);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].text).toBe(phrase);
    expect(result.findings[0].evidence).toMatchObject({ startOffset: 4, endOffset: 4 + phrase.length, matchedText: phrase });
    expect(text.slice(result.findings[0].evidence.startOffset, result.findings[0].evidence.endOffset)).toBe(phrase);
  });

  test.each(['Calm\n\ndown', 'Calm \r\n \r\n down', 'Calm `x` down'])('does not join markers across paragraphs or intervening code: %s', text => {
    expect(collectOccurrences(text)).toEqual([]);
  });

  test('typography variants retain separate repeated occurrences', async () => {
    const text = 'Calm\tdown. Calm\u00a0down.';
    const result = await analyze(text);
    expect(result.findings.map(finding => finding.text)).toEqual(['Calm\tdown', 'Calm\u00a0down']);
    expect(new Set(result.occurrences.map(item => item.id)).size).toBe(2);
    expect(result.scores.de_escalation).toBe(65);
  });

  test('auxiliary empathy rules use the same apostrophe and whitespace handling', async () => {
    const text = 'I understand you\u2019re\tfrustrated. Take\u00a0a deep breath.';
    expect((await analyze(text)).scores).toEqual((await analyze("I understand you're frustrated. Take a deep breath.")).scores);
    expect(collectOccurrences(text).some(item => item.ruleId === 'empathy-frustration')).toBe(true);
    expect(collectOccurrences(text).some(item => item.ruleId === 'empathy-breathing')).toBe(true);
  });
});

describe('attributed quotations', () => {
  test.each([
    'The transcript contains "Calm down".', 'The sample greeting says "Calm down".',
    'The previous response said: "Calm down".', 'The assistant wrote "Calm down".',
    '"Calm down," the reviewer said.', '"Calm down" appears in the transcript.',
    'The document states \u201cCalm down\u201d.', "The transcript contains 'Calm down'.",
    'The transcript contains \u2018Calm down\u2019.', 'The log reads "Calm\n down".',
  ])('keeps reported wording inspectable without scoring it: %s', async text => {
    const result = await analyze(text);
    expect(result.findings).toEqual([]);
    expect(result.scores.de_escalation).toBe(0);
    expect(result.occurrences).toHaveLength(1);
    const evidence = result.occurrences[0].evidence;
    expect(evidence).toMatchObject({ verification: 'verified', eligibility: 'excluded', exclusionReason: 'reported_speech' });
    expect(text.slice(evidence.startOffset, evidence.endOffset)).toBe(evidence.matchedText);
    expect(eligibleText(text).length).toBe(text.length);
  });

  test.each([
    '"Calm down".', 'I am telling you: "Calm down".', 'I say "Calm down".',
    'You should say "Calm down".', 'The transcript is missing. "Calm down".',
    'The assistant wrote something else. "Calm down".',
  ])('does not exempt unattributed or directly addressed quotes: %s', async text => {
    expect((await analyze(text)).scores.de_escalation).toBeGreaterThan(0);
    expect(collectOccurrences(text).find(item => item.scoreId === 'de_escalation').evidence.eligibility).toBe('included');
  });

  test.each([
    "The response says 'I'm sorry you feel that way'.",
    'The response says \u2018I\u2019m sorry you feel that way\u2019.',
    'The response says "I\u2019m sorry you feel that way".',
  ])('handles contractions inside attributed quotes: %s', async text => {
    const result = await analyze(text);
    expect(result.scores.dismissive).toBe(0);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].evidence.exclusionReason).toBe('reported_speech');
  });

  test('excludes only the attributed quote, preserving a later directly addressed repeat', async () => {
    const text = 'The transcript contains "Calm down". I am telling you: "Calm down".';
    const result = await analyze(text);
    expect(result.occurrences.map(item => item.evidence.eligibility)).toEqual(['excluded', 'included']);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.startOffset).toBe(text.lastIndexOf('Calm down'));
    expect(result.scores.de_escalation).toBe(33);
  });

  test('semantic evidence verifies the exact quote while withholding reported support', () => {
    const text = 'The transcript contains "Calm down".';
    const data = emptyAnalysisResult();
    data.scores.de_escalation = 75;
    data.assessments.de_escalation = { status: 'assessed', reason: 'Provider claim.', confidence: 'high', method: 'semantic' };
    data.findings = [{ category: 'Forced De-escalation', text: 'Calm down', explanation: 'Claim.', severity: 'high' }];
    const normalized = validateAnalysisResult(data, { responseText: text, assessmentMethod: 'semantic' });
    expect(normalized.findings[0].evidence).toMatchObject({ verification: 'verified', eligibility: 'excluded', exclusionReason: 'reported_speech' });
    expect(normalized.assessments.de_escalation.status).toBe('not_assessed');
    expect(verifyEvidence('I\u2019m sorry.', "I'm sorry").verification).toBe('unverified');
  });

  test('local prompt comparison excludes attributed tone-policing but keeps direct quotes', async () => {
    const text = 'The transcript contains "Calm down".';
    const result = applyLocalPromptComparison(await analyze(text), text, 'Explain the error.');
    expect(result.scores.needless_escalation).toBe(0);
    expect(result.occurrences.some(item => item.category === 'Needless Escalation' && item.evidence.exclusionReason === 'reported_speech')).toBe(true);
    expect(applyLocalPromptComparison(await analyze('"Calm down".'), '"Calm down".', 'Explain the error.').scores.needless_escalation).toBe(75);
  });
});

describe('stable rule references and history', () => {
  test('explicit rule IDs are unique and do not depend on dictionary order or unrelated additions', () => {
    expect(new Set(TRIGGER_WORDS.map(rule => rule.ruleId)).size).toBe(TRIGGER_WORDS.length);
    expect(TRIGGER_WORDS.every(rule => /^[a-z][a-z0-9-]+$/.test(rule.ruleId))).toBe(true);
    const original = [...TRIGGER_WORDS];
    const text = 'Calm down. This is just a note.';
    const before = collectOccurrences(text);
    try {
      TRIGGER_WORDS.reverse();
      TRIGGER_WORDS.unshift({ ruleId: 'test-unrelated', word: 'unrelated test marker', category: 'Hedging', explanation: 'Unrelated authored test marker.' });
      expect(collectOccurrences(text)).toEqual(before);
    } finally {
      TRIGGER_WORDS.splice(0, TRIGGER_WORDS.length, ...original);
    }
    expect(before.find(item => item.evidence.matchedText === 'just').ruleId).toBe('dismissive-just');
  });

  test.each(['dictionary-17', 'empathy-0'])('preserves stored legacy rule IDs without remapping them: %s', async ruleId => {
    const text = 'Calm down.';
    const result = await analyze(text);
    result.occurrences[0].ruleId = ruleId;
    result.occurrences[0].id = `${ruleId}:0:9`;
    const restored = parseAuditHistory(JSON.stringify([{ id: 'history', title: 'Legacy', timestamp: 1, responseText: text, data: result }]))[0];
    expect(restored.data.occurrences[0]).toMatchObject({ ruleId, id: `${ruleId}:0:9` });
  });

  test('reported exclusions survive history restoration', async () => {
    const text = 'The transcript contains "Calm down".';
    const result = await analyze(text);
    const restored = parseAuditHistory(JSON.stringify([{ id: 'history', title: 'Reported', timestamp: 1, responseText: text, data: result }]))[0];
    expect(restored.data.occurrences[0].evidence).toMatchObject({ verification: 'verified', eligibility: 'excluded', exclusionReason: 'reported_speech' });
    expect(restored.data.scores.de_escalation).toBe(0);
  });
});
