import { buildToneAnalysisPrompt } from '../promptBuilder';
import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { validateProviderAnalysisResult } from '../validation/providerAnalysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';
import { ProviderHttpError, requireApiKey } from './providerErrors';
import { providerLimits } from '../apiPolicy';
import { providerSignal, reserveProviderRequest } from './providerBudget';

interface OpenAIResponse {
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

function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-6-luna';
}

function extractJsonFromContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('OpenAI response did not contain parseable JSON.');
  }
}

function readResponseContent(payload: OpenAIResponse): string {
  if (payload.status === 'incomplete') {
    throw new Error('OpenAI response was incomplete.');
  }

  if (payload.status !== 'completed') {
    throw new Error('OpenAI response did not complete.');
  }

  const text: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== 'message') {
      continue;
    }

    for (const block of item.content ?? []) {
      if (block.type === 'refusal') {
        throw new Error('OpenAI refused the tone analysis request');
      }
      if (block.type === 'output_text' && typeof block.text === 'string') {
        text.push(block.text);
      }
    }
  }

  const content = text.join('\n').trim();
  if (!content) {
    throw new Error('OpenAI response returned no output text');
  }
  return content;
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  label: 'OpenAI',
  get model() { return getOpenAIModel(); },
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = requireApiKey('OPENAI_API_KEY', 'OpenAI');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      redirect: 'error',
      signal: providerSignal(input.signal),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: reserveProviderRequest(JSON.stringify({
        model: getOpenAIModel(),
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
      throw new ProviderHttpError('OpenAI', 'OPENAI_API_KEY', response.status, errorText);
    }

    const payload = (await response.json()) as OpenAIResponse;
    const content = readResponseContent(payload);

    try {
      const parsed = extractJsonFromContent(content);
      return validateProviderAnalysisResult(parsed, input.text);
    } catch {
      console.error('[provider] invalid analysis data', { provider: 'openai' });
      throw new Error('OpenAI provider failed to return valid analysis data');
    }
  },
};
