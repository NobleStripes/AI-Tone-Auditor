import { CATEGORY_REGISTRY, type ScoreId } from '../constants';
import type { AnalysisResult } from '../types/analysis';
import type { AssessmentState } from '../types/diagnostics';
import type { Evidence, ExclusionReason } from '../types/evidence';
import type { EvidenceExpectation, EvidencePassage, EvidenceEvaluation, ExcludedPassage, ObservedEvidence } from '../types/evaluation';
import { normalizeFindingCategory } from './validation/analysisValidator';

export const EVALUATION_EXCLUSION_REASONS: readonly ExclusionReason[] = ['fenced_code', 'inline_code', 'blockquote', 'illustrative_example', 'reported_speech'];
export const EVIDENCE_EVALUATION_VERSION = '2026-10-12.v1';

export function passageKey(passage: EvidencePassage): string {
  return JSON.stringify([passage.startOffset, passage.endOffset, passage.matchedText, passage.kind ?? 'quotation']);
}

function exactPassage(response: string, evidence: Evidence | undefined): EvidencePassage | null {
  if (!evidence || evidence.verification !== 'verified'
    || !Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)
    || evidence.startOffset < 0 || evidence.endOffset <= evidence.startOffset || evidence.endOffset > response.length
    || !evidence.matchedText?.trim() || response.slice(evidence.startOffset, evidence.endOffset) !== evidence.matchedText) return null;
  if (evidence.kind !== undefined && evidence.kind !== 'quotation' && evidence.kind !== 'response_scope') return null;
  if (evidence.kind === 'response_scope' && (evidence.startOffset !== 0 || evidence.endOffset !== response.length)) return null;
  return { startOffset: evidence.startOffset, endOffset: evidence.endOffset, matchedText: evidence.matchedText,
    ...(evidence.kind === 'response_scope' ? { kind: 'response_scope' as const } : {}) };
}

function distinct<T extends EvidencePassage>(passages: T[], key: (item: T) => string = passageKey): T[] {
  return [...new Map(passages.map(item => [key(item), item])).values()]
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset || key(a).localeCompare(key(b)));
}

export function observeEvidence(result: AnalysisResult, categoryId: ScoreId, response: string): ObservedEvidence {
  const label = CATEGORY_REGISTRY.find(category => category.id === categoryId).label.toLowerCase();
  const matches = (category: string) => {
    const normalized = normalizeFindingCategory(category).trim().toLowerCase();
    return normalized === label || (categoryId === 'dismissive' && normalized === 'dismissive language');
  };
  const passages: EvidencePassage[] = [];
  const exclusions: ExcludedPassage[] = [];
  let invalidRecords = 0;
  const inspect = (evidence: Evidence | undefined, isFinding: boolean) => {
    const passage = exactPassage(response, evidence);
    if (!passage) { invalidRecords++; return; }
    if (evidence.eligibility === 'excluded') {
      if (passage.kind === 'response_scope' || !EVALUATION_EXCLUSION_REASONS.includes(evidence.exclusionReason)) { invalidRecords++; return; }
      exclusions.push({ ...passage, exclusionReason: evidence.exclusionReason });
    } else if (evidence.eligibility === 'included' && isFinding) passages.push(passage);
    else if (evidence.eligibility !== 'included') invalidRecords++;
  };
  result.findings.filter(finding => matches(finding.category)).forEach(finding => inspect(finding.evidence, true));
  (result.occurrences ?? []).filter(item => item.scoreId === categoryId)
    .forEach(item => inspect(item.evidence, false));
  return { passages: distinct(passages), exclusions: distinct(exclusions, item => `${passageKey(item)}:${item.exclusionReason}`), invalidRecords };
}

export function evaluateEvidence(expected: EvidenceExpectation, observed: ObservedEvidence, assessment: AssessmentState): EvidenceEvaluation {
  const found = new Set(observed.passages.map(passageKey));
  const wanted = new Set(expected.passages.map(passageKey));
  const retained = new Set(observed.exclusions.map(item => `${passageKey(item)}:${item.exclusionReason}`));
  const missingPassages = expected.passages.filter(item => !found.has(passageKey(item)));
  const unexpectedPassages = observed.passages.filter(item => !wanted.has(passageKey(item)));
  const missingExclusions = expected.exclusions.filter(item => !retained.has(`${passageKey(item)}:${item.exclusionReason}`));
  const exclusionViolations = expected.exclusions.filter(excluded => observed.passages.some(item =>
    item.kind !== 'response_scope' && item.startOffset < excluded.endOffset && item.endOffset > excluded.startOffset));
  const status = assessment === 'not_assessed' || assessment === 'insufficient_context' ? 'coverage_gap' : 'evaluated';
  return {
    status, matchedPassages: expected.passages.length - missingPassages.length, matchedExclusions: expected.exclusions.length - missingExclusions.length,
    missingPassages, unexpectedPassages, missingExclusions, exclusionViolations, invalidRecords: observed.invalidRecords,
    passed: status === 'evaluated' && !missingPassages.length && !unexpectedPassages.length
      && !missingExclusions.length && !exclusionViolations.length && observed.invalidRecords === 0,
  };
}
