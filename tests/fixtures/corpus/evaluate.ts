import { localHeuristicProvider } from '../../../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../../../src/services/localPromptComparison';
import { LOCAL_RULE_VERSION } from '../../../src/services/localRuleVersion';
import type { FixtureCorpus } from './types';

export async function evaluateCorpus(corpus: FixtureCorpus) {
  return Promise.all(corpus.cases.map(async (fixture) => {
    const baseline = await localHeuristicProvider.analyzeTone({
      text: fixture.response, context: { promptVersion: corpus.rubricVersion, sourceModel: fixture.sourceModel },
    });
    const result = applyLocalPromptComparison(baseline, fixture.response, fixture.originalPrompt, fixture.sourceModel);
    const current = { status: result.assessments[fixture.categoryId].status, score: result.scores[fixture.categoryId] };
    return {
      corpusVersion: corpus.version,
      baselineRuleVersion: corpus.localRuleVersion,
      currentRuleVersion: LOCAL_RULE_VERSION,
      id: fixture.id,
      intendedSignal: fixture.intendedSignal,
      baseline: fixture.expectedLocal,
      current,
      changed: current.status !== fixture.expectedLocal.status || current.score !== fixture.expectedLocal.score,
      note: fixture.note,
    };
  }));
}
