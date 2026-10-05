import { CATEGORY_REGISTRY, type ScoreId } from '../constants';

export const ASSESSMENT_STATES = ['assessed', 'not_assessed', 'insufficient_context', 'not_applicable'] as const;
export const CONFIDENCE_LEVELS = ['unknown', 'low', 'medium', 'high'] as const;
export const ASSESSMENT_METHODS = ['unrecorded', 'lexical_rule', 'semantic'] as const;

export type AssessmentState = typeof ASSESSMENT_STATES[number];
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];
export type AssessmentMethod = typeof ASSESSMENT_METHODS[number];

export interface CategoryAssessment {
  status: AssessmentState;
  reason: string;
  confidence: ConfidenceLevel;
  method: AssessmentMethod;
}

export const DIAGNOSTIC_GROUPS = [
  { id: 'communication', label: 'Communication' },
  { id: 'contextual', label: 'Contextual behavior' },
  { id: 'epistemic', label: 'Epistemic behavior' },
  { id: 'quality', label: 'Quality' },
] as const;

export const ASSESSMENT_LABELS: Record<AssessmentState, string> = {
  assessed: 'Assessed',
  not_assessed: 'N/A — not assessed',
  insufficient_context: 'Insufficient context',
  not_applicable: 'N/A — not applicable',
};

export const METHOD_LABELS: Record<AssessmentMethod, string> = {
  unrecorded: 'Method unrecorded',
  lexical_rule: 'Lexical rule (heuristic)',
  semantic: 'Semantic assessment',
};

export function createEmptyAssessments(): Record<ScoreId, CategoryAssessment> {
  return Object.fromEntries(CATEGORY_REGISTRY.map(({ id, requiresContext }) => [id, {
    status: requiresContext ? 'insufficient_context' : 'not_assessed',
    reason: requiresContext ? 'Original-prompt context is required.' : 'No assessment has been recorded.',
    confidence: 'unknown',
    method: 'unrecorded',
  }])) as Record<ScoreId, CategoryAssessment>;
}

export function formatDiagnosticScore(score: number, assessment: CategoryAssessment): string {
  return assessment.status === 'assessed' ? `${score}/100` : ASSESSMENT_LABELS[assessment.status];
}
