import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProviderTelemetrySnapshot,
  recordAnalysisCompleted,
  resetProviderTelemetry,
} from '../../src/services/telemetry/providerTelemetry';

test('computes recent fallback trend from rolling telemetry window', () => {
  resetProviderTelemetry();

  // First half has no fallback; second half has many fallbacks.
  for (let i = 0; i < 6; i += 1) {
    recordAnalysisCompleted({
      usedFallback: false,
      primaryProvider: 'openai',
      finalProvider: 'openai',
    });
  }

  for (let i = 0; i < 6; i += 1) {
    recordAnalysisCompleted({
      usedFallback: true,
      primaryProvider: 'openai',
      finalProvider: 'anthropic',
    });
  }

  const snapshot = getProviderTelemetrySnapshot();
  assert.equal(snapshot.totalAnalyses, 12);
  assert.equal(snapshot.fallbackActivations, 6);
  assert.equal(snapshot.recentWindowSize, 12);
  assert.equal(snapshot.recentFallbackRatePercent, 50);
  assert.equal(snapshot.fallbackTrend, 'up');
});

test('keeps only rolling window events', () => {
  resetProviderTelemetry();

  for (let i = 0; i < 40; i += 1) {
    recordAnalysisCompleted({
      usedFallback: i % 2 === 0,
      primaryProvider: 'openai',
      finalProvider: i % 2 === 0 ? 'anthropic' : 'openai',
    });
  }

  const snapshot = getProviderTelemetrySnapshot();
  assert.equal(snapshot.totalAnalyses, 40);
  assert.equal(snapshot.recentWindowSize, 30);
});
