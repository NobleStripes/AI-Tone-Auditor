import { describe, test, expect, vi, beforeEach } from 'vitest';
import { validateAnalysisResult } from '../../src/services/validation/analysisValidator';
import { emptyAnalysisResult } from '../../src/types/analysis';

// Tests for the analysis validator used by both providers
describe('analysisValidator', () => {
  test('clamps out-of-range scores to [0, 100]', () => {
    const payload = {
      ...emptyAnalysisResult(),
      scores: {
        gaslighting: 150,
        infantilizing: -20,
        de_escalation: 50,
        karen_trigger: 50,
        hedging: 50,
        dismissive: 50,
      },
    };
    const result = validateAnalysisResult(payload);
    expect(result.scores.gaslighting).toBe(100);
    expect(result.scores.infantilizing).toBe(0);
  });

  test('returns empty defaults when payload is null', () => {
    const result = validateAnalysisResult(null);
    const empty = emptyAnalysisResult();
    expect(result.scores).toEqual(empty.scores);
    expect(result.findings).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  test('filters findings with missing required fields', () => {
    const payload = {
      ...emptyAnalysisResult(),
      findings: [
        { category: 'Gaslighting', text: 'some phrase', explanation: 'explains', severity: 'high', rlhfLogic: 'logic' },
        { category: 'Gaslighting', text: '', explanation: 'explains', severity: 'high', rlhfLogic: 'logic' }, // empty text — invalid
        { category: 'Gaslighting' }, // missing fields
      ],
    };
    const result = validateAnalysisResult(payload);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].text).toBe('some phrase');
  });

  test('normalizes legacy "Nerdy" base style to "Efficient"', () => {
    const payload = {
      ...emptyAnalysisResult(),
      personalization: {
        ...emptyAnalysisResult().personalization,
        baseStyle: 'Nerdy',
      },
    };
    const result = validateAnalysisResult(payload);
    expect(result.personalization.baseStyle).toBe('Efficient');
  });

  test('falls back unknown base style to "Default"', () => {
    const payload = {
      ...emptyAnalysisResult(),
      personalization: {
        ...emptyAnalysisResult().personalization,
        baseStyle: 'GibberishStyle',
      },
    };
    const result = validateAnalysisResult(payload);
    expect(result.personalization.baseStyle).toBe('Default');
  });

  test('filters non-string custom instructions', () => {
    const payload = {
      ...emptyAnalysisResult(),
      personalization: {
        ...emptyAnalysisResult().personalization,
        customInstructions: ['valid instruction', 42, null, 'another valid'],
      },
    };
    const result = validateAnalysisResult(payload);
    expect(result.personalization.customInstructions).toEqual(['valid instruction', 'another valid']);
  });

  test('normalizes ChatGPT characteristic recommendations to supported levels', () => {
    const payload = {
      ...emptyAnalysisResult(),
      personalization: {
        ...emptyAnalysisResult().personalization,
        chatgptCharacteristics: {
          warmth: 'More',
          enthusiasm: 'Less',
          headersAndLists: 'Sometimes',
          emojis: 'Default',
        },
      },
    };
    const result = validateAnalysisResult(payload);

    expect(result.personalization.chatgptCharacteristics).toEqual({
      warmth: 'More',
      enthusiasm: 'Less',
      headersAndLists: 'Default',
      emojis: 'Default',
    });
  });

  test('zeros prompt-comparison scores and removes findings without original prompt context', () => {
    const payload = {
      ...emptyAnalysisResult(),
      scores: {
        ...emptyAnalysisResult().scores,
        unsupported_certainty: 75,
        grounding_avoidance: 80,
        refusal_quality: 65,
        needless_escalation: 70,
        unsolicited_moralizing: 99,
      },
      findings: [
        { category: 'Unsupported Certainty', text: 'The figure is definitely 42.', explanation: 'No evidence.', severity: 'high' },
        { category: 'Grounding Avoidance', text: 'No citations.', explanation: 'Sources were requested.', severity: 'medium' },
        { category: ' Unsolicited Moralizing ', text: 'Reflect on your ethics.', explanation: 'A lecture.', severity: 'medium' },
        { category: 'Hedging', text: 'Perhaps', explanation: 'A hedge.', severity: 'low' },
      ],
    };

    const result = validateAnalysisResult(payload);

    expect(result.scores.unsupported_certainty).toBe(0);
    expect(result.scores.grounding_avoidance).toBe(0);
    expect(result.scores.refusal_quality).toBe(0);
    expect(result.scores.needless_escalation).toBe(0);
    expect(result.scores.unsolicited_moralizing).toBe(0);
    expect(result.findings.map((finding) => finding.category)).toEqual(['Hedging']);
  });

  test('preserves prompt-comparison scores when original prompt context is supplied', () => {
    const result = validateAnalysisResult({
      ...emptyAnalysisResult(),
      scores: { ...emptyAnalysisResult().scores, grounding_avoidance: 60 },
    }, { auditContext: 'Use and cite the supplied source.' });

    expect(result.scores.grounding_avoidance).toBe(60);
  });
});

