import { AnalysisResult } from './analysis';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'local';

export interface ProviderContext {
  promptVersion: string;
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
