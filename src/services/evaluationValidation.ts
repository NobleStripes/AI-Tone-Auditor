import { SCORE_KEYS, type ScoreId } from '../constants';
import { ASSESSMENT_STATES } from '../types/diagnostics';
import { ANALYSIS_SOURCES, type AnalysisSource } from '../types/provider';
import { COMPARISON_SOURCES, MAX_ORIGINAL_PROMPT_LENGTH, MAX_RESPONSE_LENGTH } from '../types/comparison';
import { classifyOutcome } from './evaluationConventions';
import type { FailureLedger, FailureRecord, HumanExpectation, ObservedDiagnostic, RealWorldCase, RealWorldDataset, RecordedAudit, SyntheticDataset } from '../types/evaluation';

type InputHasher = (source: AnalysisSource, model: string | null, prompt: string, response: string, expectation: HumanExpectation) => string;

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

function diagnostic(value: unknown, path: string): ObservedDiagnostic {
  const raw = object(value, path);
  fields(raw, ['status', 'score', 'categoryId', 'inputHash'], path);
  const status = ASSESSMENT_STATES.find(state => state === raw.status);
  if (!status || typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 100) {
    throw new Error(`${path}: expected a recorded assessment state and an index in [0,100].`);
  }
  return { status, score: raw.score };
}

function expectation(value: unknown, path: string): HumanExpectation {
  const raw = object(value, path);
  fields(raw, ['categoryId', 'intendedSignal', 'note'], path);
  const intendedSignal = (['present', 'absent', 'ambiguous'] as const).find(signal => signal === raw.intendedSignal);
  if (!intendedSignal) throw new Error(`${path}.intendedSignal: expected present, absent or ambiguous.`);
  return { categoryId: category(raw.categoryId, `${path}.categoryId`), intendedSignal, note: text(raw.note, `${path}.note`) };
}

function recordedAudit(value: unknown, fixture: Pick<RealWorldCase, 'expectations' | 'originalPrompt' | 'response' | 'sourceModel' | 'model'>, path: string, hashInput?: InputHasher): RecordedAudit | null {
  if (value === null) return null;
  if (!hashInput) throw new Error(`${path}: baseline fingerprint verification is required; browser exports must use a null baseline.`);
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
    if (!expectation || inputHash !== hashInput(fixture.sourceModel, fixture.model, fixture.originalPrompt, fixture.response, expectation)) {
      throw new Error(`${path}.results[${index}]: input or human expectation no longer matches this baseline. Retain the original and create a new dataset version.`);
    }
    return { categoryId, inputHash, ...diagnostic(item, `${path}.results[${index}]`) };
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
  if (raw.schemaVersion !== '1.0.0') throw new Error('dataset.schemaVersion: unsupported schema version.');
  const cases = array(raw.cases, 'dataset.cases').map((value, index) => {
    const path = `dataset.cases[${index}]`;
    const item = object(value, path);
    fields(item, ['id', 'sourceModel', 'model', 'collectedAt', 'originalPrompt', 'response', 'privacyReview', 'expectations', 'baseline'], path);
    const sourceModel = COMPARISON_SOURCES.find(source => source === item.sourceModel);
    if (!sourceModel) throw new Error(`${path}.sourceModel: expected chatgpt, claude, gemini, grok or other.`);
    const privacy = object(item.privacyReview, `${path}.privacyReview`);
    fields(privacy, ['confirmed', 'note'], `${path}.privacyReview`);
    if (privacy.confirmed !== true) throw new Error(`${path}.privacyReview: manually strip private material and confirm review before evaluation.`);
    if (typeof item.originalPrompt !== 'string' || item.originalPrompt.length > MAX_ORIGINAL_PROMPT_LENGTH) {
      throw new Error(`${path}.originalPrompt: expected text up to ${MAX_ORIGINAL_PROMPT_LENGTH} characters; use an empty string if unavailable.`);
    }
    const expectations = array(item.expectations, `${path}.expectations`).map((value, i) => expectation(value, `${path}.expectations[${i}]`));
    if (!expectations.length) throw new Error(`${path}.expectations: at least one human label is required.`);
    unique(expectations.map(item => item.categoryId), `${path}.expectations`);
    const inputs = {
      sourceModel, model: nullableText(item.model, `${path}.model`),
      originalPrompt: item.originalPrompt, response: text(item.response, `${path}.response`, MAX_RESPONSE_LENGTH), expectations,
    };
    return {
      id: text(item.id, `${path}.id`, 128),
      ...inputs,
      collectedAt: item.collectedAt === null ? null : date(item.collectedAt, `${path}.collectedAt`),
      privacyReview: { confirmed: true as const, note: text(privacy.note, `${path}.privacyReview.note`) },
      baseline: recordedAudit(item.baseline, inputs, `${path}.baseline`, hashInput),
    };
  });
  unique(cases.map(item => item.id), 'dataset.cases');
  return { schemaVersion: '1.0.0', version: text(raw.version, 'dataset.version', 128), cases };
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
