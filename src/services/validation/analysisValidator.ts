import { emptyAnalysisResult, type AnalysisResult } from '../../types/analysis';
import { BASE_STYLES, SCORE_KEYS, CONTEXT_REQUIRED_SCORE_KEYS, CONTEXT_REQUIRED_FINDINGS, TONE_CATEGORIES, CATEGORY_REGISTRY } from '../../constants';
import { ASSESSMENT_STATES, CONFIDENCE_LEVELS, ASSESSMENT_METHODS, type CategoryAssessment, type ConfidenceLevel, type AssessmentMethod } from '../../types/diagnostics';
import { collectOccurrences, isEligibleEvidence, restoreEvidence, verifyEvidence } from '../evidence';
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
    ? TONE_CATEGORIES.BUREAUCRATIC_STONEWALLING.label
    : value;
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  return CONFIDENCE_LEVELS.find((level) => level === value) ?? 'unknown';
}

function normalizeMethod(value: unknown): AssessmentMethod {
  return ASSESSMENT_METHODS.find((method) => method === value) ?? 'unrecorded';
}

export function validateAnalysisResult(payload: unknown, context: {
  auditContext?: string;
  assessmentMethod?: AssessmentMethod;
  responseText?: string;
  restored?: boolean;
} = {}): AnalysisResult {
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

  const rawAssessments = raw.assessments && typeof raw.assessments === 'object'
    ? raw.assessments as Record<string, unknown> : {};
  const assessments = { ...fallback.assessments };
  for (const key of SCORE_KEYS) {
    if (!hasAuditContext && CONTEXT_REQUIRED_SCORE_KEYS.has(key)) continue;
    const value = rawAssessments[key];
    const assessment = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    let status: CategoryAssessment['status'] = ASSESSMENT_STATES.find((state) => state === assessment.status) ?? 'not_assessed';
    const validScore = typeof scores[key] === 'number' && Number.isFinite(scores[key]);
    if (status === 'assessed' && !validScore) status = 'not_assessed';
    assessments[key] = {
      status,
      reason: status === 'assessed' || status === assessment.status
        ? typeof assessment.reason === 'string' && assessment.reason.trim() ? assessment.reason : 'No assessment reason was recorded.'
        : 'Assessment metadata or a valid score is missing; a stored score alone does not prove assessment.',
      confidence: status === 'assessed' ? normalizeConfidence(assessment.confidence) : 'unknown',
      method: status === 'assessed' && context.assessmentMethod
        ? context.assessmentMethod : normalizeMethod(assessment.method),
    };
  }

  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          category: normalizeFindingCategory(item.category),
          text: typeof item.text === 'string' ? item.text : '',
          explanation: typeof item.explanation === 'string' ? item.explanation : 'No explanation provided.',
          severity: SEVERITY_VALUES.has(String(item.severity)) ? (item.severity as AnalysisResult['findings'][number]['severity']) : 'low',
          confidence: normalizeConfidence(item.confidence),
          method: context.assessmentMethod ?? normalizeMethod(item.method),
          rlhfLogic: typeof item.rlhfLogic === 'string' ? item.rlhfLogic : undefined,
          ...(item.evidence || (context.responseText !== undefined && !context.restored) ? {
            evidence: (context.restored ? restoreEvidence : verifyEvidence)(context.responseText, typeof item.text === 'string' ? item.text : '', item.evidence),
          } : {}),
          ...(typeof item.occurrenceId === 'string' ? { occurrenceId: item.occurrenceId } : {}),
        }))
        .filter((item) => item.text.trim().length > 0)
        .filter((item) => hasAuditContext || !CONTEXT_REQUIRED_FINDINGS.has(item.category.trim().toLowerCase()))
    : [];

  if (context.assessmentMethod === 'semantic' && !context.restored && context.responseText !== undefined) {
    for (const category of CATEGORY_REGISTRY.filter(category => category.kind === 'risk' && !category.requiresContext)) {
      const support = findings.filter(finding => finding.category.trim().toLowerCase() === category.label.toLowerCase()
        || (category.id === 'dismissive' && finding.category.trim().toLowerCase() === 'dismissive language'));
      const rejected = support.some(finding => !isEligibleEvidence(finding.evidence));
      if (normalizedScores[category.id] > 0 && !support.some(finding => isEligibleEvidence(finding.evidence))) {
        normalizedScores[category.id] = 0;
        assessments[category.id] = {
          status: 'not_assessed', confidence: 'unknown', method: 'semantic',
          reason: 'Positive diagnostic withheld: no eligible, verified quotation supports it. Inspect rejected evidence below.',
        };
      } else if (rejected) {
        assessments[category.id] = {
          ...assessments[category.id],
          reason: `${assessments[category.id].reason} Some reported evidence was excluded or unverified; the score magnitude is not independently validated.`,
        };
      }
    }
  }

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
    assessments,
    findings,
    ...(context.responseText !== undefined && !context.restored
      ? { occurrences: collectOccurrences(context.responseText) }
      : Array.isArray(raw.occurrences) ? {
        occurrences: raw.occurrences.flatMap(value => {
          if (!value || typeof value !== 'object') return [];
          const item = value as Record<string, unknown>;
          const scoreId = SCORE_KEYS.find(key => key === item.scoreId);
          if (!scoreId || typeof item.id !== 'string' || typeof item.ruleId !== 'string'
            || typeof item.category !== 'string' || typeof item.explanation !== 'string'
            || typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight < 0
            || !item.evidence || typeof item.evidence !== 'object') return [];
          const evidence = item.evidence as Record<string, unknown>;
          if (typeof evidence.matchedText !== 'string') return [];
          return [{
            id: item.id, ruleId: item.ruleId, scoreId, category: item.category,
            explanation: item.explanation, weight: item.weight,
            evidence: restoreEvidence(context.responseText, evidence.matchedText, evidence),
          }];
        }),
      } : {}),
    summary: `${context.assessmentMethod === 'semantic' && !context.restored && findings.some(finding => !isEligibleEvidence(finding.evidence))
      ? 'Evidence warning: some provider quotations were excluded or could not be verified. The provider interpretation below is not confirmed by those quotations. ' : ''}${typeof raw.summary === 'string' ? raw.summary : fallback.summary}`,
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
      stonewallingRemediation: typeof personalization.stonewallingRemediation === 'string'
        ? personalization.stonewallingRemediation
        : typeof personalization.karenRemediation === 'string'
          ? personalization.karenRemediation
          : fallback.personalization.stonewallingRemediation,
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
