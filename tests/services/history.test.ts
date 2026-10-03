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

  test.each([null, '{bad', '{}', '[null, 42, {}]'])('handles invalid storage: %s', (stored) => {
    expect(parseAuditHistory(stored)).toEqual([]);
  });
});