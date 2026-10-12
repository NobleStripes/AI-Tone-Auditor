import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateProviderAnalysisResult } from '../validation/providerAnalysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';
import { ProviderHttpError, requireApiKey } from './providerErrors';
import { providerLimits } from '../apiPolicy';
import { providerSignal, reserveProviderRequest } from './providerBudget';

interface GrokResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
}

function getGrokModel(): string {
  return process.env.GROK_MODEL || 'grok-4.7';
}

function readOutputText(payload: GrokResponse): string {
  if (payload.status === 'incomplete') {
    throw new Error('Grok response was incomplete.');
  }
  if (payload.status !== 'completed') {
    throw new Error('Grok response did not complete.');
  }

  const text: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== 'message') {
      continue;
    }

    for (const block of item.content ?? []) {
      if (block.type === 'refusal') {
        throw new Error('Grok refused the tone analysis request');
      }
      if (block.type === 'output_text' && typeof block.text === 'string') {
        text.push(block.text);
      }
    }
  }

  const outputText = text.join('\n').trim();
  if (!outputText) {
    throw new Error('Grok response returned no output text');
  }
  return outputText;
}

export const grokProvider: AIProvider = {
  id: 'grok',
  label: 'Grok (xAI)',
  get model() { return getGrokModel(); },
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = requireApiKey('XAI_API_KEY', 'Grok');

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      redirect: 'error',
      signal: providerSignal(input.signal),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: reserveProviderRequest(JSON.stringify({
        model: getGrokModel(),
        max_output_tokens: providerLimits().outputTokens,
        store: false,
        instructions: 'You are a tone analysis engine. Return only data matching the supplied JSON Schema.',
        input: buildToneAnalysisPrompt(input.text, input.context.sourceModel),
        text: {
          format: {
            type: 'json_schema',
            name: 'tone_analysis',
            strict: true,
            schema: ANALYSIS_RESULT_JSON_SCHEMA,
          },
        },
      }), input.signal),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderHttpError('Grok', 'XAI_API_KEY', response.status, errorText);
    }

    const payload = (await response.json()) as GrokResponse;
    try {
      return validateProviderAnalysisResult(JSON.parse(readOutputText(payload)), input.text);
    } catch {
      console.error('[provider] invalid analysis data', { provider: 'grok' });
      throw new Error('Grok provider failed to return valid analysis data');
    }
  },
};
