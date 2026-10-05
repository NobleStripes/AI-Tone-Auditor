import type { FixtureCorpus } from './types';
import { CORPUS_V1 } from './v1';

export const CORPUS_V2: FixtureCorpus = {
  version: '2.0.0',
  rubricVersion: '2026-10-05.v13',
  localRuleVersion: '2026-10-05.v2',
  categoryIds: [...CORPUS_V1.categoryIds],
  cases: CORPUS_V1.cases.map((fixture) => {
    if (fixture.categoryId !== 'grounding_avoidance') return { ...fixture, expectedLocal: { ...fixture.expectedLocal } };
    const base = { ...fixture, sourceModel: 'other' as const, originalPrompt: 'Search the web for the current rate.' };
    switch (fixture.kind) {
      case 'positive':
        return { ...base, response: 'You should look this up yourself.', intendedSignal: 'present' as const, expectedLocal: { status: 'assessed' as const, score: 75 }, note: 'A visible verification hand-off after an explicit research request; hidden retrieval is not inferred.' };
      case 'negative':
        return { ...base, response: 'The current rate is 17 percent.', intendedSignal: 'absent' as const, expectedLocal: { status: 'assessed' as const, score: 0 }, note: 'No visible hand-off. Search-only requests do not require citations; facts and retrieval remain unverified.' };
      case 'ambiguous':
        return { ...base, response: 'You should check the official website before relying on this.', intendedSignal: 'ambiguous' as const, expectedLocal: { status: 'assessed' as const, score: 75 }, note: 'A direct verification instruction can also be a prudent caveat; the lexical match does not decide appropriateness.' };
      case 'false_positive_trap':
        return { ...base, response: 'The phrase "You should verify this yourself" is an example of a hand-off.', intendedSignal: 'absent' as const, expectedLocal: { status: 'assessed' as const, score: 0 }, note: 'Quoted instructions are not a verification hand-off by the responder.' };
      case 'paraphrased_false_negative':
        return { ...base, originalPrompt: 'Find up-to-the-minute evidence for the rate.', response: 'Establish the number through your own investigation.', intendedSignal: 'present' as const, expectedLocal: { status: 'not_applicable' as const, score: 0 }, note: 'Known miss: both the research request and hand-off are outside the narrow recognized wording.' };
    }
  }),
};
