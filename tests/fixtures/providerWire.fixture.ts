import type { AnalysisResult } from '../../src/types/analysis';

// Provider fixtures use the declared wire schema; runtime-only evidence is added locally.
export function providerWireResult(result: AnalysisResult) {
  const { occurrences: _occurrences, ...wire } = result;
  return {
    ...wire,
    findings: result.findings.map(finding => ({
      category: finding.category, text: finding.text, explanation: finding.explanation, severity: finding.severity,
      confidence: finding.confidence ?? 'unknown', method: finding.method ?? 'semantic', rlhfLogic: finding.rlhfLogic ?? null,
      evidence: finding.evidence ? {
        startOffset: finding.evidence.startOffset ?? null, endOffset: finding.evidence.endOffset ?? null,
        matchedText: finding.evidence.matchedText,
      } : null,
    })),
    contextAnalysis: {
      ...result.contextAnalysis,
      heatmap: result.contextAnalysis.heatmap.map(chunk => ({
        ...chunk, explanation: chunk.explanation ?? null, suggestion: chunk.suggestion ?? null,
      })),
    },
  };
}
