import type { AIProvider, ProviderId } from '../../types/provider';
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

function normalizeProviderId(value: string | undefined): ProviderId | undefined {
  if (value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'grok' || value === 'local') {
    return value;
  }

  return undefined;
}

export function resolveProvider(providerId?: string): AIProvider {
  const resolvedId = normalizeProviderId(providerId) || 'openai';
  return providers[resolvedId];
}

export function resolveFallbackProvider(primaryProviderId: ProviderId): AIProvider {
  const envFallback = normalizeProviderId(process.env.AI_FALLBACK_PROVIDER);
  if (envFallback && envFallback !== primaryProviderId) {
    return providers[envFallback];
  }

  if (primaryProviderId === 'openai') {
    return providers.anthropic;
  }

  if (primaryProviderId === 'anthropic') {
    return providers.openai;
  }

  if (primaryProviderId === 'gemini' || primaryProviderId === 'grok') {
    return providers.openai;
  }

  return providers.openai;
}
