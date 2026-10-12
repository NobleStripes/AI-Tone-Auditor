import { SCORE_KEYS, type ScoreId } from '../constants';
import { ASSESSMENT_STATES } from '../types/diagnostics';
import { ANALYSIS_SOURCES, type AnalysisSource } from '../types/provider';
import { COMPARISON_SOURCES, MAX_ORIGINAL_PROMPT_LENGTH, MAX_RESPONSE_LENGTH } from '../types/comparison';
import { classifyOutcome, evaluationPartition } from './evaluationConventions';
import { EVALUATION_EXCLUSION_REASONS, passageKey } from './evaluationEvidence';
import type { CaseSplit, EvidenceExpectation, EvidencePassage, ExcludedPassage, FailureLedger, FailureRecord, HumanExpectation, ObservedDiagnostic, ObservedEvidence, RealWorldCase, RealWorldDataset, RecordedAudit, SyntheticDataset } from '../types/evaluation';

type InputHasher = (source: AnalysisSource, model: string | null, prompt: string, response: string, expectation: HumanExpectation,
  partition?: { split?: CaseSplit; pairId?: string }) => string;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected an object.`);
  return value as Record<string, unknown>;
}

function fields(raw: Record<string, unknown>, names: readonly string[], path: string) {
  if (Object.keys(raw).some(key => !names.includes(key))) throw new Error(`${path}: unexpected field; remove private/extraneous metadata.`);
}

function text(value: unknown, path: string, max = 5_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${path}: expected nonempty text up to ${max} characters.`);
  return value;
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function date(value: unknown, path: string): string {
  const result = text(value, path, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(result)
    || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().replace('.000Z', 'Z') !== result.replace('.000Z', 'Z')) {
    throw new Error(`${path}: expected a valid UTC ISO timestamp.`);
  }
  return result;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array.`);
  return value;
}

function unique(values: readonly string[], path: string) {
  if (new Set(values).size !== values.length) throw new Error(`${path}: duplicate IDs.`);
}

function category(value: unknown, path: string): ScoreId {
  const id = SCORE_KEYS.find(id => id === value);
  if (!id) throw new Error(`${path}: unknown category ID.`);
  return id;
}

function diagnostic(value: unknown, path: string, extended = false): ObservedDiagnostic {
  const raw = object(value, path);
  fields(raw, ['status', 'score', 'categoryId', 'inputHash', ...(extended ? ['evidence'] : [])], path);
  const status = ASSESSMENT_STATES.find(state => state === raw.status);
  if (!status || typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 100) {
    throw new Error(`${path}: expected a recorded assessment state and an index in [0,100].`);
  }
  return { status, score: raw.score };
}

function passage(value: unknown, response: string, path: string, excluded = false): EvidencePassage | ExcludedPassage {
  const raw = object(value, path);
  fields(raw, ['startOffset', 'endOffset', 'matchedText', 'kind', ...(excluded ? ['exclusionReason'] : [])], path);
  if (typeof raw.startOffset !== 'number' || typeof raw.endOffset !== 'number'
    || !Number.isInteger(raw.startOffset) || !Number.isInteger(raw.endOffset)
    || raw.startOffset < 0 || raw.endOffset <= raw.startOffset || raw.endOffset > response.length
    || typeof raw.matchedText !== 'string' || !raw.matchedText.trim()
    || response.slice(raw.startOffset, raw.endOffset) !== raw.matchedText) {
    throw new Error(`${path}: offsets and matchedText must identify an exact nonempty original-response passage.`);
  }
  if (raw.kind !== undefined && raw.kind !== 'quotation' && raw.kind !== 'response_scope') throw new Error(`${path}.kind: expected quotation or response_scope.`);
  if (raw.kind === 'response_scope' && (excluded || raw.startOffset !== 0 || raw.endOffset !== response.length)) {
    throw new Error(`${path}.kind: response_scope must cover the entire response and cannot be an excluded quotation.`);
  }
  const result: EvidencePassage = { startOffset: raw.startOffset, endOffset: raw.endOffset, matchedText: raw.matchedText,
    ...(raw.kind ? { kind: raw.kind as EvidencePassage['kind'] } : {}) };
  if (!excluded) return result;
  const exclusionReason = EVALUATION_EXCLUSION_REASONS.find(reason => reason === raw.exclusionReason);
  if (!exclusionReason) throw new Error(`${path}.exclusionReason: unknown exclusion reason.`);
  return { ...result, exclusionReason };
}

function evidenceLists(raw: Record<string, unknown>, response: string, path: string): EvidenceExpectation {
  const passages = array(raw.passages, `${path}.passages`).map((item, i) => passage(item, response, `${path}.passages[${i}]`) as EvidencePassage);
  const exclusions = array(raw.exclusions, `${path}.exclusions`).map((item, i) => passage(item, response, `${path}.exclusions[${i}]`, true) as ExcludedPassage);
  unique(passages.map(passageKey), `${path}.passages`);
  unique(exclusions.map(item => `${passageKey(item)}:${item.exclusionReason}`), `${path}.exclusions`);
  return { passages, exclusions };
}

function evidenceExpectation(value: unknown, response: string, path: string): EvidenceExpectation {
  const raw = object(value, path);
  fields(raw, ['passages', 'exclusions'], path);
  const result = evidenceLists(raw, response, path);
  unique(result.exclusions.map(passageKey), `${path}.exclusions`);
  if (result.passages.some(item => item.kind !== 'response_scope' && result.exclusions.some(excluded =>
    item.startOffset < excluded.endOffset && item.endOffset > excluded.startOffset))) {
    throw new Error(`${path}: a quotation cannot be both expected support and excluded wording.`);
  }
  return result;
}

function observedEvidence(value: unknown, response: string, path: string): ObservedEvidence {
  const raw = object(value, path);
  fields(raw, ['passages', 'exclusions', 'invalidRecords'], path);
  if (typeof raw.invalidRecords !== 'number' || !Number.isInteger(raw.invalidRecords) || raw.invalidRecords < 0) {
    throw new Error(`${path}.invalidRecords: expected a nonnegative integer.`);
  }
  return { ...evidenceLists(raw, response, path), invalidRecords: raw.invalidRecords };
}

function expectation(value: unknown, path: string, response: string, extended: boolean): HumanExpectation {
  const raw = object(value, path);
  fields(raw, ['categoryId', 'intendedSignal', 'note', ...(extended ? ['expectedAssessment', 'evidence'] : [])], path);
  const intendedSignal = (['present', 'absent', 'ambiguous'] as const).find(signal => signal === raw.intendedSignal);
  if (!intendedSignal) throw new Error(`${path}.intendedSignal: expected present, absent or ambiguous.`);
  const expectedAssessment = ASSESSMENT_STATES.find(state => state === raw.expectedAssessment);
  if (raw.expectedAssessment !== undefined && !expectedAssessment) throw new Error(`${path}.expectedAssessment: unknown assessment state.`);
  return { categoryId: category(raw.categoryId, `${path}.categoryId`), intendedSignal, note: text(raw.note, `${path}.note`),
    ...(expectedAssessment ? { expectedAssessment } : {}),
    ...(raw.evidence !== undefined ? { evidence: evidenceExpectation(raw.evidence, response, `${path}.evidence`) } : {}) };
}

function recordedAudit(value: unknown, fixture: Pick<RealWorldCase, 'expectations' | 'originalPrompt' | 'response' | 'sourceModel' | 'model' | 'split' | 'pairId'>,
  path: string, extended: boolean, hashInput?: InputHasher): RecordedAudit | null {
  if (value === null) return null;
  if (!hashInput) throw new Error(`${path}: baseline fingerprint verification is required; interactive evaluation cases must use a null baseline.`);
  const raw = object(value, path);
  fields(raw, ['auditorVersion', 'promptVersion', 'localRuleVersion', 'analyzedAt', 'analysisProvider', 'results'], path);
  const provider = object(raw.analysisProvider, `${path}.analysisProvider`);
  fields(provider, ['providerId', 'model'], `${path}.analysisProvider`);
  if (provider.providerId !== 'local') throw new Error(`${path}.analysisProvider: only local-rule baselines are comparable in this evaluation workflow.`);
  const results = array(raw.results, `${path}.results`).map((value, index) => {
    const item = object(value, `${path}.results[${index}]`);
    const categoryId = category(item.categoryId, `${path}.results[${index}].categoryId`);
    const inputHash = text(item.inputHash, `${path}.results[${index}].inputHash`, 64);
    const expectation = fixture.expectations.find(item => item.categoryId === categoryId);
    if (!expectation || inputHash !== hashInput(fixture.sourceModel, fixture.model, fixture.originalPrompt, fixture.response, expectation, evaluationPartition(fixture))) {
      throw new Error(`${path}.results[${index}]: input or human expectation no longer matches this baseline. Retain the original and create a new dataset version.`);
    }
    if (item.evidence !== undefined && !expectation.evidence) throw new Error(`${path}.results[${index}]: evidence baseline has no passage annotations.`);
    return { categoryId, inputHash, ...diagnostic(item, `${path}.results[${index}]`, extended),
      ...(item.evidence !== undefined ? { evidence: observedEvidence(item.evidence, fixture.response, `${path}.results[${index}].evidence`) } : {}) };
  });
  unique(results.map(item => item.categoryId), `${path}.results`);
  if (results.length !== fixture.expectations.length || fixture.expectations.some(item => !results.some(result => result.categoryId === item.categoryId))) {
    throw new Error(`${path}.results: must cover exactly the human-labeled categories.`);
  }
  return {
    auditorVersion: text(raw.auditorVersion, `${path}.auditorVersion`),
    promptVersion: text(raw.promptVersion, `${path}.promptVersion`),
    localRuleVersion: text(raw.localRuleVersion, `${path}.localRuleVersion`),
    analyzedAt: date(raw.analyzedAt, `${path}.analyzedAt`),
    analysisProvider: { providerId: 'local', model: text(provider.model, `${path}.analysisProvider.model`) },
    results,
  };
}

export function parseRealWorldDataset(value: unknown, hashInput?: InputHasher): RealWorldDataset {
  const raw = object(value, 'dataset');
  fields(raw, ['schemaVersion', 'version', 'cases'], 'dataset');
  if (raw.schemaVersion !== '1.0.0' && raw.schemaVersion !== '1.1.0') throw new Error('dataset.schemaVersion: unsupported schema version.');
  const extended = raw.schemaVersion === '1.1.0';
  const cases = array(raw.cases, 'dataset.cases').map((value, index) => {
    const path = `dataset.cases[${index}]`;
    const item = object(value, path);
    fields(item, ['id', 'sourceModel', 'model', 'collectedAt', 'originalPrompt', 'response', 'privacyReview', 'expectations', 'baseline',
      ...(extended ? ['split', 'pairId'] : [])], path);
    const sourceModel = COMPARISON_SOURCES.find(source => source === item.sourceModel);
    if (!sourceModel) throw new Error(`${path}.sourceModel: expected chatgpt, claude, gemini, grok or other.`);
    const privacy = object(item.privacyReview, `${path}.privacyReview`);
    fields(privacy, ['confirmed', 'note'], `${path}.privacyReview`);
    if (privacy.confirmed !== true) throw new Error(`${path}.privacyReview: manually strip private material and confirm review before evaluation.`);
    if (typeof item.originalPrompt !== 'string' || item.originalPrompt.length > MAX_ORIGINAL_PROMPT_LENGTH) {
      throw new Error(`${path}.originalPrompt: expected text up to ${MAX_ORIGINAL_PROMPT_LENGTH} characters; use an empty string if unavailable.`);
    }
    const response = text(item.response, `${path}.response`, MAX_RESPONSE_LENGTH);
    const split = (['development', 'held_out'] as const).find(split => split === item.split);
    if (item.split !== undefined && !split) throw new Error(`${path}.split: expected development or held_out.`);
    const pairId = item.pairId === undefined ? undefined : text(item.pairId, `${path}.pairId`, 128);
    const expectations = array(item.expectations, `${path}.expectations`).map((value, i) => expectation(value, `${path}.expectations[${i}]`, response, extended));
    if (!expectations.length) throw new Error(`${path}.expectations: at least one human label is required.`);
    unique(expectations.map(item => item.categoryId), `${path}.expectations`);
    const inputs = {
      sourceModel, model: nullableText(item.model, `${path}.model`),
      originalPrompt: item.originalPrompt, response, expectations,
      ...(split ? { split } : {}), ...(pairId ? { pairId } : {}),
    };
    return {
      id: text(item.id, `${path}.id`, 128),
      ...inputs,
      collectedAt: item.collectedAt === null ? null : date(item.collectedAt, `${path}.collectedAt`),
      privacyReview: { confirmed: true as const, note: text(privacy.note, `${path}.privacyReview.note`) },
      baseline: recordedAudit(item.baseline, inputs, `${path}.baseline`, extended, hashInput),
    };
  });
  unique(cases.map(item => item.id), 'dataset.cases');
  validateSplitSeparation(cases);
  for (const pairId of new Set(cases.flatMap(item => item.pairId ? [item.pairId] : []))) {
    const pair = cases.filter(item => item.pairId === pairId);
    if (pair.length !== 2 || pair[0].split !== pair[1].split
      || JSON.stringify(pair[0].expectations.map(item => item.categoryId).sort()) !== JSON.stringify(pair[1].expectations.map(item => item.categoryId).sort())) {
      throw new Error('dataset.cases: each pairId must identify exactly two cases in the same split with the same labeled categories.');
    }
  }
  return { schemaVersion: raw.schemaVersion, version: text(raw.version, 'dataset.version', 128), cases };
}

export function validateSplitSeparation(cases: readonly { originalPrompt: string; response: string; split?: CaseSplit }[]): void {
  const normalized = (value: string) => value.normalize('NFKC').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const seen = new Map<string, boolean>();
  for (const fixture of cases) {
    const key = JSON.stringify([normalized(fixture.originalPrompt), normalized(fixture.response)]);
    const heldOut = fixture.split === 'held_out';
    if (seen.has(key) && seen.get(key) !== heldOut) throw new Error('Evaluation split leakage: equivalent prompt/response inputs appear in held_out and non-held-out cases.');
    seen.set(key, heldOut);
  }
}

export function parseSyntheticDataset(value: unknown, hashInput?: InputHasher): SyntheticDataset {
  const raw = object(value, 'dataset');
  fields(raw, ['schemaVersion', 'version', 'cases', 'datasetKind'], 'dataset');
  if (raw.datasetKind !== 'synthetic') throw new Error('dataset.datasetKind: synthetic exports must be explicitly labeled synthetic.');
  const { datasetKind, ...dataset } = raw;
  return { ...parseRealWorldDataset(dataset, hashInput), datasetKind: 'synthetic' };
}

export function parseFailureLedger(value: unknown): FailureLedger {
  const raw = object(value, 'ledger');
  fields(raw, ['schemaVersion', 'recordedAt', 'failures'], 'ledger');
  if (raw.schemaVersion !== '1.0.0') throw new Error('ledger.schemaVersion: unsupported schema version.');
  const failures = array(raw.failures, 'ledger.failures').map((value, index): FailureRecord => {
    const path = `ledger.failures[${index}]`;
    const item = object(value, path);
    fields(item, ['id', 'type', 'datasetKind', 'datasetVersion', 'caseId', 'inputHash', 'sourceModel', 'sourceModelVersion', 'categoryId',
      'auditorVersion', 'localRuleVersion', 'promptVersion', 'analyzedAt', 'analysisProvider', 'expected', 'actual', 'explanation'], path);
    const type = (['false_positive', 'false_negative'] as const).find(type => type === item.type);
    const datasetKind = (['synthetic', 'real_world'] as const).find(kind => kind === item.datasetKind);
    const sourceModel = ANALYSIS_SOURCES.find(source => source === item.sourceModel);
    const expected = object(item.expected, `${path}.expected`);
    fields(expected, ['signal', 'signalThreshold'], `${path}.expected`);
    const signal = (['present', 'absent'] as const).find(signal => signal === expected.signal);
    const provider = object(item.analysisProvider, `${path}.analysisProvider`);
    fields(provider, ['providerId', 'model'], `${path}.analysisProvider`);
    if (!type || !datasetKind || !sourceModel || !signal || provider.providerId !== 'local'
      || typeof expected.signalThreshold !== 'number' || !Number.isFinite(expected.signalThreshold)
      || expected.signalThreshold <= 0 || expected.signalThreshold > 100) throw new Error(`${path}: invalid local failure record.`);
    const actual = diagnostic(item.actual, `${path}.actual`);
    if (classifyOutcome(signal, actual, expected.signalThreshold) !== type) throw new Error(`${path}: actual result does not match the recorded failure type.`);
    const inputHash = text(item.inputHash, `${path}.inputHash`, 64);
    if (!/^[a-f0-9]{64}$/.test(inputHash)) throw new Error(`${path}.inputHash: expected a SHA-256 fingerprint.`);
    return {
      id: text(item.id, `${path}.id`), type, datasetKind,
      datasetVersion: text(item.datasetVersion, `${path}.datasetVersion`),
      caseId: text(item.caseId, `${path}.caseId`),
      inputHash, sourceModel,
      sourceModelVersion: nullableText(item.sourceModelVersion, `${path}.sourceModelVersion`),
      categoryId: category(item.categoryId, `${path}.categoryId`),
      auditorVersion: text(item.auditorVersion, `${path}.auditorVersion`),
      localRuleVersion: text(item.localRuleVersion, `${path}.localRuleVersion`),
      promptVersion: text(item.promptVersion, `${path}.promptVersion`),
      analyzedAt: date(item.analyzedAt, `${path}.analyzedAt`),
      analysisProvider: { providerId: 'local', model: text(provider.model, `${path}.analysisProvider.model`) },
      expected: { signal, signalThreshold: expected.signalThreshold },
      actual,
      explanation: text(item.explanation, `${path}.explanation`),
    };
  });
  unique(failures.map(item => item.id), 'ledger.failures');
  return { schemaVersion: '1.0.0', recordedAt: date(raw.recordedAt, 'ledger.recordedAt'), failures };
}
