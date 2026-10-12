import type { AnalysisResult } from '../types/analysis';
import type { AnalysisProvenance } from '../types/provenance';
import type { ComparisonResult } from '../types/comparison';
import { AUDITOR_VERSION, normalizeAnalysisProvenance } from './auditProvenance';
import { applyAnthropomorphismGuard } from './anthropomorphismGuard';
import { enforceReportIntegrity } from './validation/reportIntegrity';

export function createAuditExport(result: AnalysisResult, provenance?: AnalysisProvenance) {
  return {
    ...enforceReportIntegrity(applyAnthropomorphismGuard(result)),
    exportMetadata: {
      schemaVersion: '1.1.0',
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
    items: comparison.items.map(item => item.status === 'completed' ? {
      ...item, analysis: { ...item.analysis, result: enforceReportIntegrity(applyAnthropomorphismGuard(item.analysis.result, item.text,
        item.analysis.result.anthropomorphismGuard?.fictionContext ?? false), item.text) },
    } : item),
    exportMetadata: {
      schemaVersion: '1.1.0',
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
