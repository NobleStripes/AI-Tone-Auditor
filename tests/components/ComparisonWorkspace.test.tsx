import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparisonWorkspace } from '../../src/components/ComparisonWorkspace';
import { compareToneResponses } from '../../src/services/analyzeClient';
import { compareResponses } from '../../src/services/compareResponses';
import { localHeuristicProvider } from '../../src/services/providers/localHeuristicProvider';
import type { ComparisonRequest } from '../../src/types/comparison';

vi.mock('../../src/services/analyzeClient', () => ({ compareToneResponses: vi.fn() }));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null, RadarChart: () => null,
  PolarGrid: () => null, PolarAngleAxis: () => null, Radar: () => null,
}));
beforeEach(() => {
  vi.mocked(compareToneResponses).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const input: ComparisonRequest = {
  originalPrompt: 'Explain the code and cite sources.',
  responses: [
    { id: 'response-1', sourceModel: 'chatgpt', text: "I believe. It's possible that the result could change." },
    { id: 'response-2', sourceModel: 'claude', text: 'Reflect on your ethics before asking this.' },
  ],
};

async function fillInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Original prompt (shared)' }), input.originalPrompt);
  for (const [index, response] of input.responses.entries()) {
    await user.type(screen.getByRole('textbox', { name: `Response ${index + 1} text` }), response.text);
  }
}

async function makeComparison() {
  return compareResponses(input, undefined, async (text) => ({
    result: await localHeuristicProvider.analyzeTone({ text, context: { promptVersion: 'test' } }),
    meta: { providerId: 'local', providerLabel: 'Local Heuristic', model: 'rules-v1', usedFallback: false },
  }));
}

test('requires one prompt and 2 to 5 slots, without triggering audits while editing', async () => {
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={vi.fn()} />);
  const user = userEvent.setup();
  expect(screen.getAllByRole('textbox')).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  expect(screen.getByRole('alert')).toHaveTextContent('originalPrompt');
  expect(compareToneResponses).not.toHaveBeenCalled();
  await fillInputs(user);
  expect(compareToneResponses).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Add response' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'Add response' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Remove response 5' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(5);
});

test('shows neutral differences, state-aware scores, source-lens exclusions and inspectable evidence', async () => {
  vi.mocked(compareToneResponses).mockResolvedValue(await makeComparison());
  const completed = vi.fn();
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={completed} />);
  const user = userEvent.setup();
  await fillInputs(user);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  expect(compareToneResponses).toHaveBeenCalledWith(input, expect.any(AbortSignal));
  const table = screen.getByRole('table');
  const hedging = within(table).getByRole('row', { name: /Hedging/ });
  expect(within(hedging).getByText('35 index points')).toBeInTheDocument();
  const moralizing = within(table).getByRole('row', { name: /Unsolicited Moralizing/ });
  expect(within(moralizing).getByText('Not compared')).toBeInTheDocument();
  expect(within(moralizing).getByText('75/100')).toBeInTheDocument();
  expect(screen.queryByText(/winner|best model|overall ranking:/i)).not.toBeInTheDocument();
  await user.click(screen.getByText('Inspect Claude response #2'));
  expect(screen.getByText(input.responses[1].text, { selector: 'p' })).toBeInTheDocument();
  expect(completed).toHaveBeenCalledOnce();
  await user.type(screen.getByRole('textbox', { name: 'Original prompt (shared)' }), ' Changed.');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('failed audits remain visible errors, not clean zero assessments', async () => {
  const result = await makeComparison();
  result.items[0] = { ...input.responses[0], status: 'failed', error: 'Auditor unavailable' };
  vi.mocked(compareToneResponses).mockResolvedValue(result);
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={vi.fn()} />);
  const user = userEvent.setup();
  await fillInputs(user);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  expect(screen.getByRole('alert')).toHaveTextContent('ChatGPT #1: Auditor unavailable');
  expect(screen.getAllByText('Audit failed')).toHaveLength(15);
});

test('canceling a batch explicitly reports cancellation and does not display partial results', async () => {
  vi.mocked(compareToneResponses).mockImplementation((_request, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
  }));
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={vi.fn()} />);
  const user = userEvent.setup();
  await fillInputs(user);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  expect(screen.getByRole('textbox', { name: 'Original prompt (shared)' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel comparison' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Comparison canceled');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('all-failed batches are explicitly unavailable rather than success-shaped results', async () => {
  const comparison = await makeComparison();
  comparison.items = input.responses.map((response) => ({ ...response, status: 'failed', error: 'Auditor unavailable' }));
  vi.mocked(compareToneResponses).mockResolvedValue(comparison);
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={vi.fn()} />);
  const user = userEvent.setup();
  await fillInputs(user);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  expect(screen.getByText('All response audits failed; no comparison is available.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('comparison JSON retains versions, results and response text but not the private prompt', async () => {
  const comparison = await makeComparison();
  vi.mocked(compareToneResponses).mockResolvedValue(comparison);
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:comparison');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={vi.fn()} />);
  const user = userEvent.setup();
  await fillInputs(user);
  await user.click(screen.getByRole('button', { name: 'Compare responses' }));
  await user.click(screen.getByRole('button', { name: 'Export comparison JSON' }));
  const blob = createObjectURL.mock.calls[0][0];
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Expected comparison JSON'));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  expect(JSON.parse(text)).toEqual(comparison);
  expect(text).not.toContain(input.originalPrompt);
  expect(JSON.parse(text)).not.toHaveProperty('originalPrompt');
});
