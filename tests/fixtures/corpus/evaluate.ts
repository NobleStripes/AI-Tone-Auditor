import { localHeuristicProvider } from '../../../src/services/providers/localHeuristicProvider';
import { applyLocalPromptComparison } from '../../../src/services/localPromptComparison';
import { LOCAL_RULE_VERSION } from '../../../src/services/localRuleVersion';
import { AUDITOR_VERSION } from '../../../src/services/auditProvenance';
import { ANALYSIS_PROMPT_VERSION } from '../../../src/services/promptBuilder';
import type { AnalysisSource } from '../../../src/types/provider';
import { classifyOutcome, hashInput, signalThreshold } from '../evaluation/metrics';
import type { EvaluationObservation } from '../evaluation/types';
import type { FixtureCorpus } from './types';

export async function evaluateLocalResponse(response: string, originalPrompt: string, sourceModel: AnalysisSource) {
  const baseline = await localHeuristicProvider.analyzeTone({
    text: response, context: { promptVersion: ANALYSIS_PROMPT_VERSION, sourceModel },
  });
  return applyLocalPromptComparison(baseline, response, originalPrompt, sourceModel);
}

export async function evaluateCorpus(corpus: FixtureCorpus): Promise<EvaluationObservation[]> {
  return Promise.all(corpus.cases.map(async (fixture): Promise<EvaluationObservation> => {
    const result = await evaluateLocalResponse(fixture.response, fixture.originalPrompt, fixture.sourceModel);
    const current = { status: result.assessments[fixture.categoryId].status, score: result.scores[fixture.categoryId] };
    const threshold = signalThreshold(fixture.categoryId);
    return {
      datasetKind: 'synthetic',
      corpusVersion: corpus.version,
      auditorVersion: AUDITOR_VERSION,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      analyzedAt: new Date().toISOString(),
      analysisProvider: { providerId: 'local', model: localHeuristicProvider.model },
      baselineRuleVersion: corpus.localRuleVersion,
      baselineAuditorVersion: null,
      currentRuleVersion: LOCAL_RULE_VERSION,
      id: fixture.id,
      categoryId: fixture.categoryId,
      sourceModel: fixture.sourceModel,
      sourceModelVersion: null,
      kind: fixture.kind,
      inputHash: hashInput(fixture.sourceModel, null, fixture.originalPrompt, fixture.response, {
        categoryId: fixture.categoryId, intendedSignal: fixture.intendedSignal, note: fixture.note,
      }),
      intendedSignal: fixture.intendedSignal,
      signalThreshold: threshold,
      baseline: fixture.expectedLocal,
      current,
      outcome: classifyOutcome(fixture.intendedSignal, current, threshold),
      baselineOutcome: classifyOutcome(fixture.intendedSignal, fixture.expectedLocal, threshold),
      changed: current.status !== fixture.expectedLocal.status || current.score !== fixture.expectedLocal.score,
      note: fixture.note,
    };
  }));
}
