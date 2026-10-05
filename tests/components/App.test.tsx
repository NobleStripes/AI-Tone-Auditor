import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import App from '../../src/App';
import { emptyAnalysisResult } from '../../src/types/analysis';
import type { HistoryEntry } from '../../src/types/history';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RadarChart: ({ data }: { data: { subject: string }[] }) => <div data-testid="risk-radar">{data.map(({ subject }) => <span key={subject}>{subject}</span>)}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  Radar: () => null,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('saved audit presentation', () => {
  test.each([0, 100])('restores full response without prompt context and separates refusal quality (%s)', async (quality) => {
    const data = emptyAnalysisResult();
    data.scores.refusal_quality = quality;
    for (const key of ['gaslighting', 'infantilizing', 'hedging'] as const) {
      data.assessments[key] = { status: 'assessed', reason: 'Checked response wording.', confidence: 'medium', method: 'semantic' };
    }
    data.assessments.refusal_quality = { status: 'assessed', reason: 'Compared to the original prompt.', confidence: 'medium', method: 'lexical_rule' };
    const entry: HistoryEntry = {
      id: 'saved', title: 'Saved response...', timestamp: 123, sourceModel: 'claude',
      responseText: 'This is the full response, not a truncated title.', data,
      meta: { providerId: 'openai', providerLabel: 'OpenAI', model: 'test', usedFallback: false },
    };
    localStorage.setItem('audit-history', JSON.stringify([entry]));
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Auto: ON/ }));
    await user.type(screen.getByRole('textbox', { name: 'Original prompt and source context (optional)' }), 'Private context');
    await user.click(screen.getByRole('button', { name: 'Load audit: Saved response...' }));

    expect(screen.getByPlaceholderText('Paste the AI response here for tone auditing...')).toHaveValue(entry.responseText);
    expect(screen.getByRole('textbox', { name: 'Original prompt and source context (optional)' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Source model' })).toHaveValue('claude');
    expect(within(screen.getByTestId('risk-radar')).queryByText('Refusal Quality')).not.toBeInTheDocument();
    const qualityPanel = screen.getByRole('region', { name: 'Response quality' });
    expect(within(qualityPanel).getByText('Refusal Quality')).toBeInTheDocument();
    expect(within(qualityPanel).getByText('Insufficient context')).toBeInTheDocument();
    expect(screen.getByText('Response Diagnostics')).toBeInTheDocument();
  });
});