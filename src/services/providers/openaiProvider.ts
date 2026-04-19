import { buildToneAnalysisPrompt } from '../promptBuilder';
import { validateAnalysisResult } from '../validation/analysisValidator';
import type { AIProvider, AnalyzeToneInput } from '../../types/provider';

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function extractJsonFromContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Handle markdown code-fenced JSON payloads.
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]);
    }

    // Last-chance extraction for the first object-like payload.
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('OpenAI response did not contain parseable JSON.');
  }
}

function readMessageContent(payload: OpenAIChatResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
  }

  return '';
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getOpenAIModel(),
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a tone analysis engine. Output valid JSON that matches the requested structure.',
          },
          {
            role: 'user',
            content: buildToneAnalysisPrompt(input.text),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as OpenAIChatResponse;
    const content = readMessageContent(payload);

    try {
      const parsed = extractJsonFromContent(content);
      return validateAnalysisResult(parsed);
    } catch (error) {
      console.error('Failed to parse OpenAI analysis result', error);
      throw new Error('OpenAI provider failed to return valid analysis data');
    }
  },
};
