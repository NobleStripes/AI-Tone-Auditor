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