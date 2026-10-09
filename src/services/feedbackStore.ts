import { SCORE_KEYS } from '../constants';
import { ANALYSIS_SOURCES } from '../types/provider';
import { FEEDBACK_KINDS, type AuditSnapshot, type FeedbackReport, type FeedbackStore } from '../types/feedback';
import type { Evidence } from '../types/evidence';
import type { Finding } from '../types/analysis';
import { normalizeFindingCategory } from './validation/analysisValidator';

export const FEEDBACK_STORAGE_KEY = 'audit-feedback-v1';
export const emptyFeedbackStore = (): FeedbackStore => ({ schemaVersion: '1.0.0', audits: [], reports: [], receipts: [] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const timestamp = (value: unknown): value is string => nonempty(value) && Number.isFinite(Date.parse(value));

export function findingTargetId(snapshot: AuditSnapshot, findings: readonly Finding[], displayIndex: number): string | null {
  const original: unknown = JSON.parse(snapshot.automatedResultJson);
  if (!object(original) || !Array.isArray(original.findings)) return null;
  const finding = findings[displayIndex];
  const matches = (candidate: unknown) => object(candidate)
    && normalizeFindingCategory(candidate.category) === finding.category && candidate.text === finding.text;
  const ordinal = findings.slice(0, displayIndex).filter(item => item.category === finding.category && item.text === finding.text).length;
  const indices = original.findings.flatMap((candidate, index) => matches(candidate) ? [index] : []);
  return indices[ordinal] === undefined ? null : `finding:${indices[ordinal]}`;
}

export function checkedPassage(response: string, startOffset: number, endOffset: number): Evidence {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0
    || endOffset <= startOffset || endOffset > response.length || !response.slice(startOffset, endOffset).trim()) {
    throw new Error('Select a nonempty passage within this audited response.');
  }
  return { startOffset, endOffset, matchedText: response.slice(startOffset, endOffset),
    verification: 'verified', eligibility: 'included', kind: 'quotation' };
}

function isPassage(value: unknown): value is Evidence {
  return object(value) && typeof value.matchedText === 'string'
    && ['verified', 'unverified', 'unrecorded'].includes(String(value.verification))
    && ['included', 'excluded'].includes(String(value.eligibility))
    && (value.startOffset === undefined || Number.isInteger(value.startOffset))
    && (value.endOffset === undefined || Number.isInteger(value.endOffset));
}

function isSnapshot(value: unknown): value is AuditSnapshot {
  if (!object(value) || !nonempty(value.auditId) || typeof value.response !== 'string'
    || !ANALYSIS_SOURCES.some(source => source === value.sourceModel)
    || (value.historyId !== undefined && !nonempty(value.historyId))
    || typeof value.automatedResultJson !== 'string'
    || (value.provenanceJson !== null && typeof value.provenanceJson !== 'string')
    || (value.runtimeMetaJson !== null && typeof value.runtimeMetaJson !== 'string')) return false;
  const result: unknown = JSON.parse(value.automatedResultJson);
  const provenance: unknown = typeof value.provenanceJson === 'string' ? JSON.parse(value.provenanceJson) : null;
  const meta: unknown = typeof value.runtimeMetaJson === 'string' ? JSON.parse(value.runtimeMetaJson) : null;
  return object(result) && object(result.scores) && Array.isArray(result.findings) && (provenance === null || object(provenance))
    && (meta === null || object(meta))
    && Object.keys(value).every(key => ['auditId', 'historyId', 'response', 'sourceModel', 'automatedResultJson', 'provenanceJson', 'runtimeMetaJson'].includes(key));
}

function isReport(value: unknown): value is FeedbackReport {
  return object(value) && nonempty(value.id) && nonempty(value.auditId) && nonempty(value.targetId)
    && FEEDBACK_KINDS.some(kind => kind === value.kind) && SCORE_KEYS.some(id => id === value.categoryId)
    && (value.intendedCategoryId === undefined || SCORE_KEYS.some(id => id === value.intendedCategoryId))
    && (value.kind !== 'wrong_category' || (value.intendedCategoryId !== undefined && value.categoryId !== value.intendedCategoryId))
    && nonempty(value.note) && value.note.length <= 5000 && timestamp(value.createdAt) && timestamp(value.updatedAt)
    && (value.passage === undefined || isPassage(value.passage))
    && Object.keys(value).every(key => ['id', 'auditId', 'targetId', 'kind', 'categoryId', 'intendedCategoryId', 'note', 'passage', 'createdAt', 'updatedAt'].includes(key));
}

export function parseFeedbackStore(stored: string | null): FeedbackStore {
  if (stored === null) return emptyFeedbackStore();
  const raw: unknown = JSON.parse(stored);
  if (!object(raw) || raw.schemaVersion !== '1.0.0' || !Array.isArray(raw.audits) || !raw.audits.every(isSnapshot)
    || !Array.isArray(raw.reports) || !raw.reports.every(isReport) || !Array.isArray(raw.receipts)
    || Object.keys(raw).some(key => !['schemaVersion', 'audits', 'reports', 'receipts'].includes(key))) {
    throw new Error('Saved feedback is invalid. Clear feedback explicitly to recover; it has not been overwritten.');
  }
  const audits = raw.audits;
  const reports = raw.reports;
  if (new Set(audits.map(audit => audit.auditId)).size !== audits.length
    || new Set(reports.map(report => report.id)).size !== reports.length
    || new Set(reports.map(report => `${report.auditId}:${report.targetId}`)).size !== reports.length) {
    throw new Error('Saved feedback contains duplicate references.');
  }
  for (const report of reports) {
    const audit = audits.find(audit => audit.auditId === report.auditId);
    if (!audit) throw new Error('Saved feedback references a missing automated snapshot.');
    if (report.passage?.verification === 'verified') {
      const passage = checkedPassage(audit.response, report.passage.startOffset, report.passage.endOffset);
      if (passage.matchedText !== report.passage.matchedText) throw new Error('Saved feedback passage no longer matches its original response.');
    }
    if (report.kind === 'missed_signal' && report.passage?.verification !== 'verified') {
      throw new Error('Missed-signal reports require a located source passage.');
    }
  }
  const receipts = raw.receipts.map(value => {
    if (!object(value) || !nonempty(value.auditId) || !audits.some(audit => audit.auditId === value.auditId)
      || !nonempty(value.caseId) || !nonempty(value.version) || !['synthetic', 'real_world'].includes(String(value.origin))
      || !timestamp(value.exportedAt) || !Array.isArray(value.reportIds) || !value.reportIds.every(nonempty)
      || typeof value.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentHash)
      || Object.keys(value).some(key => !['auditId', 'caseId', 'version', 'origin', 'reportIds', 'exportedAt', 'contentHash'].includes(key))) {
      throw new Error('Saved evaluation export receipt is invalid.');
    }
    return { auditId: value.auditId, caseId: value.caseId, version: value.version,
      origin: value.origin === 'synthetic' ? 'synthetic' as const : 'real_world' as const,
      exportedAt: value.exportedAt, reportIds: value.reportIds, contentHash: value.contentHash };
  });
  return { schemaVersion: '1.0.0', audits, reports, receipts };
}

export function saveFeedbackReport(store: FeedbackStore, snapshot: AuditSnapshot, report: FeedbackReport): FeedbackStore {
  if (report.auditId !== snapshot.auditId) throw new Error('Feedback audit reference does not match its automated snapshot.');
  const existing = store.audits.find(audit => audit.auditId === snapshot.auditId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(snapshot)) {
    throw new Error('This audit reference already belongs to a different snapshot. Run a new audit before reporting.');
  }
  const next: FeedbackStore = {
    ...store,
    audits: existing ? store.audits : [...store.audits, structuredClone(snapshot)],
    reports: [...store.reports.filter(item => !(item.auditId === report.auditId && item.targetId === report.targetId)), report],
  };
  return parseFeedbackStore(JSON.stringify(next));
}

export function removeHistoryFeedback(store: FeedbackStore, historyIds: readonly string[]): FeedbackStore {
  const removed = new Set(store.audits.filter(audit => audit.historyId && historyIds.includes(audit.historyId)).map(audit => audit.auditId));
  return { ...store, audits: store.audits.filter(audit => !removed.has(audit.auditId)),
    reports: store.reports.filter(report => !removed.has(report.auditId)), receipts: store.receipts.filter(receipt => !removed.has(receipt.auditId)) };
}
