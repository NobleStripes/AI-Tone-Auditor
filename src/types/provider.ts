import { AnalysisResult } from './analysis';
import type { AnalysisProvenance } from './provenance';

export const PROVIDER_IDS = ['openai', 'anthropic', 'gemini', 'grok', 'local'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
export const ANALYSIS_SOURCES = ['unknown', 'chatgpt', 'claude', 'gemini', 'grok', 'other'] as const;
export type AnalysisSource = typeof ANALYSIS_SOURCES[number];
export const SOURCE_MODEL_LABELS: Record<AnalysisSource, string> = {
  unknown: 'Unknown / model-agnostic',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  other: 'Other',
};

export interface ProviderContext {
  promptVersion: string;
  sourceModel?: AnalysisSource;
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

export const DEFAULT_LOCAL_RUNTIME_META: ProviderRuntimeMeta = {
  providerId: 'local',
  providerLabel: 'Local Heuristic',
  model: 'rules-v1',
  usedFallback: false,
};

export interface AnalyzeToneOutput {
  result: AnalysisResult;
  meta: ProviderRuntimeMeta;
  provenance?: AnalysisProvenance;
}

export interface AIProvider {
  id: ProviderId;
  label: string;
  model: string;
  analyzeTone(input: AnalyzeToneInput): Promise<AnalysisResult>;
}
