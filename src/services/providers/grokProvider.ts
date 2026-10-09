import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';
import { ProviderHttpError, requireApiKey } from './providerErrors';

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
    throw new Error(`Grok response was incomplete: ${payload.incomplete_details?.reason || 'unknown reason'}`);
  }
  if (payload.status !== 'completed') {
    throw new Error(`Grok response ended with status ${payload.status || 'unknown'}`);
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getGrokModel(),
        max_output_tokens: 3000,
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderHttpError('Grok', 'XAI_API_KEY', response.status, errorText, apiKey);
    }

    const payload = (await response.json()) as GrokResponse;
    try {
      return validateAnalysisResult(JSON.parse(readOutputText(payload)), { assessmentMethod: 'semantic', responseText: input.text });
    } catch (error) {
      console.error('Failed to parse Grok analysis result', error);
      throw new Error('Grok provider failed to return valid analysis data');
    }
  },
};