import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnalysisModeIndicator } from '../../src/components/AnalysisModeIndicator';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';

afterEach(cleanup);

test('does not claim to know server configuration before a successful audit', () => {
  render(<AnalysisModeIndicator meta={null} />);
  expect(screen.getByText('Awaiting audit (local by default)')).toHaveAttribute('title', expect.stringContaining('configuration'));
});

test('clearly distinguishes local heuristic results from semantic providers', () => {
  const { rerender } = render(<AnalysisModeIndicator meta={DEFAULT_LOCAL_RUNTIME_META} />);
  expect(screen.getByText('Local heuristic')).toHaveAttribute('title', expect.stringContaining('local lexical rules'));
  rerender(<AnalysisModeIndicator meta={{ providerId: 'openai', providerLabel: 'OpenAI', model: 'test', usedFallback: false }} />);
  expect(screen.getByText('Semantic provider')).toHaveAttribute('title', expect.stringContaining('sent to its API'));
});

test('a local fallback result does not promise that the primary external provider was untouched', () => {
  render(<AnalysisModeIndicator meta={{ ...DEFAULT_LOCAL_RUNTIME_META, usedFallback: true }} />);
  expect(screen.getByText('Local heuristic')).toHaveAttribute('title', expect.stringContaining('primary provider was also attempted'));
});
