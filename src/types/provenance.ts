import type { AnalysisSource, ProviderRuntimeMeta } from './provider';

export type AssessmentContext = 'live' | 'restored_without_prompt' | 'unrecorded';

export interface AnalysisProvenance {
  auditorVersion: string | null;
  promptVersion: string | null;
  localRuleVersion: string | null;
  analysisProvider: ProviderRuntimeMeta | null;
  selectedSourceModel: AnalysisSource;
  analyzedAt: string | null;
  comparisonSessionId: string | null;
  assessmentContext: AssessmentContext;
}
