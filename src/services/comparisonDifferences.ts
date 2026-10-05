import { CATEGORY_REGISTRY } from '../constants';
import type { ComparisonResult } from '../types/comparison';

export function comparisonDifferences(comparison: ComparisonResult) {
  return CATEGORY_REGISTRY.map((category) => {
    const assessed = comparison.items.flatMap((item) => item.status === 'completed'
      && item.analysis.result.assessments[category.id].status === 'assessed' ? [item] : []);
    const conditions = assessed.map(({ analysis }) =>
      [
        analysis.meta.providerId, analysis.meta.model, analysis.result.assessments[category.id].method,
        analysis.provenance ? analysis.provenance.auditorVersion : comparison.auditorVersion,
        analysis.provenance ? analysis.provenance.promptVersion : comparison.rubricVersion,
        analysis.provenance ? analysis.provenance.localRuleVersion : comparison.localRuleVersion,
      ]);
    const auditors = new Set(conditions.map(condition => JSON.stringify(condition)));
    const unrecordedVersion = conditions.some(condition => condition.some(value => !value?.trim()));
    const unrecordedMethod = assessed.some(({ analysis }) => analysis.result.assessments[category.id].method === 'unrecorded');
    const scores = assessed.map(({ analysis }) => analysis.result.scores[category.id]);
    const note = 'sourceOnly' in category ? 'Source-specific lens; not a universal comparison.'
      : unrecordedMethod ? 'Assessment method unrecorded; numeric spread withheld.'
        : unrecordedVersion ? 'Auditor/model/prompt/rule version unrecorded; numeric spread withheld.'
        : auditors.size > 1 ? 'Different auditing methods or models, or auditor/prompt/rule versions; numeric spread withheld.'
        : scores.length < 2 ? 'Fewer than two comparable assessments.'
          : 'Difference in observed indices, not a ranking or probability.';
    return {
      category,
      spread: !('sourceOnly' in category) && !unrecordedMethod && !unrecordedVersion && auditors.size === 1 && scores.length >= 2
        ? Math.max(...scores) - Math.min(...scores) : null,
      note,
    };
  });
}
