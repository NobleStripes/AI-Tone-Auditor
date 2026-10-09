import type { ScoreId } from '../constants';
import type { AnalysisSource } from './provider';
import type { Evidence } from './evidence';

export const FEEDBACK_KINDS = ['supported', 'false_positive', 'ambiguous', 'wrong_category', 'missed_signal'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  supported: 'Supported', false_positive: 'False positive', ambiguous: 'Ambiguous',
  wrong_category: 'Wrong category', missed_signal: 'Missed signal',
};

export interface AuditSnapshot {
  auditId: string;
  historyId?: string;
  response: string;
  sourceModel: AnalysisSource;
  automatedResultJson: string;
  provenanceJson: string | null;
  runtimeMetaJson: string | null;
}

export interface FeedbackReport {
  id: string;
  auditId: string;
  targetId: string;
  kind: FeedbackKind;
  categoryId: ScoreId;
  intendedCategoryId?: ScoreId;
  note: string;
  passage?: Evidence;
  createdAt: string;
  updatedAt: string;
}

export interface ExportReceipt {
  auditId: string;
  caseId: string;
  version: string;
  origin: 'synthetic' | 'real_world';
  reportIds: string[];
  exportedAt: string;
  contentHash: string;
}

export interface FeedbackStore {
  schemaVersion: '1.0.0';
  audits: AuditSnapshot[];
  reports: FeedbackReport[];
  receipts: ExportReceipt[];
}
