import type { Evidence } from './evidence';

export interface AnthropomorphismClaim {
  ruleId: string;
  disposition: 'flagged' | 'context_only';
  reason: string;
  evidence: Evidence;
}

export interface AnthropomorphismGuard {
  version: string;
  sourceVersion: string | null;
  sourceChecked: boolean;
  fictionContext: boolean;
  sourceClaims: AnthropomorphismClaim[];
  blockedFields: string[];
}
