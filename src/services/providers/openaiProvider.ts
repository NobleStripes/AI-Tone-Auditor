import { buildToneAnalysisPrompt } from '../promptBuilder';
import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

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
    const reason = payload.incomplete_details?.reason || 'unknown reason';
    throw new Error(`OpenAI response was incomplete: ${reason}`);
  }

  if (payload.status !== 'completed') {
    throw new Error(`OpenAI response ended with status ${payload.status || 'unknown'}`);
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
  model: getOpenAIModel(),
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY for OpenAI provider');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getOpenAIModel(),
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
      throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as OpenAIResponse;
    const content = readResponseContent(payload);

    try {
      const parsed = extractJsonFromContent(content);
      return validateAnalysisResult(parsed);
    } catch (error) {
      console.error('Failed to parse OpenAI analysis result', error);
      throw new Error('OpenAI provider failed to return valid analysis data');
    }
  },
};
