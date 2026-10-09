import { AUDITOR_VERSION } from '../../../src/services/auditProvenance';
import { LOCAL_RULE_VERSION } from '../../../src/services/localRuleVersion';
import { ANALYSIS_PROMPT_VERSION } from '../../../src/services/promptBuilder';
import { localHeuristicProvider } from '../../../src/services/providers/localHeuristicProvider';
import { evaluateLocalResponse } from '../corpus/evaluate';
import { classifyOutcome, hashInput, signalThreshold } from './metrics';
import type { EvaluationObservation, EvaluationDataset } from './types';

export async function evaluateRealWorld(dataset: EvaluationDataset): Promise<EvaluationObservation[]> {
  const datasetKind = 'datasetKind' in dataset ? dataset.datasetKind : 'real_world';
  const observations: EvaluationObservation[] = [];
  for (const fixture of dataset.cases) {
    const result = await evaluateLocalResponse(fixture.response, fixture.originalPrompt, fixture.sourceModel);
    const analyzedAt = new Date().toISOString();
    for (const expectation of fixture.expectations) {
      const current = { status: result.assessments[expectation.categoryId].status, score: result.scores[expectation.categoryId] };
      const recorded = fixture.baseline?.results.find(item => item.categoryId === expectation.categoryId);
      const baseline = recorded ? { status: recorded.status, score: recorded.score } : null;
      const threshold = signalThreshold(expectation.categoryId);
      observations.push({
        datasetKind,
        corpusVersion: dataset.version,
        id: fixture.id,
        categoryId: expectation.categoryId,
        sourceModel: fixture.sourceModel,
        sourceModelVersion: fixture.model,
        kind: datasetKind === 'synthetic' ? 'synthetic_import' : 'real_world',
        inputHash: hashInput(fixture.sourceModel, fixture.model, fixture.originalPrompt, fixture.response, expectation),
        intendedSignal: expectation.intendedSignal,
        signalThreshold: threshold,
        baseline,
        baselineRuleVersion: fixture.baseline?.localRuleVersion ?? null,
        baselineAuditorVersion: fixture.baseline?.auditorVersion ?? null,
        current,
        currentRuleVersion: LOCAL_RULE_VERSION,
        auditorVersion: AUDITOR_VERSION,
        promptVersion: ANALYSIS_PROMPT_VERSION,
        analyzedAt,
        analysisProvider: { providerId: 'local', model: localHeuristicProvider.model },
        outcome: classifyOutcome(expectation.intendedSignal, current, threshold),
        baselineOutcome: baseline ? classifyOutcome(expectation.intendedSignal, baseline, threshold) : null,
        changed: baseline ? baseline.status !== current.status || baseline.score !== current.score : null,
        note: expectation.note,
      });
    }
  }
  return observations;
}

export function recordRealWorldBaseline<T extends EvaluationDataset>(dataset: T, observations: readonly EvaluationObservation[]): T {
  const datasetKind = 'datasetKind' in dataset ? dataset.datasetKind : 'real_world';
  return {
    ...dataset,
    cases: dataset.cases.map(fixture => {
      const matches = observations.filter(item => item.datasetKind === datasetKind && item.corpusVersion === dataset.version && item.id === fixture.id);
      const first = matches[0];
      if (!first || matches.length !== fixture.expectations.length
        || fixture.expectations.some(expectation => !matches.some(item => item.categoryId === expectation.categoryId
          && item.inputHash === hashInput(fixture.sourceModel, fixture.model, fixture.originalPrompt, fixture.response, expectation)))) {
        throw new Error(`Case ${fixture.id}: missing or mismatched observations; cannot record baseline.`);
      }
      return {
        ...fixture,
        baseline: {
          auditorVersion: first.auditorVersion,
          promptVersion: first.promptVersion,
          localRuleVersion: first.currentRuleVersion,
          analyzedAt: first.analyzedAt,
          analysisProvider: first.analysisProvider,
          results: matches.map(item => ({ categoryId: item.categoryId, inputHash: item.inputHash, ...item.current })),
        },
      };
    }),
  };
}
