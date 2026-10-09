import { buildToneAnalysisPrompt } from '../promptBuilder';
import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';
import { ProviderHttpError, requireApiKey } from './providerErrors';

interface AnthropicResponse {
  stop_reason?: string | null;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Anthropic response did not contain parseable JSON.');
  }
}

function readResponseContent(payload: AnthropicResponse): string {
  if (payload.stop_reason === 'refusal') {
    throw new Error('Anthropic refused the tone analysis request');
  }
  if (payload.stop_reason === 'max_tokens') {
    throw new Error('Anthropic response reached its output token limit');
  }
  if (payload.stop_reason !== 'end_turn') {
    throw new Error(`Anthropic response ended with stop reason ${payload.stop_reason || 'unknown'}`);
  }

  const text = payload.content
    ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n') || '';
  if (!text.trim()) {
    throw new Error('Anthropic response returned no output text');
  }
  return text;
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  get model() { return getAnthropicModel(); },
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = requireApiKey('ANTHROPIC_API_KEY', 'Anthropic');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: getAnthropicModel(),
        max_tokens: 3000,
        system: 'You are a tone analysis engine. Return only data matching the supplied JSON Schema.',
        messages: [
          {
            role: 'user',
            content: buildToneAnalysisPrompt(input.text, input.context.sourceModel),
          },
        ],
        output_config: {
          format: {
            type: 'json_schema',
            schema: ANALYSIS_RESULT_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderHttpError('Anthropic', 'ANTHROPIC_API_KEY', response.status, errorText, apiKey);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = readResponseContent(payload);

    try {
      return validateAnalysisResult(extractJson(text), { assessmentMethod: 'semantic', responseText: input.text });
    } catch (error) {
      console.error('Failed to parse Anthropic analysis result', error);
      throw new Error('Anthropic provider failed to return valid analysis data');
    }
  },
};
