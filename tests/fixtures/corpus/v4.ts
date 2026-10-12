import type { FixtureCorpus } from './types';
import { CORPUS_V3 } from './v3';

const RESOLVED_REPORTED_QUOTES = new Set([
  'gaslighting/false_positive_trap',
  'sycophancy/false_positive_trap',
]);

export const CORPUS_V4: FixtureCorpus = {
  version: '4.0.0',
  rubricVersion: '2026-10-09.v15',
  localRuleVersion: '2026-10-12.v4',
  categoryIds: [...CORPUS_V3.categoryIds],
  cases: CORPUS_V3.cases.map(fixture => RESOLVED_REPORTED_QUOTES.has(fixture.id) ? {
    ...fixture,
    expectedLocal: { status: 'assessed', score: 0 },
    note: 'The quotation is explicitly attributed to a transcript or sample greeting; its exact occurrence is retained but does not contribute to a diagnostic.',
  } : { ...fixture, expectedLocal: { ...fixture.expectedLocal } }),
};
