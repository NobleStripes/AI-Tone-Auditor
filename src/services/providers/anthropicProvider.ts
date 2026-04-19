import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('Anthropic response did not contain parseable JSON.');
  }
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  model: getAnthropicModel(),
  async analyzeTone(input: AnalyzeToneInput) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY for Anthropic provider');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: getAnthropicModel(),
        max_tokens: 1600,
        temperature: 0.2,
        system: 'You are a tone analysis engine. Return valid JSON only and match the requested schema fields.',
        messages: [
          {
            role: 'user',
            content: buildToneAnalysisPrompt(input.text),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = payload.content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n') || '';

    try {
      return validateAnalysisResult(extractJson(text));
    } catch (error) {
      console.error('Failed to parse Anthropic analysis result', error);
      throw new Error('Anthropic provider failed to return valid analysis data');
    }
  },
};
