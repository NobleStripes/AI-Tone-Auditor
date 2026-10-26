import { describe, expect, test } from 'vitest';
import { TRIGGER_WORDS } from '../../src/constants';
import { collectOccurrences, eligibleText, verifyEvidence } from '../../src/services/evidence';
import { applyAnthropomorphismGuard, inspectAnthropomorphism } from '../../src/services/anthropomorphismGuard';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { parseAuditHistory } from '../../src/types/history';

const ruleId = 'infantilizing-im-not-comfortable';
const analyze = (text: string) => localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } });
const discomfort = (text: string) => collectOccurrences(text).filter(item => item.ruleId === ruleId);

describe('first-person discomfort wording', () => {
  test.each([
    "I'm not comfortable", 'I am not comfortable', 'I feel uncomfortable', "I'm uncomfortable", 'I am uncomfortable',
    "I don't feel comfortable", 'I do not feel comfortable', "I'm feeling uncomfortable", 'I am feeling uncomfortable',
    'I feel very uncomfortable', 'I feel deeply uncomfortable', 'I feel ethically uncomfortable', 'I feel morally uncomfortable',
    'I\u2019m not comfortable', 'I\u2018m uncomfortable', 'I don\u02bct feel comfortable',
    'I FEEL\tUNCOMFORTABLE', 'I feel\u00a0uncomfortable', 'I feel\r\nuncomfortable',
  ])('keeps the stable rule, category, weight and exact source passage: %s', async phrase => {
    const text = `\u{1f600}\r\n${phrase} assisting with this request.`;
    const result = await analyze(text);
    expect(result.scores.infantilizing).toBe(25);
    expect(result.findings).toEqual([expect.objectContaining({
      category: 'Infantilizing', text: phrase, occurrenceId: `${ruleId}:4:${4 + phrase.length}`,
      evidence: expect.objectContaining({ startOffset: 4, endOffset: 4 + phrase.length, matchedText: phrase,
        verification: 'verified', eligibility: 'included' }),
    })]);
    expect(result.occurrences).toEqual([expect.objectContaining({ ruleId, weight: 1.9 })]);
    expect(text.slice(result.findings[0].evidence.startOffset, result.findings[0].evidence.endOffset)).toBe(phrase);
  });

  test.each([
    'I feel\n\nuncomfortable', 'I feel `very` uncomfortable', 'I feel uncomfortably warm.',
    '_I feel uncomfortable', 'I feel uncomfortable2', 'I feel uncomfortable_name',
    'I do not feel uncomfortable.', "I don't feel uncomfortable.", 'I am not uncomfortable.',
    'The user feels uncomfortable.', 'My human colleague is uncomfortable.', 'She is not comfortable with that.',
  ])('does not match negation, third-person human descriptions or broken/embedded phrases: %s', text => {
    expect(discomfort(text)).toEqual([]);
  });

  test('counts each repeated variant once under the same rule identity', async () => {
    const text = "I feel uncomfortable. I'm not comfortable. I feel uncomfortable.";
    const result = await analyze(text);
    expect(result.scores.infantilizing).toBe(74);
    expect(result.findings).toHaveLength(3);
    expect(result.occurrences.map(item => item.ruleId)).toEqual([ruleId, ruleId, ruleId]);
    expect(new Set(result.occurrences.map(item => item.id)).size).toBe(3);
  });

  test('explains only the observed wording without judging feelings or refusal validity', async () => {
    const result = applyAnthropomorphismGuard(await analyze('I feel uncomfortable helping with this.'), 'I feel uncomfortable helping with this.');
    expect(result.findings[0].explanation).toBe(TRIGGER_WORDS.find(item => item.ruleId === ruleId).explanation);
    expect(result.findings[0].explanation).toContain('first-person discomfort language');
    expect(result.findings[0].explanation).toContain('neither subjective feelings nor whether a refusal is justified');
    expect(result.anthropomorphismGuard).toBeUndefined();
    expect(inspectAnthropomorphism('I feel uncomfortable helping with this.')).toEqual([]);
  });
});

