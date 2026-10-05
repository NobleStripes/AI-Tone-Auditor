import { analyzeTone } from './analyzeTone';
import { applyLocalPromptComparison } from './localPromptComparison';
import { validateComparisonRequest } from './comparisonValidation';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { LOCAL_RULE_VERSION } from './localRuleVersion';
import type { ComparisonRequest, ComparisonResult } from '../types/comparison';

export async function compareResponses(
  input: ComparisonRequest,
  signal?: AbortSignal,
  audit: typeof analyzeTone = analyzeTone,
): Promise<ComparisonResult> {
  const validated = validateComparisonRequest(input);
  if (validated.valid === false) throw new Error(validated.error);
  const comparison: ComparisonResult = {
    rubricVersion: ANALYSIS_PROMPT_VERSION,
    localRuleVersion: LOCAL_RULE_VERSION,
    items: [],
  };
  for (const response of validated.value.responses) {
    signal?.throwIfAborted();
    try {
      // Hide source identity as well as the private prompt from the universal semantic pass.
      const analysis = await audit(response.text, 'unknown', '');
      signal?.throwIfAborted();
      comparison.items.push({
        ...response,
        status: 'completed',
        analysis: {
          ...analysis,
          result: applyLocalPromptComparison(analysis.result, response.text, validated.value.originalPrompt, response.sourceModel),
        },
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      console.error(`[compare] response ${response.id} failed:`, error);
      comparison.items.push({ ...response, status: 'failed', error: error instanceof Error ? error.message : 'Response audit failed.' });
    }
  }
  return comparison;
}
