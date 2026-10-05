import { CATEGORY_REGISTRY } from '../constants';
import type { ComparisonResult } from '../types/comparison';

export function comparisonDifferences(comparison: ComparisonResult) {
  return CATEGORY_REGISTRY.map((category) => {
    const assessed = comparison.items.flatMap((item) => item.status === 'completed'
      && item.analysis.result.assessments[category.id].status === 'assessed' ? [item] : []);
    const auditors = new Set(assessed.map(({ analysis }) =>
      `${analysis.meta.providerId}:${analysis.meta.model}:${analysis.result.assessments[category.id].method}`));
    const scores = assessed.map(({ analysis }) => analysis.result.scores[category.id]);
    const note = 'sourceOnly' in category ? 'Source-specific lens; not a universal comparison.'
      : auditors.size > 1 ? 'Different auditing methods or models; numeric spread withheld.'
        : scores.length < 2 ? 'Fewer than two comparable assessments.'
          : 'Difference in observed indices, not a ranking or probability.';
    return {
      category,
      spread: !('sourceOnly' in category) && auditors.size === 1 && scores.length >= 2
        ? Math.max(...scores) - Math.min(...scores) : null,
      note,
    };
  });
}
