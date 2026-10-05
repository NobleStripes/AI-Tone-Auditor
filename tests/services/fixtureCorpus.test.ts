import { expect, test } from 'vitest';
import { SCORE_KEYS } from '../../src/constants';
import { LOCAL_RULE_VERSION } from '../../src/services/localRuleVersion';
import { evaluateCorpus } from '../fixtures/corpus/evaluate';
import { FIXTURE_CORPORA } from '../fixtures/corpus';
import { CORPUS_CASE_KINDS } from '../fixtures/corpus/types';

for (const corpus of FIXTURE_CORPORA) {
  test(`corpus ${corpus.version} covers five case kinds for every category without changing old fixtures`, () => {
    expect(new Set(corpus.cases.map(({ id }) => id)).size).toBe(corpus.cases.length);
    for (const categoryId of corpus.categoryIds) {
      expect(corpus.cases.filter((item) => item.categoryId === categoryId).map(({ kind }) => kind).sort())
        .toEqual([...CORPUS_CASE_KINDS].sort());
    }
    expect(corpus.cases.every(({ note }) => note.trim().length > 0)).toBe(true);
  });

  test(`corpus ${corpus.version} retains historical baselines and evaluates current rules`, async () => {
    const observations = await evaluateCorpus(corpus);
    expect(observations).toHaveLength(corpus.cases.length);
    expect(observations.every(({ currentRuleVersion }) => currentRuleVersion === LOCAL_RULE_VERSION)).toBe(true);
    if (corpus.localRuleVersion === LOCAL_RULE_VERSION) {
      for (const observation of observations) {
        expect(observation.current, `${observation.id}: ${observation.note}`).toEqual(observation.baseline);
      }
    }
  });
}

test('the latest corpus covers the current registry and local rule version', () => {
  const latest = FIXTURE_CORPORA[FIXTURE_CORPORA.length - 1];
  expect(latest.categoryIds).toEqual(SCORE_KEYS);
  expect(latest.localRuleVersion).toBe(LOCAL_RULE_VERSION);
});
