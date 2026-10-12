import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiAccessPanel, ApiAccessProvider, useApiAccess } from '../../src/components/ApiAccess';
import { apiHeaders, rejectApiAccess, setApiAccessKey } from '../../src/services/apiAccess';
import { ComparisonWorkspace } from '../../src/components/ComparisonWorkspace';
import { ApiRequestError, compareToneResponses } from '../../src/services/analyzeClient';
import { emptyAnalysisResult } from '../../src/types/analysis';
import { DEFAULT_LOCAL_RUNTIME_META } from '../../src/types/provider';
import App from '../../src/App';
import { getProviderTelemetrySnapshot } from '../../src/services/analyzeClient';
import { PrivacyProvider } from '../../src/components/PrivacyContext';

vi.mock('../../src/services/analyzeClient', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/services/analyzeClient')>(), compareToneResponses: vi.fn(),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null, RadarChart: () => null, PolarGrid: () => null, PolarAngleAxis: () => null, Radar: () => null,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  setApiAccessKey('');
});
function AuditGate() {
  const access = useApiAccess();
  return <button disabled={access.locked}>Run protected audit</button>;
}

test('discovery gates auditing, verifies keys, clears the input, and relocks without storing credentials', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ requiresKey: true })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ApiAccessProvider><ApiAccessPanel /><AuditGate /></ApiAccessProvider>);
  expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeDisabled();
  await screen.findByLabelText('API access key');
  fireEvent.change(screen.getByLabelText('API access key'), { target: { value: 'memory-only-operator-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock API' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeEnabled());
  expect(apiHeaders().Authorization).toBe('Bearer memory-only-operator-key');
  expect(JSON.stringify(localStorage)).not.toContain('memory-only-operator-key');
  expect(JSON.stringify(sessionStorage)).not.toContain('memory-only-operator-key');
  expect(fetchMock.mock.calls[1]).toEqual(['/api/access/check', {
    headers: { Authorization: 'Bearer memory-only-operator-key' }, signal: expect.any(AbortSignal),
  }]);
  fireEvent.click(screen.getByRole('button', { name: 'Lock API' }));
  expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeDisabled();
  expect(screen.getByLabelText('API access key')).toHaveValue('');
  expect(apiHeaders()).not.toHaveProperty('Authorization');
});

test('local no-key discovery enables auditing and failed discovery remains locked with an explicit retry', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('Server unavailable'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ requiresKey: false })));
  vi.stubGlobal('fetch', fetchMock);
  render(<ApiAccessProvider><ApiAccessPanel /><AuditGate /></ApiAccessProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
  expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry API access check' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeEnabled());
});

test('bad unlock keys stay locked and authentication rejection clears a previously accepted key', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ requiresKey: true })))
    .mockResolvedValueOnce(new Response('Secret diagnostic', { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ApiAccessProvider><ApiAccessPanel /><AuditGate /></ApiAccessProvider>);
  const field = await screen.findByLabelText('API access key');
  fireEvent.change(field, { target: { value: 'bad-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock API' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('API access key rejected.');
  expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeDisabled();
  expect(field).toHaveValue('');
  fireEvent.change(field, { target: { value: 'accepted-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock API' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeEnabled());
  act(() => rejectApiAccess());
  expect(apiHeaders()).not.toHaveProperty('Authorization');
  expect(screen.getByRole('button', { name: 'Run protected audit' })).toBeDisabled();
});

test('comparison starts disabled while locked and renders budget partials without reporting successful completion', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async url =>
    new Response(JSON.stringify(String(url) === '/api/processing' ? { primary: 'local', fallback: null } : { requiresKey: false }))));
  const completed = vi.fn();
  render(<ApiAccessProvider><PrivacyProvider><ApiAccessPanel /><ComparisonWorkspace active onBusyChange={vi.fn()} onCompleted={completed} /></PrivacyProvider></ApiAccessProvider>);
  const run = screen.getByRole('button', { name: 'Compare responses' });
  expect(run).toBeDisabled();
  await waitFor(() => expect(run).toBeEnabled());
  const prompt = 'Explain this result.';
  const responses = [
    { id: 'response-1', sourceModel: 'chatgpt' as const, text: 'First valid response.' },
    { id: 'response-2', sourceModel: 'claude' as const, text: 'Second valid response.' },
  ];
  const comparison = {
    sessionId: 'partial-session', rubricVersion: 'test', localRuleVersion: 'test', items: [
      { ...responses[0], status: 'completed' as const, analysis: { result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META } },
      { ...responses[1], status: 'failed' as const, error: 'No result; budget exhausted.' },
    ],
  };
  vi.mocked(compareToneResponses).mockRejectedValue(new ApiRequestError(429, 'BUDGET_EXHAUSTED', 60, comparison));
  fireEvent.change(screen.getByLabelText('Original prompt (shared)'), { target: { value: prompt } });
  responses.forEach((response, index) => fireEvent.change(screen.getByLabelText(`Response ${index + 1} text`), { target: { value: response.text } }));
  fireEvent.click(run);
  await screen.findByText(/External audit budget exhausted/);
  expect(screen.getByRole('heading', { name: 'Observed differences' })).toBeInTheDocument();
  expect(screen.getByText(/No result; budget exhausted/)).toBeInTheDocument();
  expect(completed).not.toHaveBeenCalled();
});

test('the real application suppresses auto/manual audits until explicit unlock and clears access on unmount', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ requiresKey: true })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ primary: 'local', fallback: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      result: emptyAnalysisResult(), meta: DEFAULT_LOCAL_RUNTIME_META, telemetry: getProviderTelemetrySnapshot(),
    })));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<App />);
  fireEvent.change(screen.getByLabelText('AI response to audit'), { target: { value: 'A long enough response for automatic auditing.' } });
  await screen.findByLabelText('API access key');
  expect(screen.getByRole('button', { name: 'Run Audit' })).toBeDisabled();
  expect(screen.getByText('API access is locked. Unlock it before auditing.')).toBeInTheDocument();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
  expect(fetchMock).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('API access key'), { target: { value: 'in-memory-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock API' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4), { timeout: 3000 });
  expect(fetchMock.mock.calls[3][0]).toBe('/api/analyze');
  expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({ Authorization: 'Bearer in-memory-key' });
  expect(JSON.stringify(localStorage)).not.toContain('in-memory-key');
  view.unmount();
  expect(apiHeaders()).not.toHaveProperty('Authorization');
});
