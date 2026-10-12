import type { AnalysisResult } from './analysis';
import type { AnalysisSource, AnalyzeToneOutput } from './provider';
import type { ScoreId } from '../constants';

export interface AuditInput { id: string; text: string; sourceModel: AnalysisSource; originalPrompt: string }
export type CliAudit = { id: string; inputHash: string; sourceModel: AnalysisSource } & (
  | { status: 'completed'; analysis: AnalyzeToneOutput }
  | { status: 'failed'; error: string }
);
export interface AuditConditionConfig {
  schemaVersion: '1.0.0';
  failOn?: {
    minSeverity?: 'low' | 'medium' | 'high'; categories?: ScoreId[];
    scoreAtOrAbove?: Partial<Record<ScoreId, number>>; qualityBelow?: Partial<Record<ScoreId, number>>;
    anthropomorphism?: boolean; unverifiedFindings?: boolean; requiredAssessments?: ScoreId[];
  };
  baseline?: {
    newFindings?: boolean; maxRiskIncrease?: number; coverageLoss?: boolean; newAnthropomorphismClaims?: boolean;
  };
}
export interface BaselineDifference {
  id: string;
  scoreChanges: { categoryId: ScoreId; from: number; to: number; riskIncrease: number }[];
  stateChanges: { categoryId: ScoreId; from: string; to: string }[];
  coverageLost: ScoreId[];
  incomparableScores: ScoreId[];
  newFindings: AnalysisResult['findings']; resolvedFindings: AnalysisResult['findings'];
  newAnthropomorphismClaims: number;
  versions: { baselinePrompt: string | null; currentPrompt: string | null; baselineRules: string | null; currentRules: string | null };
}
export interface ConditionViolation { id: string; condition: string; detail: string }
export interface CliAuditReport {
  schemaVersion: '1.0.0'; guardVersion: string; generatedAt: string;
  audits: CliAudit[]; baselineComparison: BaselineDifference[]; violations: ConditionViolation[];
}
