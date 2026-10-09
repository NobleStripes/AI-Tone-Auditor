import type { ScoreId } from '../constants';

export type ExclusionReason = 'fenced_code' | 'inline_code' | 'blockquote' | 'illustrative_example';

export interface Evidence {
  kind?: 'quotation' | 'response_scope';
  startOffset?: number;
  endOffset?: number;
  matchedText: string;
  verification: 'verified' | 'unverified' | 'unrecorded';
  eligibility: 'included' | 'excluded';
  reason?: string;
  exclusionReason?: ExclusionReason;
}

export interface Occurrence {
  id: string;
  ruleId: string;
  scoreId: ScoreId;
  category: string;
  explanation: string;
  weight: number;
  evidence: Evidence;
}

export interface ContextRange {
  startOffset: number;
  endOffset: number;
  reason: ExclusionReason;
}
