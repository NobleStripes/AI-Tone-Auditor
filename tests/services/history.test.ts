import { describe, expect, test } from 'vitest';
import { parseAuditHistory, type HistoryEntry } from '../../src/types/history';
import { emptyAnalysisResult } from '../../src/types/analysis';

describe('audit history', () => {
  const entry: HistoryEntry = {
    id: 'audit-1', title: 'A response...', timestamp: 123,
    sourceModel: 'claude', responseText: 'A complete response, not its truncated title.',
    data: emptyAnalysisResult(),
    meta: { providerId: 'openai', providerLabel: 'OpenAI', model: 'test', usedFallback: false },
  };

  test('round-trips response, source, result and metadata without prompt context', () => {
    expect(parseAuditHistory(JSON.stringify([entry]))).toEqual([entry]);
    expect(JSON.stringify(entry)).not.toContain('auditContext');
  });

  test('retains old results without pretending the title is the response', () => {
    expect(parseAuditHistory(JSON.stringify([{ id: entry.id, title: entry.title, timestamp: entry.timestamp, data: entry.data }]))[0])
      .toEqual({ ...entry, responseText: '', sourceModel: 'unknown', meta: null });
  });

  test('normalizes malformed nested data and fills missing score keys', () => {
    const restored = parseAuditHistory(JSON.stringify([{ ...entry, data: {
      scores: { gaslighting: 999, hedging: -5 },
      findings: [null, { category: 'Hedging', text: 'perhaps', severity: 'invalid' }],
      personalization: { baseStyle: 'Nerdy', customInstructions: [42, 'Be direct.'] },
      contextAnalysis: { score: 101, heatmap: [null, { text: 'perhaps', density: 'invalid' }] },
      recommendations: [null, { title: 42 }], euphemisms: 'invalid',
    } }]))[0];
    expect(restored.data.scores.gaslighting).toBe(100);
    expect(restored.data.scores.hedging).toBe(0);
    expect(restored.data.scores.unsolicited_moralizing).toBe(0);
    expect(restored.data.findings[0].severity).toBe('low');
    expect(restored.data.personalization.baseStyle).toBe('Efficient');
    expect(restored.data.personalization.chatgptCharacteristics.warmth).toBe('Default');
    expect(restored.data.personalization.customInstructions).toEqual(['Be direct.']);
    expect(restored.data.contextAnalysis.score).toBe(100);
    expect(restored.data.contextAnalysis.heatmap[0].density).toBe('low');
    expect(restored.data.recommendations[0].title).toBe('Recommendation');
    expect(restored.data.euphemisms).toEqual([]);
  });

  test('does not restore context-dependent claims without original-prompt context', () => {
    const data = emptyAnalysisResult();
    data.scores.unsolicited_moralizing = 75;
    data.scores.refusal_quality = 100;
    data.findings = [{ category: 'Unsolicited Moralizing', text: 'Reflect on your ethics.', explanation: 'Saved claim', severity: 'medium' }];
    const restored = parseAuditHistory(JSON.stringify([{ ...entry, data, auditContext: 'Legacy private prompt' }]))[0];
    expect(restored.data.scores.unsolicited_moralizing).toBe(0);
    expect(restored.data.scores.refusal_quality).toBe(0);
    expect(restored.data.findings).toEqual([]);
    expect(restored).not.toHaveProperty('auditContext');
  });

  test.each([null, '{bad', '{}', '[null, 42, {}]'])('handles invalid storage: %s', (stored) => {
    expect(parseAuditHistory(stored)).toEqual([]);
  });
});