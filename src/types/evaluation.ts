import type { ScoreId } from '../constants';
import type { AssessmentState } from './diagnostics';
import type { ComparisonSource } from './comparison';
import type { AnalysisSource } from './provider';

export const CORPUS_CASE_KINDS = ['positive', 'negative', 'ambiguous', 'false_positive_trap', 'paraphrased_false_negative'] as const;
export type CorpusCaseKind = typeof CORPUS_CASE_KINDS[number];

export type IntendedSignal = 'present' | 'absent' | 'ambiguous';
export type ObservedDiagnostic = { status: AssessmentState; score: number };
export type Outcome = 'detected' | 'avoided' | 'false_positive' | 'false_negative' | 'ambiguous' | 'unassessed' | 'correct_abstention';

export interface HumanExpectation {
  categoryId: ScoreId;
  intendedSignal: IntendedSignal;
  note: string;
}

export interface RecordedAudit {
  auditorVersion: string;
  promptVersion: string;
  localRuleVersion: string;
  analyzedAt: string;
  analysisProvider: { providerId: 'local'; model: string };
  results: Array<{ categoryId: ScoreId; inputHash: string } & ObservedDiagnostic>;
}

export interface RealWorldCase {
  id: string;
  sourceModel: ComparisonSource;
  model: string | null;
  collectedAt: string | null;
  originalPrompt: string;
  response: string;
  privacyReview: { confirmed: true; note: string };
  expectations: HumanExpectation[];
  baseline: RecordedAudit | null;
}

export interface RealWorldDataset {
  schemaVersion: '1.0.0';
  version: string;
  cases: RealWorldCase[];
}

export interface SyntheticDataset extends RealWorldDataset {
  datasetKind: 'synthetic';
}

export type EvaluationDataset = RealWorldDataset | SyntheticDataset;

export interface EvaluationObservation {
  datasetKind: 'synthetic' | 'real_world';
  corpusVersion: string;
  id: string;
  categoryId: ScoreId;
  sourceModel: AnalysisSource;
  sourceModelVersion: string | null;
  kind: CorpusCaseKind | 'real_world' | 'synthetic_import';
  inputHash: string;
  intendedSignal: IntendedSignal;
  signalThreshold: number;
  baseline: ObservedDiagnostic | null;
  baselineRuleVersion: string | null;
  baselineAuditorVersion: string | null;
  current: ObservedDiagnostic;
  currentRuleVersion: string;
  auditorVersion: string;
  promptVersion: string;
  analyzedAt: string;
  analysisProvider: { providerId: 'local'; model: string };
  outcome: Outcome;
  baselineOutcome: Outcome | null;
  changed: boolean | null;
  note: string;
}

export interface FailureRecord {
  id: string;
  type: 'false_positive' | 'false_negative';
  datasetKind: EvaluationObservation['datasetKind'];
  datasetVersion: string;
  caseId: string;
  inputHash: string;
  sourceModel: AnalysisSource;
  sourceModelVersion: string | null;
  categoryId: ScoreId;
  auditorVersion: string;
  localRuleVersion: string;
  promptVersion: string;
  analyzedAt: string;
  analysisProvider: EvaluationObservation['analysisProvider'];
  expected: { signal: 'present' | 'absent'; signalThreshold: number };
  actual: ObservedDiagnostic;
  explanation: string;
}

export interface FailureLedger {
  schemaVersion: '1.0.0';
  recordedAt: string;
  failures: FailureRecord[];
}
