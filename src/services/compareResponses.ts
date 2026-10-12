import { analyzeTone } from './analyzeTone';
import { applyLocalPromptComparison } from './localPromptComparison';
import { validateComparisonRequest } from './comparisonValidation';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { LOCAL_RULE_VERSION } from './localRuleVersion';
import type { ComparisonRequest, ComparisonResult } from '../types/comparison';
import { randomUUID } from 'node:crypto';
import { AUDITOR_VERSION, createAnalysisProvenance } from './auditProvenance';
import { ApiPolicyError } from './apiPolicy';

export class ComparisonBudgetError extends ApiPolicyError {
  constructor(error: ApiPolicyError, readonly comparison: ComparisonResult) {
    super(error.code, error.status, error.message, error.retryAfter);
  }
}

export async function compareResponses(
  input: ComparisonRequest,
  signal?: AbortSignal,
  audit: typeof analyzeTone = analyzeTone,
): Promise<ComparisonResult> {
  const validated = validateComparisonRequest(input);
  if (validated.valid === false) throw new Error(validated.error);
  const comparison: ComparisonResult = {
    sessionId: randomUUID(),
    auditorVersion: AUDITOR_VERSION,
    startedAt: new Date().toISOString(),
    rubricVersion: ANALYSIS_PROMPT_VERSION,
    localRuleVersion: LOCAL_RULE_VERSION,
    items: [],
  };
  for (const [index, response] of validated.value.responses.entries()) {
    signal?.throwIfAborted();
    try {
      // Hide source identity as well as the private prompt from the universal semantic pass.
      const analysis = await audit(response.text, 'unknown', '', signal);
      signal?.throwIfAborted();
      comparison.items.push({
        ...response,
        status: 'completed',
        analysis: {
          ...analysis,
          provenance: {
            ...(analysis.provenance ?? createAnalysisProvenance(analysis.meta, response.sourceModel)),
            selectedSourceModel: response.sourceModel,
            comparisonSessionId: comparison.sessionId,
            assessmentContext: 'live',
          },
          result: applyLocalPromptComparison(analysis.result, response.text, validated.value.originalPrompt, response.sourceModel),
        },
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (error instanceof ApiPolicyError) {
        for (const unavailable of validated.value.responses.slice(index)) {
          comparison.items.push({ ...unavailable, status: 'failed', error: 'External audit budget exhausted; no result available.' });
        }
        comparison.completedAt = new Date().toISOString();
        throw new ComparisonBudgetError(error, comparison);
      }
      console.error('[compare] response audit failed', { code: 'AUDIT_FAILED', index });
      comparison.items.push({ ...response, status: 'failed', error: 'Response audit failed. Check server configuration or try again later.' });
    }
  }
  comparison.completedAt = new Date().toISOString();
  return comparison;
}
