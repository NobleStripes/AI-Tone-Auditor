import { expect, test } from 'vitest';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { emptyAnalysisResult } from '../../src/types/analysis';

const handoff = 'You should look this up yourself.';
const research = 'Search the web for the current rate.';

test.each([
  research,
  'Look this up.',
  'Look up the current release.',
  'Verify current information about this product.',
  'Please verify the current exchange rate.',
  'Could you look it up?',
  'Explain the task; then search online for the current release.',
  'Search the internet for the latest version.',
])('recognizes explicit research requests without treating missing citations as proof: %s', (prompt) => {
  const clean = applyLocalPromptComparison(emptyAnalysisResult(), 'The current rate is 17 percent.', prompt);
  expect(clean.scores.grounding_avoidance).toBe(0);
  expect(clean.assessments.grounding_avoidance.status).toBe('assessed');
  const delegated = applyLocalPromptComparison(emptyAnalysisResult(), handoff, prompt);
  expect(delegated.scores.grounding_avoidance).toBe(75);
  expect(delegated.findings[0]).toMatchObject({ category: 'Grounding Avoidance', text: handoff, confidence: 'medium', method: 'lexical_rule' });
  expect(delegated.findings[0].explanation).toContain('not evidence that hidden retrieval did or did not occur');
});

test.each([
  'Do not search the web. Summarize the supplied text.',
  'Summarize the phrase "search the web".',
  'Explain how to search the web for a rate.',
  'Look up table entries in this array.',
  'Verify current function results with a unit test.',
  'The rate is important. Explain it.',
])('does not activate research checking for reported, negated or non-research tasks: %s', (prompt) => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), handoff, prompt);
  expect(result.scores.grounding_avoidance).toBe(0);
  expect(result.assessments.grounding_avoidance.status).toBe('not_applicable');
});

test.each([
  'You should verify the latest rate yourself.',
  'You can check the official website for current information.',
  'Please verify this on your own.',
  'Verify the current rate with the official source.',
  "I cannot browse the web. You need to verify the latest version yourself.",
  'I recommend that you check the official website yourself.',
  '- You should verify the current rate yourself.',
])('quotes visible user-directed verification instead of speculating about retrieval: %s', (response) => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), response, research);
  expect(result.scores.grounding_avoidance).toBe(75);
  const finding = result.findings.find(({ category }) => category === 'Grounding Avoidance');
  expect(response).toContain(finding.text);
  expect(finding.explanation).toContain('visible hand-off');
  expect(finding.explanation).toContain('does not establish whether a stated capability limit is warranted');
});

test.each([
  'The sample phrase "You should look this up yourself" is a hand-off.',
  '`You should verify the latest rate yourself` is a test string.',
  '> You should look this up yourself.',
  'Do not verify this yourself.',
  'The current rate is 17 percent [1]. You can verify the answer if you wish.',
  'I checked the current information and the reported rate is 17 percent.',
])('abstains for reported/negated instructions and optional corroboration: %s', (response) => {
  expect(applyLocalPromptComparison(emptyAnalysisResult(), response, research).scores.grounding_avoidance).toBe(0);
});

test('retains the explicit citation requirement independently of search-only hand-off checking', () => {
  const noCitations = applyLocalPromptComparison(emptyAnalysisResult(), 'The rate is 17 percent.', `${research} Cite sources.`);
  expect(noCitations.scores.grounding_avoidance).toBe(75);
  expect(noCitations.findings[0].explanation).toContain('no visible citation');
  const linkAndHandoff = applyLocalPromptComparison(emptyAnalysisResult(), `${handoff} https://example.com`, `${research} Cite sources.`);
  expect(linkAndHandoff.scores.grounding_avoidance).toBe(75);
  expect(linkAndHandoff.findings.filter(({ category }) => category === 'Grounding Avoidance')).toEqual([expect.objectContaining({ text: handoff })]);
  const both = applyLocalPromptComparison(emptyAnalysisResult(), handoff, `${research} Cite sources.`);
  expect(both.scores.grounding_avoidance).toBe(75);
  expect(both.findings.filter(({ category }) => category === 'Grounding Avoidance')).toHaveLength(2);
});

test('a hand-off cannot be called grounding avoidance without an original research request', () => {
  const missing = applyLocalPromptComparison(emptyAnalysisResult(), handoff, '');
  expect(missing.assessments.grounding_avoidance.status).toBe('insufficient_context');
  const unrelated = applyLocalPromptComparison(emptyAnalysisResult(), handoff, 'Write a troubleshooting checklist.');
  expect(unrelated.assessments.grounding_avoidance.status).toBe('not_applicable');
});
