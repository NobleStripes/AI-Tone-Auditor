import type { AnalysisResult } from '../types/analysis';
import type { AnalysisProvenance } from '../types/provenance';
import type { ComparisonResult } from '../types/comparison';
import { AUDITOR_VERSION, normalizeAnalysisProvenance } from './auditProvenance';

export function createAuditExport(result: AnalysisResult, provenance?: AnalysisProvenance) {
  return {
    ...result,
    exportMetadata: {
      schemaVersion: '1.0.0',
      ...normalizeAnalysisProvenance(provenance),
      exporterVersion: AUDITOR_VERSION,
      exportedAt: new Date().toISOString(),
      originalPromptIncluded: false,
    },
  };
}

export function createComparisonExport(comparison: ComparisonResult) {
  return {
    ...comparison,
    exportMetadata: {
      schemaVersion: '1.0.0',
      auditorVersion: comparison.auditorVersion ?? null,
      exporterVersion: AUDITOR_VERSION,
      promptVersion: comparison.rubricVersion,
      localRuleVersion: comparison.localRuleVersion,
      comparisonSessionId: comparison.sessionId ?? null,
      startedAt: comparison.startedAt ?? null,
      completedAt: comparison.completedAt ?? null,
      exportedAt: new Date().toISOString(),
      originalPromptIncluded: false,
    },
  };
}
