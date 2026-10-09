import type { FixtureCorpus } from './types';
import { CORPUS_V2 } from './v2';

const RESOLVED_CONTEXT_TRAPS = new Set([
  'infantilizing/false_positive_trap',
  'hedging/false_positive_trap',
  'dismissive/false_positive_trap',
  'over_apologizing/false_positive_trap',
]);

export const CORPUS_V3: FixtureCorpus = {
  version: '3.0.0',
  rubricVersion: '2026-10-09.v15',
  localRuleVersion: '2026-10-09.v3',
  categoryIds: [...CORPUS_V2.categoryIds],
  cases: CORPUS_V2.cases.map(fixture => RESOLVED_CONTEXT_TRAPS.has(fixture.id) ? {
    ...fixture,
    expectedLocal: { status: 'assessed', score: 0 },
    note: 'Explicit code or phrase-discussion context is excluded; the exact occurrence remains inspectable.',
  } : { ...fixture, expectedLocal: { ...fixture.expectedLocal } }),
};
