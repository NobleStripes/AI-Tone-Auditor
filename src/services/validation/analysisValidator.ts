import { emptyAnalysisResult, type AnalysisResult } from '../../types/analysis';
import { BASE_STYLES, SCORE_KEYS, CONTEXT_REQUIRED_SCORE_KEYS, CONTEXT_REQUIRED_FINDINGS, TONE_CATEGORIES } from '../../constants';
const DENSITY_VALUES = new Set(['low', 'medium', 'high']);
const SEVERITY_VALUES = new Set(['low', 'medium', 'high']);
const CALIBRATION_VALUES = new Set(['More', 'Default', 'Less']);
const SUPPORTED_BASE_STYLES = new Set(BASE_STYLES.map((style) => style.style));
const LEGACY_BASE_STYLE_MAP: Record<string, string> = {
  Nerdy: 'Efficient',
};

function toBoundedScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCalibration(value: unknown): AnalysisResult['personalization']['directness'] {
  return CALIBRATION_VALUES.has(String(value))
    ? (value as AnalysisResult['personalization']['directness'])
    : 'Default';
}

function normalizeBaseStyle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  if (LEGACY_BASE_STYLE_MAP[value]) {
    return LEGACY_BASE_STYLE_MAP[value];
  }

  if (SUPPORTED_BASE_STYLES.has(value)) {
    return value;
  }

  return fallback;
}

function normalizeFindingCategory(value: unknown): string {
  if (typeof value !== 'string') return 'General';
  return /^karen triggers?$/i.test(value.trim())
    ? TONE_CATEGORIES.KAREN_TRIGGER.label
    : value;
}

export function validateAnalysisResult(payload: unknown, context: { auditContext?: string } = {}): AnalysisResult {
  const fallback = emptyAnalysisResult();
  const hasAuditContext = Boolean(context.auditContext?.trim());
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const scores = raw.scores && typeof raw.scores === 'object' ? (raw.scores as Record<string, unknown>) : {};

  const normalizedScores = SCORE_KEYS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = !hasAuditContext && CONTEXT_REQUIRED_SCORE_KEYS.has(key)
      ? 0
      : toBoundedScore(scores[key]);
    return acc;
  }, {});

  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          category: normalizeFindingCategory(item.category),
          text: typeof item.text === 'string' ? item.text : '',
          explanation: typeof item.explanation === 'string' ? item.explanation : 'No explanation provided.',
          severity: SEVERITY_VALUES.has(String(item.severity)) ? (item.severity as AnalysisResult['findings'][number]['severity']) : 'low',
          rlhfLogic: typeof item.rlhfLogic === 'string' ? item.rlhfLogic : undefined,
        }))
        .filter((item) => item.text.trim().length > 0)
        .filter((item) => hasAuditContext || !CONTEXT_REQUIRED_FINDINGS.has(item.category.trim().toLowerCase()))
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
  const chatgptCharacteristics = personalization.chatgptCharacteristics && typeof personalization.chatgptCharacteristics === 'object'
    ? (personalization.chatgptCharacteristics as Record<string, unknown>)
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
      baseStyle: normalizeBaseStyle(personalization.baseStyle, fallback.personalization.baseStyle),
      directness: normalizeCalibration(personalization.directness),
      neutrality: normalizeCalibration(personalization.neutrality),
      brevity: normalizeCalibration(personalization.brevity),
      humility: normalizeCalibration(personalization.humility),
      chatgptCharacteristics: {
        warmth: normalizeCalibration(chatgptCharacteristics.warmth),
        enthusiasm: normalizeCalibration(chatgptCharacteristics.enthusiasm),
        headersAndLists: normalizeCalibration(chatgptCharacteristics.headersAndLists),
        emojis: normalizeCalibration(chatgptCharacteristics.emojis),
      },
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
