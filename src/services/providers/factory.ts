import { PROVIDER_IDS, type AIProvider, type ProviderId } from '../../types/provider';
import { anthropicProvider } from './anthropicProvider';
import { geminiProvider } from './geminiProvider';
import { grokProvider } from './grokProvider';
import { localHeuristicProvider } from './localHeuristicProvider';
import { openaiProvider } from './openaiProvider';

const providers: Record<ProviderId, AIProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  grok: grokProvider,
  local: localHeuristicProvider,
};

function normalizeProviderId(value: string | undefined, setting: string): ProviderId | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  const id = PROVIDER_IDS.find(id => id === normalized);
  if (!id) throw new Error(`Invalid ${setting}. Supported providers: ${PROVIDER_IDS.join(', ')}.`);
  return id;
}

export function resolveProvider(providerId?: string): AIProvider {
  const resolvedId = normalizeProviderId(providerId, 'AI_PROVIDER') ?? 'local';
  return providers[resolvedId];
}

export function resolveFallbackProvider(primaryProviderId: ProviderId): AIProvider | null {
  const envFallback = normalizeProviderId(process.env.AI_FALLBACK_PROVIDER, 'AI_FALLBACK_PROVIDER');
  if (envFallback && envFallback !== primaryProviderId) {
    return providers[envFallback];
  }

  return null;
}
