import { CATEGORY_REGISTRY, SCORE_KEYS, type ScoreId } from '../constants';
import { ASSESSMENT_STATES, ASSESSMENT_METHODS, CONFIDENCE_LEVELS } from '../types/diagnostics';
import { PROVIDER_IDS } from '../types/provider';
import type { AuditConditionConfig, BaselineDifference, CliAudit, CliAuditReport, ConditionViolation } from '../types/auditCli';
import type { AnalysisResult, Finding } from '../types/analysis';
import { normalizeFindingCategory } from './validation/analysisValidator';
import { isEligibleEvidence } from './evidence';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function fields(value: unknown, allowed: string[], path: string): Record<string, unknown> {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${path}: invalid object or unknown field.`);
  return value;
}
function ids(value: unknown, path: string): ScoreId[] {
  if (!Array.isArray(value) || value.some(id => !SCORE_KEYS.includes(id)) || new Set(value).size !== value.length) throw new Error(`${path}: expected unique category IDs.`);
  return value as ScoreId[];
}
export function parseAuditConditions(value: unknown): AuditConditionConfig {
  const raw = fields(value, ['schemaVersion', 'failOn', 'baseline'], 'conditions');
  if (raw.schemaVersion !== '1.0.0') throw new Error('Unsupported conditions schemaVersion.');
  const config: AuditConditionConfig = { schemaVersion: '1.0.0' };
  if (raw.failOn !== undefined) {
    const fail = fields(raw.failOn, ['minSeverity', 'categories', 'scoreAtOrAbove', 'qualityBelow', 'anthropomorphism', 'unverifiedFindings', 'requiredAssessments'], 'failOn');
    if (fail.minSeverity !== undefined && !['low', 'medium', 'high'].includes(String(fail.minSeverity))) throw new Error('failOn.minSeverity: invalid severity.');
    if (fail.categories !== undefined) ids(fail.categories, 'failOn.categories');
    if (fail.requiredAssessments !== undefined) ids(fail.requiredAssessments, 'failOn.requiredAssessments');
    for (const key of ['anthropomorphism', 'unverifiedFindings']) if (fail[key] !== undefined && typeof fail[key] !== 'boolean') throw new Error(`failOn.${key}: expected boolean.`);
    for (const key of ['scoreAtOrAbove', 'qualityBelow'] as const) {
      if (fail[key] !== undefined) {
        const limits = fields(fail[key], [...SCORE_KEYS], `failOn.${key}`);
        for (const [id, limit] of Object.entries(limits)) {
          if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0 || limit > 100) throw new Error(`failOn.${key}: indices must be in [0,100].`);
          if ((CATEGORY_REGISTRY.find(item => item.id === id).kind === 'quality') !== (key === 'qualityBelow')) throw new Error(`failOn.${key}: wrong risk/quality direction for ${id}.`);
        }
      }
    }
    config.failOn = fail as AuditConditionConfig['failOn'];
  }
  if (raw.baseline !== undefined) {
    const baseline = fields(raw.baseline, ['newFindings', 'maxRiskIncrease', 'coverageLoss', 'newAnthropomorphismClaims'], 'baseline');
    for (const key of ['newFindings', 'coverageLoss', 'newAnthropomorphismClaims']) if (baseline[key] !== undefined && typeof baseline[key] !== 'boolean') throw new Error(`baseline.${key}: expected boolean.`);
    if (baseline.maxRiskIncrease !== undefined && (typeof baseline.maxRiskIncrease !== 'number' || !Number.isFinite(baseline.maxRiskIncrease) || baseline.maxRiskIncrease < 0 || baseline.maxRiskIncrease > 100)) throw new Error('baseline.maxRiskIncrease: expected index increase in [0,100].');
    config.baseline = baseline as AuditConditionConfig['baseline'];
  }
  return config;
}

export function findingCategory(finding: Finding): ScoreId | undefined {
  const name = normalizeFindingCategory(finding.category).toLowerCase().trim();
  return CATEGORY_REGISTRY.find(item => item.label.toLowerCase() === name || item.id === name
    || item.id === 'dismissive' && name === 'dismissive language')?.id;
}
const findingKey = (item: Finding) => JSON.stringify([findingCategory(item) ?? item.category,
  item.evidence?.startOffset, item.evidence?.endOffset, item.evidence?.matchedText, item.evidence?.kind ?? 'quotation']);
const eligible = (result: AnalysisResult) => [...new Map(result.findings.filter(item => isEligibleEvidence(item.evidence)).map(item => [findingKey(item), item])).values()];
const claims = (result: AnalysisResult) => new Set((result.anthropomorphismGuard?.sourceClaims ?? []).filter(item => item.disposition === 'flagged')
  .map(item => JSON.stringify([item.evidence.startOffset, item.evidence.endOffset, item.evidence.matchedText])));

// Baselines are recorded results, never passed through today's permissive history normalization.
export function parseCliBaseline(value: unknown): CliAuditReport {
  const raw = fields(value, ['schemaVersion', 'guardVersion', 'generatedAt', 'audits', 'baselineComparison', 'violations'], 'baseline');
  if (raw.schemaVersion !== '1.0.0' || typeof raw.guardVersion !== 'string' || !raw.guardVersion || !Array.isArray(raw.audits)) throw new Error('Unsupported CLI baseline.');
  const seen = new Set<string>();
  for (const audit of raw.audits) {
    if (!object(audit) || audit.status !== 'completed' || typeof audit.id !== 'string' || !audit.id || seen.has(audit.id)
      || typeof audit.inputHash !== 'string' || !/^[a-f0-9]{64}$/.test(audit.inputHash) || !object(audit.analysis)) throw new Error('Baseline must contain unique, completed audits with input fingerprints.');
    seen.add(audit.id);
    const analysis = audit.analysis;
    if (!object(analysis.meta) || !PROVIDER_IDS.includes(analysis.meta.providerId as never) || typeof analysis.meta.model !== 'string'
      || !object(analysis.result) || !object(analysis.result.scores) || !object(analysis.result.assessments) || !Array.isArray(analysis.result.findings)) throw new Error('Baseline analysis contract is incomplete.');
    for (const id of SCORE_KEYS) {
      const score = analysis.result.scores[id]; const assessment = analysis.result.assessments[id];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100 || !object(assessment)
        || !ASSESSMENT_STATES.includes(assessment.status as never) || !ASSESSMENT_METHODS.includes(assessment.method as never)
        || !CONFIDENCE_LEVELS.includes(assessment.confidence as never)) throw new Error('Baseline must retain complete scores and assessment states.');
    }
    for (const finding of analysis.result.findings) {
      if (!object(finding) || typeof finding.category !== 'string' || typeof finding.text !== 'string' || !['low', 'medium', 'high'].includes(String(finding.severity))) throw new Error('Invalid baseline finding.');
      const evidence = finding.evidence;
      if (evidence !== undefined && (!object(evidence) || typeof evidence.matchedText !== 'string'
        || !['verified', 'unverified', 'unrecorded'].includes(String(evidence.verification)) || !['included', 'excluded'].includes(String(evidence.eligibility)))) throw new Error('Invalid baseline evidence.');
      if (object(evidence) && evidence.verification === 'verified' && (!Number.isInteger(evidence.startOffset) || !Number.isInteger(evidence.endOffset)
        || Number(evidence.startOffset) < 0 || Number(evidence.endOffset) <= Number(evidence.startOffset) || evidence.matchedText !== finding.text)) throw new Error('Invalid verified baseline passage.');
    }
    if (analysis.result.anthropomorphismGuard !== undefined) {
      const guard = analysis.result.anthropomorphismGuard;
      if (!object(guard) || !Array.isArray(guard.sourceClaims) || !Array.isArray(guard.blockedFields)) throw new Error('Invalid baseline safeguard.');
      for (const claim of guard.sourceClaims) if (!object(claim) || !['flagged', 'context_only'].includes(String(claim.disposition))
        || !object(claim.evidence) || typeof claim.evidence.matchedText !== 'string') throw new Error('Invalid baseline safeguard claim.');
    }
  }
  return raw as unknown as CliAuditReport;
}

export function compareCliBaseline(current: CliAudit[], baseline: CliAuditReport): BaselineDifference[] {
  if (current.length !== baseline.audits.length || current.some(item => !baseline.audits.some(previous => previous.id === item.id))) throw new Error('Baseline audit IDs must match the current input set exactly.');
  return current.flatMap(item => {
    const previous = baseline.audits.find(audit => audit.id === item.id);
    if (item.inputHash !== previous.inputHash) throw new Error(`Baseline input changed for ${item.id}; record a new baseline.`);
    if (item.status !== 'completed' || previous.status !== 'completed') return [];
    if (item.analysis.meta.providerId !== previous.analysis.meta.providerId || item.analysis.meta.model !== previous.analysis.meta.model) throw new Error(`Baseline auditor/model changed for ${item.id}; numeric comparisons are unavailable.`);
    const before = previous.analysis.result; const after = item.analysis.result;
    const oldKeys = new Set(eligible(before).map(findingKey)); const newKeys = new Set(eligible(after).map(findingKey));
    const oldClaims = claims(before);
    return [{ id: item.id,
      scoreChanges: CATEGORY_REGISTRY.flatMap(category => before.assessments[category.id].status === 'assessed' && after.assessments[category.id].status === 'assessed'
        && before.assessments[category.id].method === after.assessments[category.id].method && before.scores[category.id] !== after.scores[category.id]
        ? [{ categoryId: category.id, from: before.scores[category.id], to: after.scores[category.id],
          riskIncrease: (after.scores[category.id] - before.scores[category.id]) * (category.kind === 'quality' ? -1 : 1) }] : []),
      stateChanges: SCORE_KEYS.flatMap(id => before.assessments[id].status !== after.assessments[id].status
        ? [{ categoryId: id, from: before.assessments[id].status, to: after.assessments[id].status }] : []),
      coverageLost: SCORE_KEYS.filter(id => before.assessments[id].status === 'assessed' && ['not_assessed', 'insufficient_context'].includes(after.assessments[id].status)),
      incomparableScores: SCORE_KEYS.filter(id => before.assessments[id].status === 'assessed' && after.assessments[id].status === 'assessed'
        && before.assessments[id].method !== after.assessments[id].method),
      newFindings: eligible(after).filter(finding => !oldKeys.has(findingKey(finding))),
      resolvedFindings: eligible(before).filter(finding => !newKeys.has(findingKey(finding)) && after.assessments[findingCategory(finding)]?.status === 'assessed'),
      newAnthropomorphismClaims: [...claims(after)].filter(key => !oldClaims.has(key)).length,
      versions: { baselinePrompt: previous.analysis.provenance?.promptVersion ?? null, currentPrompt: item.analysis.provenance?.promptVersion ?? null,
        baselineRules: previous.analysis.provenance?.localRuleVersion ?? null, currentRules: item.analysis.provenance?.localRuleVersion ?? null },
    }];
  });
}

export function checkAuditConditions(audits: CliAudit[], config: AuditConditionConfig, differences: BaselineDifference[]): ConditionViolation[] {
  const violations: ConditionViolation[] = [];
  const add = (id: string, condition: string, detail: string) => violations.push({ id, condition, detail });
  const rank = { low: 1, medium: 2, high: 3 };
  for (const audit of audits) {
    if (audit.status !== 'completed') continue;
    const result = audit.analysis.result; const fail = config.failOn ?? {};
    for (const finding of eligible(result)) if (fail.minSeverity && rank[finding.severity] >= rank[fail.minSeverity]
      && (!fail.categories || fail.categories.includes(findingCategory(finding)))) add(audit.id, 'severity', `${finding.category}: ${finding.severity}`);
    for (const [id, limit] of Object.entries(fail.scoreAtOrAbove ?? {})) if (result.assessments[id].status === 'assessed' && result.scores[id] >= limit) add(audit.id, 'risk_index', `${id}: ${result.scores[id]} >= ${limit}`);
    for (const [id, limit] of Object.entries(fail.qualityBelow ?? {})) if (result.assessments[id].status === 'assessed' && result.scores[id] < limit) add(audit.id, 'quality_index', `${id}: ${result.scores[id]} < ${limit}`);
    for (const id of fail.requiredAssessments ?? []) if (result.assessments[id].status !== 'assessed') add(audit.id, 'required_assessment', `${id}: ${result.assessments[id].status}`);
    if (fail.anthropomorphism && (claims(result).size || result.anthropomorphismGuard?.blockedFields.length)) add(audit.id, 'anthropomorphism', 'Flagged source claims or withheld auditor prose.');
    if (fail.unverifiedFindings && result.findings.some(finding => finding.evidence?.verification !== 'verified')) add(audit.id, 'unverified_finding', 'Some reported quotations are unverified.');
  }
  for (const difference of differences) {
    const limits = config.baseline ?? {};
    if (limits.newFindings && difference.newFindings.length) add(difference.id, 'new_findings', `${difference.newFindings.length} new supported passages.`);
    if (limits.coverageLoss && difference.coverageLost.length) add(difference.id, 'coverage_loss', difference.coverageLost.join(', '));
    if (limits.newAnthropomorphismClaims && difference.newAnthropomorphismClaims) add(difference.id, 'new_anthropomorphism', `${difference.newAnthropomorphismClaims} new claims.`);
    if (limits.maxRiskIncrease !== undefined) for (const change of difference.scoreChanges) if (change.riskIncrease > limits.maxRiskIncrease) add(difference.id, 'risk_increase', `${change.categoryId}: adverse index change ${change.riskIncrease}`);
    if (limits.maxRiskIncrease !== undefined && difference.incomparableScores.length) add(difference.id, 'unavailable_comparison', `Assessment methods changed: ${difference.incomparableScores.join(', ')}`);
  }
  return violations;
}
