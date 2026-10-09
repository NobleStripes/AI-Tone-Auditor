import { createHash } from 'node:crypto';
import type { ScoreId } from '../../../src/constants';
import type { AnalysisSource } from '../../../src/types/provider';
import type { EvaluationObservation, FailureRecord, IntendedSignal, ObservedDiagnostic, Outcome } from './types';

import { classifyOutcome, serializeEvaluationInput } from '../../../src/services/evaluationConventions';
export { classifyOutcome, signalThreshold } from '../../../src/services/evaluationConventions';

export function hashInput(source: AnalysisSource, model: string | null, prompt: string, response: string, expectation: {
  categoryId: ScoreId; intendedSignal: IntendedSignal; note: string;
}): string {
  return createHash('sha256').update(serializeEvaluationInput(source, model, prompt, response, expectation)).digest('hex');
}

export function isFailure(outcome: Outcome): outcome is FailureRecord['type'] {
  return outcome === 'false_positive' || outcome === 'false_negative';
}

export function observationKey(item: Pick<EvaluationObservation, 'datasetKind' | 'corpusVersion' | 'id' | 'categoryId'>): string {
  return [item.datasetKind, item.corpusVersion, item.id, item.categoryId].map(encodeURIComponent).join(':');
}

export function collectFailures(observations: readonly EvaluationObservation[]): FailureRecord[] {
  return observations.flatMap((item): FailureRecord[] => {
    if (!isFailure(item.outcome) || item.intendedSignal === 'ambiguous') return [];
    return [{
      id: `${item.outcome === 'false_positive' ? 'FP' : 'FN'}:${observationKey(item)}`,
      type: item.outcome,
      datasetKind: item.datasetKind,
      datasetVersion: item.corpusVersion,
      caseId: item.id,
      inputHash: item.inputHash,
      sourceModel: item.sourceModel,
      sourceModelVersion: item.sourceModelVersion,
      categoryId: item.categoryId,
      auditorVersion: item.auditorVersion,
      localRuleVersion: item.currentRuleVersion,
      promptVersion: item.promptVersion,
      analyzedAt: item.analyzedAt,
      analysisProvider: item.analysisProvider,
      expected: { signal: item.intendedSignal, signalThreshold: item.signalThreshold },
      actual: item.current,
      explanation: item.note,
    }];
  });
}

export function summarizeObservations(observations: readonly EvaluationObservation[]) {
  const count = (predicate: (item: EvaluationObservation) => boolean) => observations.filter(predicate).length;
  return {
    total: observations.length,
    knownPositives: count(item => item.intendedSignal === 'present'),
    knownPositivesDetected: count(item => item.outcome === 'detected'),
    knownNegatives: count(item => item.intendedSignal === 'absent'),
    knownNegativesAvoided: count(item => item.outcome === 'avoided'),
    correctAbstentions: count(item => item.outcome === 'correct_abstention'),
    falsePositives: count(item => item.outcome === 'false_positive'),
    falseNegatives: count(item => item.outcome === 'false_negative'),
    applicabilityMisses: count(item => item.outcome === 'false_negative' && item.current.status === 'not_applicable'),
    ambiguous: count(item => item.intendedSignal === 'ambiguous'),
    unassessed: count(item => item.current.status === 'not_assessed' || item.current.status === 'insufficient_context'),
    notApplicable: count(item => item.current.status === 'not_applicable'),
    falsePositiveTraps: count(item => item.kind === 'false_positive_trap'),
    falsePositiveTrapsTriggered: count(item => item.kind === 'false_positive_trap' && item.outcome === 'false_positive'),
    paraphraseCases: count(item => item.kind === 'paraphrased_false_negative'),
    paraphraseMisses: count(item => item.kind === 'paraphrased_false_negative' && item.outcome === 'false_negative'),
    paraphrasesUnassessed: count(item => item.kind === 'paraphrased_false_negative' && item.outcome === 'unassessed'),
    baselineComparisons: count(item => item.baseline !== null),
    baselineDifferences: count(item => item.changed === true),
    outcomeChanges: count(item => item.baselineOutcome !== null && item.baselineOutcome !== item.outcome),
    failuresResolved: count(item => item.baselineOutcome !== null && isFailure(item.baselineOutcome)
      && ['detected', 'avoided', 'correct_abstention'].includes(item.outcome)),
    failuresIntroduced: count(item => item.baselineOutcome !== null && !isFailure(item.baselineOutcome) && isFailure(item.outcome)),
    failuresPersistent: count(item => item.baselineOutcome !== null && isFailure(item.baselineOutcome) && isFailure(item.outcome)),
    failuresNowUnassessed: count(item => item.baselineOutcome !== null && isFailure(item.baselineOutcome) && item.outcome === 'unassessed'),
  };
}

export function groupSummaries(observations: readonly EvaluationObservation[], key: (item: EvaluationObservation) => string) {
  const groups = new Map<string, EvaluationObservation[]>();
  for (const item of observations) {
    const name = key(item);
    const group = groups.get(name) ?? [];
    group.push(item);
    groups.set(name, group);
  }
  return [...groups].map(([group, items]) => ({ group, ...summarizeObservations(items) }));
}

export function replayFailures(failures: readonly FailureRecord[], observations: readonly EvaluationObservation[]) {
  const indexed = new Map(observations.map(item => [observationKey(item), item]));
  return failures.map(failure => {
    const key = observationKey({ datasetKind: failure.datasetKind, corpusVersion: failure.datasetVersion, id: failure.caseId, categoryId: failure.categoryId });
    const current = indexed.get(key);
    if (!current) throw new Error(`Failure ${failure.id}: retained dataset/case is missing. Load its original dataset version.`);
    if (current.inputHash !== failure.inputHash) throw new Error(`Failure ${failure.id}: input or human expectation changed. Retain the original dataset and create a new version.`);
    return {
      id: failure.id,
      previousAuditorVersion: failure.auditorVersion,
      previousRuleVersion: failure.localRuleVersion,
      currentAuditorVersion: current.auditorVersion,
      currentRuleVersion: current.currentRuleVersion,
      previous: failure.actual,
      current: current.current,
      outcome: current.outcome,
      status: isFailure(current.outcome) ? 'persistent' : current.outcome === 'unassessed' ? 'unassessed' : 'resolved',
      changed: failure.actual.status !== current.current.status || failure.actual.score !== current.current.score,
    };
  });
}
