import type { ScoreId } from '../../../src/constants';
import type { AnalysisSource } from '../../../src/types/provider';
import type { AssessmentState } from '../../../src/types/diagnostics';

export { CORPUS_CASE_KINDS } from '../../../src/types/evaluation';
export type { CorpusCaseKind } from '../../../src/types/evaluation';
import type { CorpusCaseKind } from '../../../src/types/evaluation';

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
