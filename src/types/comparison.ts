import type { AnalyzeToneOutput } from './provider';

export const COMPARISON_SOURCES = ['chatgpt', 'claude', 'gemini', 'grok', 'other'] as const;
export type ComparisonSource = typeof COMPARISON_SOURCES[number];
export const MIN_COMPARISON_RESPONSES = 2;
export const MAX_COMPARISON_RESPONSES = 5;
export const MIN_RESPONSE_LENGTH = 10;
export const MAX_RESPONSE_LENGTH = 50_000;
export const MAX_ORIGINAL_PROMPT_LENGTH = 5_000;

export interface ComparisonResponse {
  id: string;
  sourceModel: ComparisonSource;
  text: string;
}

export interface ComparisonRequest {
  originalPrompt: string;
  responses: ComparisonResponse[];
}

export type ComparisonItem = ComparisonResponse & (
  | { status: 'completed'; analysis: AnalyzeToneOutput }
  | { status: 'failed'; error: string }
);

export interface ComparisonResult {
  sessionId?: string;
  auditorVersion?: string;
  startedAt?: string;
  completedAt?: string;
  rubricVersion: string;
  localRuleVersion: string;
  items: ComparisonItem[];
}
