import { emptyAnalysisResult, type AnalysisResult } from '../../types/analysis';

const SCORE_KEYS = ['gaslighting', 'infantilizing', 'de_escalation', 'karen_trigger', 'hedging', 'dismissive'] as const;
const DENSITY_VALUES = new Set(['low', 'medium', 'high']);
const SEVERITY_VALUES = new Set(['low', 'medium', 'high']);

function toBoundedScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function validateAnalysisResult(payload: unknown): AnalysisResult {
  const fallback = emptyAnalysisResult();
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const scores = raw.scores && typeof raw.scores === 'object' ? (raw.scores as Record<string, unknown>) : {};

  const normalizedScores = SCORE_KEYS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = toBoundedScore(scores[key]);
    return acc;
  }, {});

  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          category: typeof item.category === 'string' ? item.category : 'General',
          text: typeof item.text === 'string' ? item.text : '',
          explanation: typeof item.explanation === 'string' ? item.explanation : 'No explanation provided.',
          severity: SEVERITY_VALUES.has(String(item.severity)) ? (item.severity as AnalysisResult['findings'][number]['severity']) : 'low',
          rlhfLogic: typeof item.rlhfLogic === 'string' ? item.rlhfLogic : undefined,
        }))
    : [];

  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          title: typeof item.title === 'string' ? item.title : 'Recommendation',
          description: typeof item.description === 'string' ? item.description : '',
          promptSnippet: typeof item.promptSnippet === 'string' ? item.promptSnippet : '',
        }))
    : [];

  const personalization = raw.personalization && typeof raw.personalization === 'object'
    ? (raw.personalization as Record<string, unknown>)
    : {};

  const contextAnalysis = raw.contextAnalysis && typeof raw.contextAnalysis === 'object'
    ? (raw.contextAnalysis as Record<string, unknown>)
    : {};

  const heatmap = Array.isArray(contextAnalysis.heatmap)
    ? contextAnalysis.heatmap
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          text: typeof item.text === 'string' ? item.text : '',
          density: DENSITY_VALUES.has(String(item.density)) ? (item.density as AnalysisResult['contextAnalysis']['heatmap'][number]['density']) : 'low',
          explanation: typeof item.explanation === 'string' ? item.explanation : undefined,
          suggestion: typeof item.suggestion === 'string' ? item.suggestion : undefined,
        }))
    : [];

  const euphemisms = Array.isArray(raw.euphemisms)
    ? raw.euphemisms
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          term: typeof item.term === 'string' ? item.term : '',
          translation: typeof item.translation === 'string' ? item.translation : '',
          context: typeof item.context === 'string' ? item.context : '',
        }))
    : [];

  return {
    ...fallback,
    scores: normalizedScores,
    findings,
    summary: typeof raw.summary === 'string' ? raw.summary : fallback.summary,
    overallTone: typeof raw.overallTone === 'string' ? raw.overallTone : fallback.overallTone,
    recommendations,
    personalization: {
      baseStyle: typeof personalization.baseStyle === 'string' ? personalization.baseStyle : fallback.personalization.baseStyle,
      directness: personalization.directness === 'More' || personalization.directness === 'Default' || personalization.directness === 'Less'
        ? personalization.directness
        : fallback.personalization.directness,
      neutrality: personalization.neutrality === 'More' || personalization.neutrality === 'Default' || personalization.neutrality === 'Less'
        ? personalization.neutrality
        : fallback.personalization.neutrality,
      brevity: personalization.brevity === 'More' || personalization.brevity === 'Default' || personalization.brevity === 'Less'
        ? personalization.brevity
        : fallback.personalization.brevity,
      humility: personalization.humility === 'More' || personalization.humility === 'Default' || personalization.humility === 'Less'
        ? personalization.humility
        : fallback.personalization.humility,
      karenRemediation: typeof personalization.karenRemediation === 'string'
        ? personalization.karenRemediation
        : fallback.personalization.karenRemediation,
      customInstructions: Array.isArray(personalization.customInstructions)
        ? personalization.customInstructions.filter((item): item is string => typeof item === 'string')
        : fallback.personalization.customInstructions,
    },
    contextAnalysis: {
      score: toBoundedScore(contextAnalysis.score),
      feedback: typeof contextAnalysis.feedback === 'string' ? contextAnalysis.feedback : fallback.contextAnalysis.feedback,
      heatmap,
    },
    euphemisms,
  };
}
