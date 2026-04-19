import type { AIProvider, ProviderId } from '../../types/provider';
import { geminiProvider } from './geminiProvider';
import { localHeuristicProvider } from './localHeuristicProvider';
import { openaiProvider } from './openaiProvider';

const providers: Record<ProviderId, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  local: localHeuristicProvider,
};

function normalizeProviderId(value: string | undefined): ProviderId | undefined {
  if (value === 'gemini' || value === 'openai' || value === 'local') {
    return value;
  }

  return undefined;
}

export function resolveProvider(providerId?: string): AIProvider {
  const resolvedId = normalizeProviderId(providerId) || 'gemini';
  return providers[resolvedId];
}

export function resolveFallbackProvider(primaryProviderId: ProviderId): AIProvider {
  const envFallback = normalizeProviderId(process.env.AI_FALLBACK_PROVIDER);
  if (envFallback && envFallback !== primaryProviderId) {
    return providers[envFallback];
  }

  if (primaryProviderId === 'gemini') {
    return providers.openai;
  }

  if (primaryProviderId === 'openai') {
    return providers.gemini;
  }

  return providers.gemini;
}
