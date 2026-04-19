import type { AnalysisResult } from '../types/analysis';
import type { AnalyzeToneOutput, ProviderRuntimeMeta } from '../types/provider';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { resolveFallbackProvider, resolveProvider } from './providers/factory';

let lastRuntimeMeta: ProviderRuntimeMeta = {
  providerId: 'gemini',
  providerLabel: 'Google Gemini',
  model: 'gemini-3-flash-preview',
  usedFallback: false,
};

function buildMeta(providerId: ProviderRuntimeMeta['providerId'], providerLabel: string, model: string, usedFallback: boolean): ProviderRuntimeMeta {
  return {
    providerId,
    providerLabel,
    model,
    usedFallback,
  };
}

export function getLastAnalysisRuntimeMeta(): ProviderRuntimeMeta {
  return lastRuntimeMeta;
}

export async function analyzeTone(text: string): Promise<AnalyzeToneOutput> {
  const selectedProviderId = process.env.AI_PROVIDER;
  const primaryProvider = resolveProvider(selectedProviderId);
  const fallbackProvider = resolveFallbackProvider(primaryProvider.id);

  try {
    const result: AnalysisResult = await primaryProvider.analyzeTone({
      text,
      context: {
        promptVersion: ANALYSIS_PROMPT_VERSION,
      },
    });

    const meta = buildMeta(primaryProvider.id, primaryProvider.label, primaryProvider.model, false);
    lastRuntimeMeta = meta;

    return { result, meta };
  } catch (primaryError) {
    console.warn(`Primary provider ${primaryProvider.id} failed, attempting fallback`, primaryError);

    const result = await fallbackProvider.analyzeTone({
      text,
      context: {
        promptVersion: ANALYSIS_PROMPT_VERSION,
      },
    });

    const meta = buildMeta(fallbackProvider.id, fallbackProvider.label, fallbackProvider.model, true);
    lastRuntimeMeta = meta;

    return { result, meta };
  }
}
