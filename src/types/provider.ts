import { AnalysisResult } from './analysis';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'grok' | 'local';
export const ANALYSIS_SOURCES = ['unknown', 'chatgpt', 'claude', 'gemini', 'grok', 'other'] as const;
export type AnalysisSource = typeof ANALYSIS_SOURCES[number];

export interface ProviderContext {
  promptVersion: string;
  sourceModel?: AnalysisSource;
  auditContext?: string;
}

export interface AnalyzeToneInput {
  text: string;
  context: ProviderContext;
}

export interface ProviderRuntimeMeta {
  providerId: ProviderId;
  providerLabel: string;
  model: string;
  usedFallback: boolean;
}

export interface AnalyzeToneOutput {
  result: AnalysisResult;
  meta: ProviderRuntimeMeta;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  model: string;
  analyzeTone(input: AnalyzeToneInput): Promise<AnalysisResult>;
}
