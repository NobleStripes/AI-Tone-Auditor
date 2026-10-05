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

  test('restores old category names using Bureaucratic Stonewalling', () => {
    const data = emptyAnalysisResult();
    data.scores.karen_trigger = 75;
    data.findings = [{ category: 'Karen Trigger', text: 'As an AI language model', explanation: 'Saved finding', severity: 'medium' }];
    const restored = parseAuditHistory(JSON.stringify([{ ...entry, data }]))[0];
    expect(restored.data.findings[0].category).toBe('Bureaucratic Stonewalling');
    expect(restored.data.scores.karen_trigger).toBe(75);
  });

  test('preserves legacy remediation, evidence and scores across a save/restore cycle', () => {
    const { stonewallingRemediation, ...personalization } = entry.data.personalization;
    const legacyData = {
      ...entry.data,
      scores: { ...entry.data.scores, karen_trigger: 73 },
      personalization: { ...personalization, karenRemediation: 'Explain the actual limit and next step.' },
      findings: [{
        category: ' Karen Triggers ', text: 'Calm down', explanation: 'Legacy evidence',
        severity: 'high', rlhfLogic: 'Legacy interpretation',
      }],
    };
    const restored = parseAuditHistory(JSON.stringify([{ ...entry, data: legacyData }]))[0];
    expect(restored.data.personalization.stonewallingRemediation).toBe(legacyData.personalization.karenRemediation);
    expect(restored.data.personalization).not.toHaveProperty('karenRemediation');
    expect(restored.data.scores.karen_trigger).toBe(73);
    expect(restored.data.findings).toEqual([{
      ...legacyData.findings[0], category: 'Bureaucratic Stonewalling',
      confidence: 'unknown', method: 'unrecorded',
    }]);
    expect(parseAuditHistory(JSON.stringify([restored]))).toEqual([restored]);
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
    expect(restored.data.assessments.unsolicited_moralizing.status).toBe('insufficient_context');
    expect(restored.data.assessments.refusal_quality.status).toBe('insufficient_context');
    expect(restored).not.toHaveProperty('auditContext');
  });

  test('retains recorded communication confidence but does not invent it for legacy scores', () => {
    const data = emptyAnalysisResult();
    data.scores.hedging = 0;
    data.assessments.hedging = {
      status: 'assessed', reason: 'Checked the wording.', confidence: 'low', method: 'semantic',
    };
    const restored = parseAuditHistory(JSON.stringify([{ ...entry, data }]))[0];
    expect(restored.data.assessments.hedging).toEqual(data.assessments.hedging);
    const { assessments, ...legacyData } = data;
    const legacy = parseAuditHistory(JSON.stringify([{ ...entry, data: legacyData }]))[0];
    expect(legacy.data.assessments.hedging.status).toBe('not_assessed');
    expect(legacy.data.assessments.hedging.confidence).toBe('unknown');
  });

  test.each([null, '{bad', '{}', '[null, 42, {}]'])('handles invalid storage: %s', (stored) => {
    expect(parseAuditHistory(stored)).toEqual([]);
  });
});