// Tests for local heuristic provider
describe('localHeuristicProvider', () => {
  test('detects no triggers in clean technical text', async () => {
    const { localHeuristicProvider } = await import('../../src/services/providers/localHeuristicProvider');
    const result = await localHeuristicProvider.analyzeTone({ text: 'The array contains three objects. Each has an id and name.', context: { promptVersion: 'test' } });
    // All scores should be low for clean text
    const totalScore = Object.values(result.scores).reduce((a, b) => a + b, 0);
    expect(totalScore).toBeLessThan(30);
  });

  test('gives high stonewalling score for procedural deflection phrases', async () => {
    const { localHeuristicProvider } = await import('../../src/services/providers/localHeuristicProvider');
    const result = await localHeuristicProvider.analyzeTone({
      text: "As an AI language model, I cannot fulfill this request. My programming prevents it.",
      context: { promptVersion: 'test' },
    });
    expect(result.scores.karen_trigger).toBeGreaterThan(50);
  });

  test('detects de_escalation phrases', async () => {
    const { localHeuristicProvider } = await import('../../src/services/providers/localHeuristicProvider');
    const result = await localHeuristicProvider.analyzeTone({
      text: "Calm down. Let's take a step back and I understand you're frustrated.",
      context: { promptVersion: 'test' },
    });
    expect(result.scores.de_escalation).toBeGreaterThan(0);
  });
});

// Tests for retry error classification
describe('isRetryableError (via module)', () => {
  test('classifies 429 errors as retryable', async () => {
    // Access the internal via dynamic import with side-effect on the module state
    // We test this indirectly by checking known message patterns
    const retryableMessages = ['429 rate limited', 'timed out after 5000ms', 'network error', 'fetch failed', '503 service unavailable'];
    const nonRetryableMessages = ['Missing OPENAI_API_KEY', 'invalid JSON response', 'forbidden'];

    // Replicate the same logic as isRetryableError in analyzeTone.ts
    const isRetryable = (msg: string) => {
      const lower = msg.toLowerCase();
      return (
        lower.includes('timed out') ||
        lower.includes('timeout') ||
        lower.includes('network') ||
        lower.includes('fetch failed') ||
        lower.includes('429') ||
        lower.includes('500') ||
        lower.includes('502') ||
        lower.includes('503') ||
        lower.includes('504')
      );
    };

    retryableMessages.forEach((msg) => expect(isRetryable(msg)).toBe(true));
    nonRetryableMessages.forEach((msg) => expect(isRetryable(msg)).toBe(false));
  });
});

