import type { ProviderId } from '../../types/provider';

const RECENT_WINDOW_SIZE = 30;

type FallbackTrend = 'up' | 'down' | 'steady';

interface AnalysisEvent {
  timestamp: number;
  usedFallback: boolean;
  primaryProvider: ProviderId;
  finalProvider: ProviderId;
}

interface ProviderCounters {
  attempts: number;
  successes: number;
  failures: number;
}

interface ProviderTelemetryState {
  totalAnalyses: number;
  fallbackActivations: number;
  providers: Record<ProviderId, ProviderCounters>;
  recentEvents: AnalysisEvent[];
}

export interface ProviderTelemetrySnapshot {
  totalAnalyses: number;
  fallbackActivations: number;
  fallbackRatePercent: number;
  recentFallbackRatePercent: number;
  recentWindowSize: number;
  fallbackTrend: FallbackTrend;
  recentEvents: AnalysisEvent[];
  providers: Record<ProviderId, ProviderCounters>;
}

const initialProviderCounters = (): Record<ProviderId, ProviderCounters> => ({
  openai: { attempts: 0, successes: 0, failures: 0 },
  anthropic: { attempts: 0, successes: 0, failures: 0 },
  local: { attempts: 0, successes: 0, failures: 0 },
});

const state: ProviderTelemetryState = {
  totalAnalyses: 0,
  fallbackActivations: 0,
  providers: initialProviderCounters(),
  recentEvents: [],
};

function computeFallbackRate(events: AnalysisEvent[]): number {
  if (events.length === 0) {
    return 0;
  }

  const fallbackCount = events.filter((event) => event.usedFallback).length;
  return Math.round((fallbackCount / events.length) * 100);
}

function computeFallbackTrend(events: AnalysisEvent[]): FallbackTrend {
  if (events.length < 6) {
    return 'steady';
  }

  const midpoint = Math.floor(events.length / 2);
  const previousRate = computeFallbackRate(events.slice(0, midpoint));
  const recentRate = computeFallbackRate(events.slice(midpoint));
  const delta = recentRate - previousRate;

  if (delta >= 8) {
    return 'up';
  }

  if (delta <= -8) {
    return 'down';
  }

  return 'steady';
}

function readProvider(id: ProviderId): ProviderCounters {
  return state.providers[id];
}

export function recordProviderAttempt(id: ProviderId): void {
  readProvider(id).attempts += 1;
}

export function recordProviderSuccess(id: ProviderId): void {
  readProvider(id).successes += 1;
}

export function recordProviderFailure(id: ProviderId): void {
  readProvider(id).failures += 1;
}

export function recordAnalysisCompleted(event: {
  usedFallback: boolean;
  primaryProvider: ProviderId;
  finalProvider: ProviderId;
}): void {
  state.totalAnalyses += 1;
  if (event.usedFallback) {
    state.fallbackActivations += 1;
  }

  state.recentEvents.push({
    timestamp: Date.now(),
    usedFallback: event.usedFallback,
    primaryProvider: event.primaryProvider,
    finalProvider: event.finalProvider,
  });

  if (state.recentEvents.length > RECENT_WINDOW_SIZE) {
    state.recentEvents = state.recentEvents.slice(-RECENT_WINDOW_SIZE);
  }
}

export function resetProviderTelemetry(): void {
  state.totalAnalyses = 0;
  state.fallbackActivations = 0;
  state.providers = initialProviderCounters();
  state.recentEvents = [];
}

export function getProviderTelemetrySnapshot(): ProviderTelemetrySnapshot {
  const fallbackRatePercent = state.totalAnalyses > 0
    ? Math.round((state.fallbackActivations / state.totalAnalyses) * 100)
    : 0;
  const recentFallbackRatePercent = computeFallbackRate(state.recentEvents);
  const fallbackTrend = computeFallbackTrend(state.recentEvents);

  return {
    totalAnalyses: state.totalAnalyses,
    fallbackActivations: state.fallbackActivations,
    fallbackRatePercent,
    recentFallbackRatePercent,
    recentWindowSize: state.recentEvents.length,
    fallbackTrend,
    recentEvents: state.recentEvents.map((event) => ({ ...event })),
    providers: {
      openai: { ...state.providers.openai },
      anthropic: { ...state.providers.anthropic },
      local: { ...state.providers.local },
    },
  };
}
