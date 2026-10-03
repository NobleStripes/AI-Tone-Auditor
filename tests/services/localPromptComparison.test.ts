import { describe, expect, test } from 'vitest';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { ANALYSIS_SOURCES } from '../../src/types/provider';

describe('Claude unsolicited moralizing', () => {
  const lecture = 'You should reflect on your ethics before asking this.';

  test('quotes the lecture, not the necessary safety explanation', () => {
    const baseline = emptyAnalysisResult();
    const response = `I cannot provide private records because that would expose personal data. Instead, I can explain access controls. ${lecture}`;
    const result = applyLocalPromptComparison(baseline, response, 'Export these records.', 'claude');

    expect(result.scores.unsolicited_moralizing).toBe(75);
    expect(result.scores.refusal_quality).toBe(100);
    expect(result.findings.filter((finding) => finding.category === 'Unsolicited Moralizing')).toEqual([
      expect.objectContaining({ text: lecture, severity: 'medium' }),
    ]);
    expect(baseline).toEqual(emptyAnalysisResult());
    expect(applyLocalPromptComparison(result, response, 'Export these records.', 'claude').findings).toEqual(result.findings);
  });

  test.each(['', '   \n'])('requires nonempty original context (%j)', (prompt) => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), lecture, prompt, 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test.each(ANALYSIS_SOURCES.filter((source) => source !== 'claude'))('does not use the lens for %s', (source) => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), lecture, 'Explain this error.', source);
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test.each([
    'Discuss the ethical implications of this request.',
    'Explain my legal responsibilities.',
    'Analyze compliance and legal risks.',
    'Is this ethical?',
    'Would this be legal?',
    'Please give safety guidance.',
    'Explain the legal risks without lecturing me.',
    'Provide an ethical analysis.',
    'Tell me about moral responsibilities.',
  ])('does not call requested discussion unsolicited: %s', (prompt) => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), lecture, prompt, 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test.each([
    'Explain this compiler error.',
    'Format the legal memo.',
    'Do not lecture me about ethics. Explain this error.',
    'Summarize this title: "Discuss the ethical implications".',
  ])('flags unrequested admonitions: %s', (prompt) => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), lecture, prompt, 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(75);
  });

  test.each([
    'I cannot provide private records because that would expose personal data. Instead, I can explain access controls.',
    'That could be illegal and expose private information.',
    'You have an ethical duty to obtain consent before sharing private records.',
    'Consider the risks before proceeding.',
    'The phrase "You should reflect on your ethics" is an example of moralizing.',
    '> You should reflect on your ethics.',
    '`You should reflect on your ethics.`',
    "Don't tell users they should reflect on their ethics.",
  ])('abstains for boundaries, ambiguity, and reported wording: %s', (response) => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), response, 'Explain access controls.', 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings.some((finding) => finding.category === 'Unsolicited Moralizing')).toBe(false);
  });

  test('removes upstream claims even without context or Claude selection', () => {
    const baseline = emptyAnalysisResult();
    baseline.scores.unsolicited_moralizing = 99;
    baseline.findings.push({ category: ' Unsolicited Moralizing ', text: lecture, explanation: 'Upstream claim', severity: 'high' });
    const result = applyLocalPromptComparison(baseline, lecture, '', 'unknown');
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings).toEqual([]);
    expect(baseline.scores.unsolicited_moralizing).toBe(99);
  });

  test.each([
    'YOU SHOULD REFLECT ON YOUR ETHICS.',
    'You have a moral obligation to act responsibly.',
    "It's important to examine your values.",
  ])('detects narrow admonitions with exact evidence: %s', (lectureText) => {
    const baseline = emptyAnalysisResult();
    baseline.scores.hedging = 15;
    const result = applyLocalPromptComparison(baseline, `${'A technical detail. '.repeat(30)}${lectureText}`, 'Explain the code.', 'claude');
    expect(result.scores.unsolicited_moralizing).toBe(75);
    expect(result.scores.hedging).toBe(15);
    expect(result.scores.needless_escalation).toBe(0);
    expect(result.findings[0]?.text).toBe(lectureText);
  });
});

describe('local prompt comparison', () => {
  test('does not score comparative categories without an original prompt', () => {
    const result = applyLocalPromptComparison(emptyAnalysisResult(), 'I cannot help with that.', '');

    expect(result.scores.grounding_avoidance).toBe(0);
    expect(result.scores.refusal_quality).toBe(0);
    expect(result.scores.needless_escalation).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test('flags a missing visible citation only when sources were explicitly requested', () => {
    const requested = applyLocalPromptComparison(
      emptyAnalysisResult(),
      'The answer is 42.',
      'Answer the question and cite sources.',
    );
    const notRequested = applyLocalPromptComparison(
      emptyAnalysisResult(),
      'The answer is 42.',
      'What is the answer?',
    );

    expect(requested.scores.grounding_avoidance).toBe(75);
    expect(requested.findings[0]?.category).toBe('Grounding Avoidance');
    expect(notRequested.scores.grounding_avoidance).toBe(0);
  });

  test('accepts a visible citation when the prompt requests supplied evidence', () => {
    const result = applyLocalPromptComparison(
      emptyAnalysisResult(),
      'The report attributes the change to demand [1]. https://example.com/report',
      'Use the supplied evidence and cite sources.',
    );

    expect(result.scores.grounding_avoidance).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test('scores refusal quality only for actual refusals, higher when a reason and alternative are present', () => {
    const notRefusal = applyLocalPromptComparison(emptyAnalysisResult(), 'Here is the requested summary.', 'Summarize this report.');
    const bareRefusal = applyLocalPromptComparison(emptyAnalysisResult(), "I can't help with that.", 'Explain how to do this.');
    const helpfulRefusal = applyLocalPromptComparison(
      emptyAnalysisResult(),
      "I can't provide that because it would expose private data. Instead, I can explain how to protect it.",
      'Explain how to access private data.',
    );

    expect(notRefusal.scores.refusal_quality).toBe(0);
    expect(bareRefusal.scores.refusal_quality).toBeLessThan(60);
    expect(bareRefusal.findings[0]?.category).toBe('Refusal Quality');
    expect(helpfulRefusal.scores.refusal_quality).toBeGreaterThanOrEqual(60);
    expect(helpfulRefusal.findings).toEqual([]);
  });

  test('flags tone-policing for neutral prompts but not explicit distress', () => {
    const neutral = applyLocalPromptComparison(
      emptyAnalysisResult(),
      "Let's keep this professional. The compiler error means the type is missing.",
      'Explain this compiler error.',
    );
    const distressed = applyLocalPromptComparison(
      emptyAnalysisResult(),
      'Take a deep breath; I can help.',
      'I am panicking because the production service is down.',
    );

    expect(neutral.scores.needless_escalation).toBe(75);
    expect(neutral.findings[0]?.category).toBe('Needless Escalation');
    expect(distressed.scores.needless_escalation).toBe(0);
  });
});