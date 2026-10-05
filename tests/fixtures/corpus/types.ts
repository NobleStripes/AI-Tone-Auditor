import type { ScoreId } from '../../../src/constants';
import type { AnalysisSource } from '../../../src/types/provider';
import type { AssessmentState } from '../../../src/types/diagnostics';

export const CORPUS_CASE_KINDS = ['positive', 'negative', 'ambiguous', 'false_positive_trap', 'paraphrased_false_negative'] as const;
export type CorpusCaseKind = typeof CORPUS_CASE_KINDS[number];

export interface CorpusCase {
  id: string;
  categoryId: ScoreId;
  kind: CorpusCaseKind;
  originalPrompt: string;
  sourceModel: AnalysisSource;
  response: string;
  intendedSignal: 'present' | 'absent' | 'ambiguous';
  expectedLocal: { status: AssessmentState; score: number };
  note: string;
}

export interface FixtureCorpus {
  version: string;
  rubricVersion: string;
  localRuleVersion: string;
  categoryIds: readonly ScoreId[];
  cases: readonly CorpusCase[];
}
