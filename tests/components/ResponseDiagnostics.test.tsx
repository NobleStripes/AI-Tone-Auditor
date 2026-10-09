import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ResponseDiagnostics } from '../../src/components/ResponseDiagnostics';
import { FindingCard } from '../../src/components/FindingCard';
import { ExportButton } from '../../src/components/ExportButton';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { applyLocalPromptComparison } from '../../src/services/localPromptComparison';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RadarChart: ({ data }: { data: { subject: string }[] }) => <div data-testid="risk-radar">{data.map(({ subject }) => <span key={subject}>{subject}</span>)}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  Radar: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('groups diagnostics, displays assessed zero, and excludes skipped and quality metrics from risk chart', async () => {
  const baseline = await localHeuristicProvider.analyzeTone({ text: 'A factual answer.', context: { promptVersion: 'test' } });
  const result = applyLocalPromptComparison(baseline, 'Here is the answer [1].', 'Answer and cite sources.', 'claude');
  render(<ResponseDiagnostics result={result} />);
  for (const name of ['Communication', 'Contextual behavior', 'Epistemic behavior', 'Response quality']) {
    expect(screen.getByRole('region', { name })).toBeInTheDocument();
  }
  const radar = within(screen.getByTestId('risk-radar'));
  expect(radar.queryByText('Unsupported Certainty')).not.toBeInTheDocument();
  expect(radar.queryByText('Refusal Quality')).not.toBeInTheDocument();
  expect(radar.getByText('Grounding Avoidance')).toBeInTheDocument();
  expect(within(screen.getByTestId('diagnostic-grounding_avoidance')).getByText('0/100')).toBeInTheDocument();
  expect(within(screen.getByTestId('diagnostic-unsupported_certainty')).getByText('N/A — not assessed')).toBeInTheDocument();
  expect(within(screen.getByTestId('diagnostic-refusal_quality')).getByText('N/A — not applicable')).toBeInTheDocument();
  expect(screen.queryByText('75%')).not.toBeInTheDocument();
});

test('missing context does not look like a clean zero and is excluded from risk chart', async () => {
  const result = await localHeuristicProvider.analyzeTone({ text: 'A factual answer.', context: { promptVersion: 'test' } });
  render(<ResponseDiagnostics result={result} />);
  expect(within(screen.getByTestId('diagnostic-grounding_avoidance')).getByText('Insufficient context')).toBeInTheDocument();
  expect(within(screen.getByTestId('risk-radar')).queryByText('Grounding Avoidance')).not.toBeInTheDocument();
});

test('assessed zero quality is not N/A and heuristic risk 75 is never displayed as a percent', () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), 'Calm down.', 'Explain the code.', 'claude');
  result.assessments.refusal_quality = { status: 'assessed', reason: 'A recorded quality assessment.', confidence: 'low', method: 'semantic' };
  render(<ResponseDiagnostics result={result} />);
  const quality = within(screen.getByTestId('diagnostic-refusal_quality'));
  expect(quality.getByText('0/100')).toBeInTheDocument();
  expect(quality.queryByText(/N\/A/)).not.toBeInTheDocument();
  const risk = within(screen.getByTestId('diagnostic-needless_escalation'));
  expect(risk.getByText('75/100')).toBeInTheDocument();
  expect(risk.getByText(/Heuristic risk index/)).toBeInTheDocument();
  expect(risk.getByText(/Match confidence: medium/)).toBeInTheDocument();
});

test('a high severity finding can have low evidence confidence', () => {
  render(<FindingCard index={0} finding={{
    category: 'Hedging', text: 'Perhaps', explanation: 'A tentative interpretation.',
    severity: 'high', confidence: 'low', method: 'semantic',
  }} />);
  expect(screen.getByText('high SEVERITY')).toBeInTheDocument();
  expect(screen.getByText('Evidence confidence: low')).toBeInTheDocument();
});

test('Markdown exports state, heuristic index and separate finding confidence', async () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), 'Calm down.', 'Explain the code.', 'claude');
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<ExportButton result={result} />);
  await user.click(screen.getByRole('button', { name: 'Copy result as Markdown' }));
  const markdown = writeText.mock.calls[0][0];
  expect(markdown).toContain('## Response Diagnostics');
  expect(markdown).toContain('### Epistemic behavior');
  expect(markdown).toContain('75/100; assessment state: assessed; heuristic risk index');
  expect(markdown).toContain('match confidence: medium');
  expect(markdown).toContain('Unsupported Certainty (unsupported_certainty)**: N/A — not assessed');
  expect(markdown).toContain('(medium severity)');
  expect(markdown).not.toContain('75%');
});

test('the JSON download preserves assessment states and finding confidence', async () => {
  const result = applyLocalPromptComparison(emptyAnalysisResult(), 'Calm down.', 'Explain the code.', 'claude');
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:diagnostics-export');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const user = userEvent.setup();
  render(<ExportButton result={result} />);
  await user.click(screen.getByRole('button', { name: 'Export result as JSON' }));
  const blob = createObjectURL.mock.calls[0][0];
  expect(blob.type).toBe('application/json');
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Expected JSON text'));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const exported = JSON.parse(text);
  const { exportMetadata, ...exportedResult } = exported;
  expect(exportedResult).toEqual(result);
  expect(exportMetadata).toMatchObject({ schemaVersion: '1.1.0', auditorVersion: null, selectedSourceModel: 'unknown', originalPromptIncluded: false });
  expect(exported.assessments.needless_escalation).toMatchObject({ status: 'assessed', confidence: 'medium', method: 'lexical_rule' });
  expect(exported.assessments.unsupported_certainty.status).toBe('not_assessed');
  expect(exported.findings[0]).toMatchObject({ severity: 'medium', confidence: 'medium', method: 'lexical_rule' });
  expect(click).toHaveBeenCalledOnce();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:diagnostics-export');
});
