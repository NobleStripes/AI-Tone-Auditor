import { describe, expect, test } from 'vitest';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';

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