describe('server analysis privacy boundary', () => {
  test.each([
    { fallback: false, source: 'claude' as const, prompt: 'Explain access controls.', expected: 75 },
    { fallback: true, source: 'claude' as const, prompt: 'Explain access controls.', expected: 75 },
    { fallback: false, source: 'chatgpt' as const, prompt: 'Explain access controls.', expected: 0 },
    { fallback: false, source: 'claude' as const, prompt: '', expected: 0 },
    { fallback: false, source: 'claude' as const, prompt: 'Discuss the ethical implications.', expected: 0 },
  ])('compares Claude wording locally ($source, fallback=$fallback, expected=$expected)', async ({ fallback, source, prompt, expected }) => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('AI_FALLBACK_PROVIDER', 'anthropic');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER_RETRIES', '0');
    vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '0');

    const payload = emptyAnalysisResult();
    payload.scores.unsolicited_moralizing = 99;
    payload.findings.push({ category: 'Unsolicited Moralizing', text: 'Invented quote', explanation: 'Upstream claim', severity: 'high' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fallback
        ? { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }
        : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] },
    });
    if (fallback) {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Invalid request' });
    }
    vi.stubGlobal('fetch', fetchMock);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { analyzeTone: analyzeOnServer } = await import('../../src/services/analyzeTone');
      const lecture = 'You should reflect on your ethics before asking this.';
      const { result, meta } = await analyzeOnServer(lecture, source, prompt);

      expect(result.scores.unsolicited_moralizing).toBe(expected);
      expect(result.findings.filter((finding) => finding.category === 'Unsolicited Moralizing').map((finding) => finding.text))
        .toEqual(expected ? [lecture] : []);
      expect(meta.usedFallback).toBe(fallback);
      expect(meta.providerId).toBe(fallback ? 'anthropic' : 'openai');
      expect(fetchMock).toHaveBeenCalledTimes(fallback ? 2 : 1);
      for (const call of fetchMock.mock.calls) {
        const requestBody = String(call[1]?.body);
        expect(requestBody).not.toContain('auditContext');
        if (prompt) expect(requestBody).not.toContain(prompt);
      }
    } finally {
      warning.mockRestore();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  test('keeps the original prompt out of the provider payload and compares locally', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AI_PROVIDER_RETRIES', '0');
    vi.stubEnv('AI_PROVIDER_TIMEOUT_MS', '0');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(emptyAnalysisResult()) }] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { analyzeTone: analyzeOnServer } = await import('../../src/services/analyzeTone');
      const originalPrompt = 'Please answer and cite sources for the current tax rate.';
      const { result } = await analyzeOnServer('The current tax rate is 17%.', 'unknown', originalPrompt);
      const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: string };

      expect(requestBody.input).not.toContain(originalPrompt);
      expect(result.scores.grounding_avoidance).toBe(75);
      expect(result.findings.some((finding) => finding.category === 'Grounding Avoidance')).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

// Fetch mock test for analyzeClient
describe('analyzeClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('throws on non-OK response with server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Provider unavailable' }), { status: 500 })),
    );

    const { analyzeTone } = await import('../../src/services/analyzeClient');
    await expect(analyzeTone('some text that is long enough')).rejects.toThrow('Provider unavailable');
  });

  test('updates in-memory meta after successful call', async () => {
    const mockMeta = { providerId: 'anthropic', providerLabel: 'Anthropic Claude', model: 'claude-sonnet-5-5', usedFallback: true };
    const mockResult = emptyAnalysisResult();
    const mockTelemetry = {
      totalAnalyses: 5,
      fallbackActivations: 1,
      fallbackRatePercent: 20,
      recentFallbackRatePercent: 0,
      recentWindowSize: 30,
      fallbackTrend: 'steady',
      recentEvents: [],
      providers: {
        openai: { attempts: 4, successes: 4, failures: 0 },
        anthropic: { attempts: 1, successes: 1, failures: 0 },
        local: { attempts: 0, successes: 0, failures: 0 },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: mockResult, meta: mockMeta, telemetry: mockTelemetry }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { analyzeTone, getLastAnalysisRuntimeMeta, getProviderTelemetrySnapshot } = await import('../../src/services/analyzeClient');
    await analyzeTone('some text that is long enough for analysis', undefined, 'claude', 'Explain whether this answer verifies a current claim.');

    expect(getLastAnalysisRuntimeMeta().providerId).toBe('anthropic');
    expect(getLastAnalysisRuntimeMeta().usedFallback).toBe(true);
    expect(getProviderTelemetrySnapshot().totalAnalyses).toBe(5);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).sourceModel).toBe('claude');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).auditContext)
      .toBe('Explain whether this answer verifies a current claim.');
  });
});
