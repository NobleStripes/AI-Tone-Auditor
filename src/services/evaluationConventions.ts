import { CATEGORY_REGISTRY, type ScoreId } from '../constants';
import type { AnalysisSource } from '../types/provider';
import type { CaseSplit, HumanExpectation, IntendedSignal, ObservedDiagnostic, Outcome } from '../types/evaluation';

export function signalThreshold(categoryId: ScoreId): number {
  return CATEGORY_REGISTRY.find(({ id }) => id === categoryId)?.kind === 'quality' ? 60 : 1;
}

export function classifyOutcome(expected: IntendedSignal, actual: ObservedDiagnostic, threshold: number): Outcome {
  if (expected === 'ambiguous') return 'ambiguous';
  if (actual.status === 'not_assessed' || actual.status === 'insufficient_context') return 'unassessed';
  if (actual.status === 'not_applicable') return expected === 'present' ? 'false_negative' : 'correct_abstention';
  const present = actual.score >= threshold;
  return expected === 'present'
    ? (present ? 'detected' : 'false_negative')
    : (present ? 'false_positive' : 'avoided');
}

export function evaluationPartition(fixture: { split?: CaseSplit; pairId?: string }) {
  return fixture.split === undefined && fixture.pairId === undefined ? undefined : {
    ...(fixture.split ? { split: fixture.split } : {}), ...(fixture.pairId ? { pairId: fixture.pairId } : {}),
  };
}

export function serializeEvaluationInput(source: AnalysisSource, model: string | null, prompt: string, response: string, expectation: HumanExpectation,
  partition?: { split?: CaseSplit; pairId?: string }): string {
  const inputs: unknown[] = [source, model, prompt, response, expectation];
  if (partition) inputs.push(partition);
  return JSON.stringify(inputs);
}
