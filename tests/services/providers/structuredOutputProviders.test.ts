import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyAnalysisResult } from '../../../src/types/analysis';

const fetchMock = vi.fn<typeof fetch>();

function mockResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function readRequestBody(): Record<string, any> {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected provider request body to be a JSON string');
  }
  return JSON.parse(body) as Record<string, any>;
}

function expectStrictObjects(schema: Record<string, any>): void {
  if (schema.type === 'object') {
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    Object.values(schema.properties).forEach((property) => expectStrictObjects(property as Record<string, any>));
  }
  if (schema.type === 'array') {
    expectStrictObjects(schema.items as Record<string, any>);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('OPENAI_API_KEY', 'openai-test-key');
  vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna');
  vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-test-key');
  vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-5-5');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
  vi.stubEnv('GEMINI_MODEL', 'gemini-3.8-flash');
  vi.stubEnv('XAI_API_KEY', 'xai-test-key');
  vi.stubEnv('GROK_MODEL', 'grok-4.7');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('OpenAI structured output adapter', () => {
  test('uses Responses strict JSON Schema and validates output', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(emptyAnalysisResult()) }] }],
    }));

    const { openaiProvider } = await import('../../../src/services/providers/openaiProvider');
    const result = await openaiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } });
    const request = readRequestBody();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer openai-test-key',
      'Content-Type': 'application/json',
    });
    expect(request.model).toBe('gpt-6-luna');
    expect(request.text.format).toMatchObject({ type: 'json_schema', name: 'tone_analysis', strict: true });
    expectStrictObjects(request.text.format.schema);
    expect(result).toEqual(emptyAnalysisResult());
  });

  test.each([
    [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'incomplete'],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, 'refused'],
  ])('rejects incomplete or refused responses', async (payload, message) => {
    fetchMock.mockResolvedValue(mockResponse(payload));
    const { openaiProvider } = await import('../../../src/services/providers/openaiProvider');

    await expect(openaiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow(message);
  });

  test('rejects malformed structured output', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{invalid' }] }],
    }));
    const { openaiProvider } = await import('../../../src/services/providers/openaiProvider');

    await expect(openaiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('valid analysis data');
  });

  test('surfaces non-OK API responses', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: { message: 'Rate limited' } }, 429));
    const { openaiProvider } = await import('../../../src/services/providers/openaiProvider');

    await expect(openaiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('OpenAI request failed (429)');
  });
});

describe('Anthropic structured output adapter', () => {
  test('uses Messages JSON Schema output and validates text', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(emptyAnalysisResult()) }],
    }));

    const { anthropicProvider } = await import('../../../src/services/providers/anthropicProvider');
    const result = await anthropicProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } });
    const request = readRequestBody();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-api-key': 'anthropic-test-key',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    });
    expect(request.model).toBe('claude-sonnet-5-5');
    expect(request.temperature).toBeUndefined();
    expect(request.output_config.format).toMatchObject({ type: 'json_schema' });
    expectStrictObjects(request.output_config.format.schema);
    expect(result).toEqual(emptyAnalysisResult());
  });

  test.each([
    [{ stop_reason: 'refusal', content: [{ type: 'text', text: 'No' }] }, 'refused'],
    [{ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{}' }] }, 'token limit'],
  ])('rejects refused or truncated responses', async (payload, message) => {
    fetchMock.mockResolvedValue(mockResponse(payload));
    const { anthropicProvider } = await import('../../../src/services/providers/anthropicProvider');

    await expect(anthropicProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow(message);
  });

  test('rejects malformed structured output', async () => {
    fetchMock.mockResolvedValue(mockResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{invalid' }] }));
    const { anthropicProvider } = await import('../../../src/services/providers/anthropicProvider');

    await expect(anthropicProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('valid analysis data');
  });

  test('surfaces non-OK API responses', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: { message: 'Rate limited' } }, 429));
    const { anthropicProvider } = await import('../../../src/services/providers/anthropicProvider');

    await expect(anthropicProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('Anthropic request failed (429)');
  });
});

describe('Gemini structured output adapter', () => {
  test('uses Interactions structured output without storing input', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      status: 'completed',
      output: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(emptyAnalysisResult()) }] }],
    }));

    const { geminiProvider } = await import('../../../src/services/providers/geminiProvider');
    const result = await geminiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } });
    const request = readRequestBody();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-goog-api-key': 'gemini-test-key',
      'Content-Type': 'application/json',
    });
    expect(request.model).toBe('gemini-3.8-flash');
    expect(request.store).toBe(false);
    expect(request.response_format).toMatchObject({ type: 'text', mime_type: 'application/json' });
    expectStrictObjects(request.response_format.schema);
    expect(result).toEqual(emptyAnalysisResult());
  });

  test.each([
    [{ status: 'failed', output: [] }, 'valid analysis data'],
    [{ status: 'completed', output: [{ type: 'model_output', content: [{ type: 'text', text: '{invalid' }] }] }, 'valid analysis data'],
  ])('rejects failed or malformed interactions', async (payload, message) => {
    fetchMock.mockResolvedValue(mockResponse(payload));
    const { geminiProvider } = await import('../../../src/services/providers/geminiProvider');

    await expect(geminiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow(message);
  });

  test('surfaces non-OK API responses', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: { message: 'Rate limited' } }, 429));
    const { geminiProvider } = await import('../../../src/services/providers/geminiProvider');

    await expect(geminiProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('Gemini request failed (429)');
  });
});

describe('Grok structured output adapter', () => {
  test('uses Responses strict JSON Schema and validates output', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(emptyAnalysisResult()) }] }],
    }));

    const { grokProvider } = await import('../../../src/services/providers/grokProvider');
    const result = await grokProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } });
    const request = readRequestBody();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/responses');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer xai-test-key',
      'Content-Type': 'application/json',
    });
    expect(request.model).toBe('grok-4.7');
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: 'json_schema', name: 'tone_analysis', strict: true });
    expectStrictObjects(request.text.format.schema);
    expect(result).toEqual(emptyAnalysisResult());
  });

  test.each([
    [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'valid analysis data'],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, 'valid analysis data'],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{invalid' }] }] }, 'valid analysis data'],
  ])('rejects incomplete, refused, or malformed responses', async (payload, message) => {
    fetchMock.mockResolvedValue(mockResponse(payload));
    const { grokProvider } = await import('../../../src/services/providers/grokProvider');

    await expect(grokProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow(message);
  });

  test('surfaces non-OK API responses', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: { message: 'Rate limited' } }, 429));
    const { grokProvider } = await import('../../../src/services/providers/grokProvider');

    await expect(grokProvider.analyzeTone({ text: 'A neutral statement.', context: { promptVersion: 'test' } }))
      .rejects.toThrow('Grok request failed (429)');
  });
});

test('resolves Gemini and Grok provider IDs and defaults their fallback to OpenAI', async () => {
  const { resolveFallbackProvider, resolveProvider } = await import('../../../src/services/providers/factory');

  expect(resolveProvider('gemini').id).toBe('gemini');
  expect(resolveProvider('grok').id).toBe('grok');
  expect(resolveFallbackProvider('gemini').id).toBe('openai');
  expect(resolveFallbackProvider('grok').id).toBe('openai');
});