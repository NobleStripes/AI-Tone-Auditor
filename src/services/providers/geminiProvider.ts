import { ANALYSIS_RESULT_JSON_SCHEMA } from '../analysisSchema';
import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

interface GeminiInteractionResponse {
  status?: string;
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.8-flash';
}

function readOutputText(payload: GeminiInteractionResponse): string {
  if (payload.status !== 'completed') {
    throw new Error(`Gemini interaction ended with status ${payload.status || 'unknown'}`);
  }

  const text = payload.output_text || [...(payload.steps ?? []), ...(payload.output ?? [])]
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');

  if (!text.trim()) {
    throw new Error('Gemini interaction returned no output text');
  }
  return text;
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  model: getGeminiModel(),
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY for Gemini provider');
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: getGeminiModel(),
        input: buildToneAnalysisPrompt(input.text, input.context.sourceModel),
        system_instruction: 'You are a tone analysis engine. Return only data matching the supplied JSON Schema.',
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: ANALYSIS_RESULT_JSON_SCHEMA,
        },
        store: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as GeminiInteractionResponse;
    try {
      return validateAnalysisResult(JSON.parse(readOutputText(payload)), { assessmentMethod: 'semantic' });
    } catch (error) {
      console.error('Failed to parse Gemini analysis result', error);
      throw new Error('Gemini provider failed to return valid analysis data');
    }
  },
};