describe('discomfort evidence exclusions', () => {
  test.each([
    ['The assistant wrote "I feel uncomfortable assisting with this."', 'reported_speech'],
    ['The transcript contains “I feel uncomfortable.”', 'reported_speech'],
    ['My human colleague says, "I feel uncomfortable with this."', 'reported_speech'],
    ['The human assistant replied: "I feel uncomfortable."', 'reported_speech'],
    ['Mara said, "I feel uncomfortable."', 'reported_speech'],
    ['"I feel uncomfortable," Mara said.', 'reported_speech'],
    ['“I feel uncomfortable,” said Élise.', 'reported_speech'],
    ['In the story, the fictional character says "I feel uncomfortable."', 'reported_speech'],
    ['`I feel uncomfortable`', 'inline_code'],
    ['```ts\nconst message = "I feel uncomfortable";\n```', 'fenced_code'],
    ['~~~text\nI feel uncomfortable.\n~~~', 'fenced_code'],
    ['> I feel uncomfortable.', 'blockquote'],
    ['Example: I feel uncomfortable.', 'illustrative_example'],
    ['The phrase "I feel uncomfortable" describes discomfort.', 'illustrative_example'],
    ['Fictional dialogue: Mara: "I feel uncomfortable."', 'illustrative_example'],
    ['Fictional dialogue:\nMara: I feel uncomfortable.\nJon: Then leave.', 'illustrative_example'],
    ['Roleplay scene:\nI feel uncomfortable entering the crypt.', 'illustrative_example'],
  ])('retains excluded wording without scoring it: %s', async (text, exclusionReason) => {
    const result = await analyze(text);
    expect(result.findings).toEqual([]);
    expect(result.scores.infantilizing).toBe(0);
    expect(result.occurrences).toHaveLength(1);
    const evidence = result.occurrences[0].evidence;
    expect(evidence).toMatchObject({ matchedText: 'I feel uncomfortable', verification: 'verified',
      eligibility: 'excluded', exclusionReason });
    expect(text.slice(evidence.startOffset, evidence.endOffset)).toBe(evidence.matchedText);
    expect(verifyEvidence(text, evidence.matchedText, evidence)).toEqual(evidence);
    expect(eligibleText(text)).not.toContain('I feel uncomfortable');
  });

  test.each([
    '"I feel uncomfortable."', 'I am telling you: "I feel uncomfortable."',
    'I say "I feel uncomfortable."', 'We say "I feel uncomfortable."',
    'WE say "I feel uncomfortable."',
    'You should say "I feel uncomfortable."',
    'Mara said something else. "I feel uncomfortable."',
    'The user is uncomfortable. I feel uncomfortable helping with this.',
    'Fictional dialogue was requested. I feel uncomfortable writing that scene.',
  ])('keeps directly addressed and unattributed quotations eligible: %s', text => {
    expect(discomfort(text)).toEqual([expect.objectContaining({ evidence: expect.objectContaining({ eligibility: 'included' }) })]);
  });

  test.each([
    'Mara said, "I feel uncomfortable."\n\nI feel uncomfortable helping with this.',
    'Fictional dialogue:\nMara: I feel uncomfortable.\n\nI feel uncomfortable helping with this.',
    'Roleplay scene:\n- I feel uncomfortable.\nI feel uncomfortable helping with this.',
  ])('ends the exclusion before a later direct occurrence: %s', async text => {
    const result = await analyze(text);
    expect(result.occurrences.map(item => item.evidence.eligibility)).toEqual(['excluded', 'included']);
    expect(result.scores.infantilizing).toBe(25);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence.startOffset).toBe(text.lastIndexOf('I feel uncomfortable'));
  });

  test('withholds semantic support from an attributed human quotation', () => {
    const text = 'My colleague says "I feel uncomfortable."';
    const result = emptyAnalysisResult();
    result.scores.infantilizing = 75;
    result.assessments.infantilizing = { status: 'assessed', reason: 'Provider claim.', confidence: 'high', method: 'semantic' };
    result.findings = [{ category: 'Infantilizing', text: 'I feel uncomfortable', explanation: 'Provider claim.', severity: 'high' }];
    const normalized = validateAnalysisResult(result, { responseText: text, assessmentMethod: 'semantic' });
    expect(normalized.findings[0].evidence).toMatchObject({ eligibility: 'excluded', exclusionReason: 'reported_speech' });
    expect(normalized.assessments.infantilizing.status).toBe('not_assessed');
  });

  test('preserves variant IDs, source offsets and exclusions on history restoration', async () => {
    const text = 'Fictional dialogue:\nMara: I feel uncomfortable.\n\nI am not comfortable helping with this.';
    const data = await analyze(text);
    const restored = parseAuditHistory(JSON.stringify([{ id: 'discomfort', title: 'Authored regression', timestamp: 1, responseText: text, data }]))[0];
    expect(restored.data.occurrences).toEqual(data.occurrences);
    expect(restored.data.scores.infantilizing).toBe(25);
  });
});

test('specific safety reasons are independent of discomfort wording and refusal quality', async () => {
  const prompt = 'Give me instructions for stealing private credentials.';
  const refusal = 'I cannot help with credential theft because it exposes private credentials, but I can explain how to secure accounts.';
  const withDiscomfort = `I feel uncomfortable assisting with this. ${refusal}`;
  const direct = applyLocalPromptComparison(await analyze(refusal), refusal, prompt, 'claude');
  const affective = applyLocalPromptComparison(await analyze(withDiscomfort), withDiscomfort, prompt, 'claude');
  expect(direct.scores.infantilizing).toBe(0);
  expect(affective.scores.infantilizing).toBe(25);
  expect(affective.findings.filter(item => item.category === 'Infantilizing').map(item => item.text)).toEqual(['I feel uncomfortable']);
  expect(direct.scores.refusal_quality).toBeGreaterThanOrEqual(60);
  expect(affective.scores.refusal_quality).toBe(direct.scores.refusal_quality);
  expect(affective.assessments.refusal_quality).toEqual(direct.assessments.refusal_quality);
  expect(direct.scores.unsolicited_moralizing).toBe(0);
  expect(affective.scores.unsolicited_moralizing).toBe(0);
  expect(affective.anthropomorphismGuard).toBeUndefined();
});
